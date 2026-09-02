import { prosemirrorToHtml } from '@/lib/content/html-serializer'
import type { PMDocument } from '@/lib/content/article-schema'

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * `</script>` anywhere inside a JSON string terminates the surrounding script
 * element, so escape the sequence before embedding JSON-LD.
 */
function escapeJsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

export function exportToHtml(
  doc: PMDocument,
  meta: { titleTag?: string; metaDescription?: string; jsonld?: Record<string, unknown> }
): string {
  const body = prosemirrorToHtml(doc)
  const jsonldScript = meta.jsonld
    ? `<script type="application/ld+json">${escapeJsonLd(meta.jsonld)}</script>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${meta.titleTag ? `<title>${escapeAttribute(meta.titleTag)}</title>` : ''}
  ${meta.metaDescription ? `<meta name="description" content="${escapeAttribute(meta.metaDescription)}">` : ''}
  ${jsonldScript}
</head>
<body>
  <article>
${body}
  </article>
</body>
</html>`
}
