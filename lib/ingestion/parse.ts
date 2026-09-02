export async function parseDocument(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  if (fileType === 'application/pdf' || fileType.includes('pdf')) {
    const { extractText } = await import('unpdf')
    const { text } = await extractText(buffer, { mergePages: true })
    return text
  }

  if (fileType.includes('docx') || fileType.includes('openxmlformats')) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (fileType === 'text/markdown' || fileType === 'text/plain') {
    return buffer.toString('utf-8')
  }

  throw new Error(`Unsupported file type: ${fileType}`)
}
