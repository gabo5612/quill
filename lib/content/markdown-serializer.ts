import type { PMDocument } from './article-schema'

type LooseNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: LooseNode[]
  marks?: { type?: string; attrs?: Record<string, unknown> }[]
}

function headingLevel(attrs: Record<string, unknown> | undefined): number {
  const level = Number(attrs?.level ?? 2)
  return Number.isFinite(level) ? Math.min(6, Math.max(1, Math.trunc(level))) : 2
}

function nodeToMarkdown(
  node: LooseNode,
  listDepth = 0,
  listType: 'bullet' | 'ordered' | null = null,
  listIndex = 1,
): string {
  switch (node.type) {
    case 'heading':
      return `${'#'.repeat(headingLevel(node.attrs))} ${inlineNodesToMarkdown(node.content)}`

    case 'paragraph':
      return node.content?.length ? inlineNodesToMarkdown(node.content) : ''

    case 'text':
      return inlineTextToMarkdown(node)

    case 'image': {
      const title = node.attrs?.title ? ` "${String(node.attrs.title)}"` : ''
      return `![${String(node.attrs?.alt ?? '')}](${String(node.attrs?.src ?? '')}${title})`
    }

    case 'bulletList':
      return (node.content ?? [])
        .map(item => nodeToMarkdown(item, listDepth, 'bullet'))
        .join('\n')

    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1)
      return (node.content ?? [])
        .map((item, i) =>
          nodeToMarkdown(item, listDepth, 'ordered', (Number.isFinite(start) ? start : 1) + i),
        )
        .join('\n')
    }

    case 'listItem': {
      const indent = '  '.repeat(listDepth)
      const marker = listType === 'ordered' ? `${listIndex}.` : '-'
      const parts: string[] = []
      for (const child of node.content ?? []) {
        if (child.type === 'bulletList' || child.type === 'orderedList') {
          parts.push(nodeToMarkdown(child, listDepth + 1))
        } else {
          parts.push(nodeToMarkdown(child, listDepth))
        }
      }
      const [first = '', ...rest] = parts
      const restIndented = rest.map(r => r.split('\n').map(l => `  ${l}`).join('\n'))
      return [`${indent}${marker} ${first}`, ...restIndented].join('\n')
    }

    case 'blockquote':
      return (node.content ?? [])
        .map(child => nodeToMarkdown(child, listDepth))
        .join('\n')
        .split('\n')
        .map(line => `> ${line}`)
        .join('\n')

    case 'codeBlock': {
      const lang = String(node.attrs?.language ?? '')
      const code = (node.content ?? []).map(n => n.text ?? '').join('')
      return `\`\`\`${lang}\n${code}\n\`\`\``
    }

    case 'hardBreak':
      return '  \n'

    default:
      return node.content?.length
        ? (node.content ?? []).map(child => nodeToMarkdown(child, listDepth)).join('\n')
        : ''
  }
}

function inlineNodesToMarkdown(nodes: LooseNode[] | undefined): string {
  if (!nodes) return ''
  return nodes.map(inlineTextToMarkdown).join('')
}

function inlineTextToMarkdown(node: LooseNode): string {
  if (node.type === 'hardBreak') return '  \n'
  if (node.type === 'image') {
    const title = node.attrs?.title ? ` "${String(node.attrs.title)}"` : ''
    return `![${String(node.attrs?.alt ?? '')}](${String(node.attrs?.src ?? '')}${title})`
  }
  if (node.type !== 'text') return ''

  let text = node.text ?? ''
  if (!node.marks?.length) return text

  let isBold = false
  let isItalic = false
  let isCode = false
  let href: string | null = null

  for (const mark of node.marks) {
    if (mark.type === 'bold' || mark.type === 'strong') isBold = true
    else if (mark.type === 'italic' || mark.type === 'em') isItalic = true
    else if (mark.type === 'code') isCode = true
    else if (mark.type === 'link') href = String(mark.attrs?.href ?? '')
  }

  // Code spans are literal — emphasis markers inside them would not render.
  if (isCode) text = `\`${text}\``
  else if (isBold && isItalic) text = `***${text}***`
  else if (isBold) text = `**${text}**`
  else if (isItalic) text = `*${text}*`

  if (href) text = `[${text}](${href})`

  return text
}

export function prosemirrorToMarkdown(doc: PMDocument): string {
  const blocks: string[] = []
  for (const node of (doc as unknown as LooseNode).content ?? []) {
    const md = nodeToMarkdown(node)
    if (md !== '') blocks.push(md)
  }
  return blocks.join('\n\n')
}
