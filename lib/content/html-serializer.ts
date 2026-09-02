import type { PMDocument } from './article-schema'

/**
 * The model returns ProseMirror JSON that is schema-validated but not
 * structurally exhaustive, so nodes are walked as loose records rather than
 * the narrow PM* interfaces.
 */
type LooseNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: LooseNode[]
  marks?: { type?: string; attrs?: Record<string, unknown> }[]
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Blocks javascript:/data: URLs that would otherwise become live links. */
function safeUrl(value: unknown): string {
  const url = String(value ?? '').trim()
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(url)) return escapeHtml(url)
  return '#'
}

function headingLevel(attrs: Record<string, unknown> | undefined): number {
  const level = Number(attrs?.level ?? 2)
  return Number.isFinite(level) ? Math.min(6, Math.max(1, Math.trunc(level))) : 2
}

function nodeToHtml(node: LooseNode): string {
  const children = () => (node.content ?? []).map(nodeToHtml).join('')

  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map(nodeToHtml).join('\n')

    case 'heading': {
      const level = headingLevel(node.attrs)
      return `<h${level}>${children()}</h${level}>`
    }

    case 'paragraph':
      return node.content?.length ? `<p>${children()}</p>` : '<p></p>'

    case 'text': {
      let text = escapeHtml(node.text ?? '')
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold' || mark.type === 'strong') text = `<strong>${text}</strong>`
        else if (mark.type === 'italic' || mark.type === 'em') text = `<em>${text}</em>`
        else if (mark.type === 'code') text = `<code>${text}</code>`
        else if (mark.type === 'link') {
          text = `<a href="${safeUrl(mark.attrs?.href)}" rel="noopener noreferrer">${text}</a>`
        }
      }
      return text
    }

    case 'image': {
      const src = safeUrl(node.attrs?.src)
      const alt = escapeHtml(String(node.attrs?.alt ?? ''))
      const title = node.attrs?.title
        ? `<figcaption>${escapeHtml(String(node.attrs.title))}</figcaption>`
        : ''
      return `<figure><img src="${src}" alt="${alt}" loading="lazy"/>${title}</figure>`
    }

    case 'bulletList':
      return `<ul>${children()}</ul>`

    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1)
      return `<ol start="${Number.isFinite(start) ? start : 1}">${children()}</ol>`
    }

    case 'listItem':
      return `<li>${children()}</li>`

    case 'blockquote':
      return `<blockquote>${children()}</blockquote>`

    case 'codeBlock':
      return `<pre><code>${escapeHtml(
        (node.content ?? []).map(n => n.text ?? '').join(''),
      )}</code></pre>`

    case 'hardBreak':
      return '<br>'

    default:
      // Unknown node: keep its children rather than silently dropping content.
      return node.content?.length ? children() : ''
  }
}

export function prosemirrorToHtml(doc: PMDocument): string {
  return ((doc as unknown as LooseNode).content ?? []).map(nodeToHtml).join('\n')
}
