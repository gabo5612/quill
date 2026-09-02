import type { PMLooseNode } from './article-schema'

/**
 * Converts Markdown to ProseMirror nodes.
 *
 * The pipeline used to ask the model for ProseMirror JSON directly, via a
 * recursive Zod schema. Anthropic's structured outputs do not support
 * recursive schemas, so that request degraded into something the model filled
 * unreliably — section drafting failed even after four retries, and each
 * failure cost a whole article.
 *
 * Asking for Markdown instead removes the failure mode entirely: it is the
 * format these models write best, it needs no schema, and the conversion to
 * ProseMirror is deterministic code that cannot fail validation.
 *
 * Supports the subset the article schema allows: headings, paragraphs, bullet
 * and ordered lists (including nesting), blockquotes, code blocks, images,
 * horizontal rules, and inline bold / italic / code / links.
 */

type Mark = { type: string; attrs?: Record<string, unknown> }

const WORD_CHAR = /[\p{L}\p{N}]/u

/** Splits a line of Markdown into ProseMirror inline nodes. */
export function parseInline(text: string): PMLooseNode[] {
  const nodes: PMLooseNode[] = []
  let rest = text

  // Ordered longest-delimiter-first so `***` wins over `**` wins over `*`.
  // `intraWord` marks the underscore forms, which must not fire inside a word —
  // otherwise `snake_case_name` renders as "snake" + italic "case" + "name".
  const patterns: {
    re: RegExp
    build: (m: RegExpMatchArray) => PMLooseNode
    intraWord?: false
  }[] = [
    {
      // Images before links — the syntax differs only by the leading `!`.
      re: /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/,
      build: m => ({
        type: 'image',
        attrs: { src: m[2], alt: m[1], ...(m[3] ? { title: m[3] } : {}) },
      }),
    },
    {
      re: /^\[([^\]]+)\]\(([^)\s]+)\)/,
      build: m => ({
        type: 'text',
        text: m[1],
        marks: [{ type: 'link', attrs: { href: m[2] } }],
      }),
    },
    { re: /^`([^`]+)`/,        build: m => textWith(m[1], [{ type: 'code' }]) },
    { re: emphasis('\\*\\*\\*', '*'), build: m => textWith(m[1], [{ type: 'bold' }, { type: 'italic' }]) },
    { re: emphasis('___', '_'),       build: m => textWith(m[1], [{ type: 'bold' }, { type: 'italic' }]), intraWord: false },
    { re: emphasis('\\*\\*', '*'),    build: m => textWith(m[1], [{ type: 'bold' }]) },
    { re: emphasis('__', '_'),        build: m => textWith(m[1], [{ type: 'bold' }]), intraWord: false },
    { re: emphasis('\\*', '*'),       build: m => textWith(m[1], [{ type: 'italic' }]) },
    { re: emphasis('_', '_'),         build: m => textWith(m[1], [{ type: 'italic' }]), intraWord: false },
  ]

  let plain = ''
  const flush = () => {
    if (plain) {
      nodes.push({ type: 'text', text: plain })
      plain = ''
    }
  }

  while (rest.length > 0) {
    let matched = false
    const prevChar = text[text.length - rest.length - 1] ?? ''

    for (const { re, build, intraWord } of patterns) {
      if (intraWord === false && WORD_CHAR.test(prevChar)) continue
      const m = rest.match(re)
      if (m) {
        flush()
        nodes.push(build(m))
        rest = rest.slice(m[0].length)
        matched = true
        break
      }
    }

    if (!matched) {
      plain += rest[0]
      rest = rest.slice(1)
    }
  }

  flush()
  return nodes
}

/**
 * Emphasis delimiters only count when they hug the text: `a * b * c` is
 * multiplication, not italics. Requiring a non-space character on the inside
 * of both delimiters is what keeps prose containing stray asterisks or
 * underscores intact.
 */
function emphasis(delim: string, char: string): RegExp {
  const inner = `[^\\s${escapeClass(char)}]`
  return new RegExp(`^${delim}(${inner}(?:[^${escapeClass(char)}]*${inner})?)${delim}`)
}

function escapeClass(char: string): string {
  return char === '*' ? '\\*' : char
}

function textWith(text: string, marks: Mark[]): PMLooseNode {
  return { type: 'text', text, marks }
}

function paragraph(text: string): PMLooseNode {
  const content = parseInline(text)
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

const BULLET = /^\s*[-*+]\s+(.*)$/
const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/
const HEADING = /^(#{1,6})\s+(.*)$/
const QUOTE = /^>\s?(.*)$/
const FENCE = /^```(\w*)\s*$/
const RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/

function indentOf(line: string): number {
  const m = line.match(/^(\s*)/)
  // Two spaces or one tab per level, which is what the models emit.
  return m ? Math.floor(m[1].replace(/\t/g, '  ').length / 2) : 0
}

/**
 * Builds a (possibly nested) list starting at `start`.
 * Returns the node and the index of the first line after the list.
 */
function parseList(
  lines: string[],
  start: number,
  depth: number,
): { node: PMLooseNode; next: number } {
  const first = lines[start]
  const ordered = ORDERED.test(first)
  const items: PMLooseNode[] = []
  let i = start

  while (i < lines.length) {
    const line = lines[i]
    const bullet = line.match(BULLET)
    const number = line.match(ORDERED)
    if (!bullet && !number) break

    const level = indentOf(line)
    if (level < depth) break

    if (level > depth) {
      // Deeper item — attach the nested list to the previous item.
      const nested = parseList(lines, i, level)
      const parent = items[items.length - 1]
      if (parent && Array.isArray(parent.content)) parent.content.push(nested.node)
      else items.push({ type: 'listItem', content: [nested.node] })
      i = nested.next
      continue
    }

    // A list can't switch type mid-stream; a different marker starts a new list.
    if ((ordered && !number) || (!ordered && !bullet)) break

    const text = (bullet?.[1] ?? number?.[2] ?? '').trim()
    items.push({ type: 'listItem', content: [paragraph(text)] })
    i++
  }

  const attrs = ordered
    ? { start: Number(first.match(ORDERED)?.[1] ?? 1) || 1 }
    : undefined

  return {
    node: {
      type: ordered ? 'orderedList' : 'bulletList',
      ...(attrs ? { attrs } : {}),
      content: items,
    },
    next: i,
  }
}

export function markdownToProseMirror(markdown: string): PMLooseNode[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: PMLooseNode[] = []
  let i = 0
  let buffer: string[] = []

  const flushParagraph = () => {
    if (buffer.length) {
      out.push(paragraph(buffer.join(' ').trim()))
      buffer = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      flushParagraph()
      i++
      continue
    }

    const fence = line.match(FENCE)
    if (fence) {
      flushParagraph()
      const code: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) {
        code.push(lines[i])
        i++
      }
      i++ // closing fence
      out.push({
        type: 'codeBlock',
        ...(fence[1] ? { attrs: { language: fence[1] } } : {}),
        content: [{ type: 'text', text: code.join('\n') }],
      })
      continue
    }

    if (RULE.test(line)) {
      flushParagraph()
      out.push({ type: 'horizontalRule' })
      i++
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      flushParagraph()
      out.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: parseInline(heading[2].trim()),
      })
      i++
      continue
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      flushParagraph()
      const { node, next } = parseList(lines, i, indentOf(line))
      out.push(node)
      i = next
      continue
    }

    const quote = line.match(QUOTE)
    if (quote) {
      flushParagraph()
      const quoted: string[] = []
      while (i < lines.length) {
        const q = lines[i].match(QUOTE)
        if (!q) break
        quoted.push(q[1])
        i++
      }
      out.push({
        type: 'blockquote',
        content: markdownToProseMirror(quoted.join('\n')),
      })
      continue
    }

    buffer.push(line.trim())
    i++
  }

  flushParagraph()
  return out
}
