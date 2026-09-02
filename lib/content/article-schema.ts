import { markdownToProseMirror } from './markdown-to-prosemirror'

// ProseMirror document constraints for an article:
// - Exactly one H1 (the article title), always at the top level
// - H2–H4 for the body hierarchy
// - Paragraphs, ordered/unordered lists, images, blockquotes
// - No raw HTML injection

export interface PMText { type: 'text'; text: string; marks?: PMark[] }
export interface PMHeading { type: 'heading'; attrs: { level: 1|2|3|4 }; content: PMText[] }
export interface PMParagraph { type: 'paragraph'; content?: (PMText | PMImage)[] }
export interface PMBulletList { type: 'bulletList'; content: PMListItem[] }
export interface PMOrderedList { type: 'orderedList'; attrs?: { start: number }; content: PMListItem[] }
export interface PMListItem { type: 'listItem'; content: PMParagraph[] }
export interface PMImage { type: 'image'; attrs: { src: string; alt: string; title?: string } }
export interface PMBlockquote { type: 'blockquote'; content: PMParagraph[] }
export interface PMark { type: string; attrs?: Record<string, unknown> }
export interface PMHardBreak { type: 'hardBreak' }

export type PMNode = PMText | PMHeading | PMParagraph | PMBulletList | PMOrderedList | PMListItem | PMImage | PMBlockquote | PMHardBreak

/**
 * Structurally-open node. Model output is schema-validated but not restricted
 * to the closed union above (Tiptap extensions can add node types), so
 * assembly and serialization operate on this shape.
 */
export interface PMLooseNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PMLooseNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

export interface PMDocument {
  type: 'doc'
  content: PMNode[]
}

/**
 * Returns a structurally identical document made only of plain objects.
 *
 * ProseMirror builds `node.attrs` with `Object.create(null)`. React's Server
 * Action serializer refuses to send objects that lack a prototype and replaces
 * them with an opaque temporary reference (`"$T"`), which arrives on the server
 * as nothing at all — so every `attrs` bag silently vanished on save. Heading
 * levels collapsed to the serializer default, and image `src`, link `href` and
 * ordered-list `start` would have gone the same way.
 *
 * Any document crossing a Server Action boundary must go through here first.
 * `fetch` callers are unaffected because `JSON.stringify` handles null-prototype
 * objects fine — which is why /api/quality kept working while saving did not.
 */
export function toPlainDoc<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc)) as T
}

export function validateArticleDoc(doc: PMDocument): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  let h1Count = 0

  function traverse(nodes: PMLooseNode[], depth = 0) {
    for (const node of nodes) {
      if (node.type === 'heading' && Number(node.attrs?.level) === 1) {
        h1Count++
        if (h1Count > 1) errors.push('Multiple H1 headings found — only one allowed')
        if (depth > 0) errors.push('H1 must be at the top level')
      }
      if (Array.isArray(node.content)) {
        traverse(node.content, depth + 1)
      }
    }
  }

  traverse((doc as unknown as { content: PMLooseNode[] }).content ?? [])
  if (h1Count === 0) errors.push('No H1 heading found — article must have a title')

  return { valid: errors.length === 0, errors }
}

/**
 * Builds the full document from per-section drafts, guaranteeing a single H1
 * at the root regardless of what the model returned for each section.
 */
export function assembleDocument(
  title: string,
  sections: Array<{ heading: string; markdown: string }>,
): PMDocument {
  const titleNode: PMHeading = {
    type: 'heading',
    attrs: { level: 1 },
    content: [{ type: 'text', text: title }],
  }

  const sectionNodes = sections.flatMap(section => {
    const body = markdownToProseMirror(section.markdown)

    // The model is told not to repeat the heading, but when it does the
    // article ends up with it twice. Drop a leading heading that matches.
    const first = body[0]
    if (
      first?.type === 'heading' &&
      headingText(first).toLowerCase() === section.heading.trim().toLowerCase()
    ) {
      body.shift()
    }

    // Section headings are always H2 regardless of what the body used, and
    // anything the body marked as H1 or H2 is demoted so the article keeps a
    // single H1 and a clean hierarchy underneath it.
    for (const node of body) {
      if (node.type === 'heading') {
        const level = Number(node.attrs?.level ?? 3)
        node.attrs = { ...node.attrs, level: Math.min(4, Math.max(3, level)) }
      }
    }

    return [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: section.heading.trim() }],
      } as PMLooseNode,
      ...body,
    ]
  })

  return {
    type: 'doc',
    content: [titleNode, ...(sectionNodes as unknown as PMNode[])],
  }
}

function headingText(node: PMLooseNode): string {
  return (node.content ?? []).map(n => n.text ?? '').join('').trim()
}
