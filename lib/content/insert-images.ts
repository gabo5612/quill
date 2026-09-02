import type { PMDocument, PMLooseNode } from './article-schema'

export interface PlacedImage {
  sectionIndex: number
  altText: string
  /** Public URL of the uploaded image. */
  src: string
}

/**
 * Inserts image nodes into an assembled article.
 *
 * assembleDocument() produces `[H1, H2, ...body, H2, ...body, ...]`, so the
 * nth section starts at the nth H2. An image for section `i` is appended at the
 * end of that section's body — right before the next H2, or at the end of the
 * document for the last section.
 */
export function insertImages(doc: PMDocument, images: PlacedImage[]): PMDocument {
  if (images.length === 0) return doc

  const nodes = [...((doc as unknown as { content: PMLooseNode[] }).content ?? [])]

  // Index of every section heading, in document order.
  const h2Indexes: number[] = []
  nodes.forEach((node, i) => {
    if (node.type === 'heading' && Number(node.attrs?.level) === 2) h2Indexes.push(i)
  })

  // Insert from the last section backwards so earlier indexes stay valid.
  const ordered = [...images].sort((a, b) => b.sectionIndex - a.sectionIndex)

  for (const image of ordered) {
    if (image.sectionIndex < 0 || image.sectionIndex >= h2Indexes.length) continue

    const nextHeading = h2Indexes[image.sectionIndex + 1]
    const insertAt = nextHeading ?? nodes.length

    nodes.splice(insertAt, 0, {
      type: 'image',
      attrs: { src: image.src, alt: image.altText },
    })
  }

  return { type: 'doc', content: nodes as unknown as PMDocument['content'] }
}
