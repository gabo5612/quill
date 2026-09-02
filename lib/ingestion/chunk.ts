export interface TextChunk {
  content: string
  chunkIndex: number
}

export function chunkText(
  text: string,
  chunkSize = 1000,
  overlap = 200
): TextChunk[] {
  const chunks: TextChunk[] = []
  let start = 0
  let index = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    let chunkEnd = end

    // Try to break at sentence boundary
    if (end < text.length) {
      const periodIdx = text.lastIndexOf('.', end)
      if (periodIdx > start + chunkSize * 0.5) chunkEnd = periodIdx + 1
    }

    const content = text.slice(start, chunkEnd).trim()
    if (content.length > 50) {
      chunks.push({ content, chunkIndex: index++ })
    }

    start = chunkEnd - overlap
    if (start <= 0 || chunkEnd >= text.length) break
  }

  return chunks
}
