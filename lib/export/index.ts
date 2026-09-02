export type ExportFormat = 'html' | 'markdown' | 'clipboard'

export interface ExportOptions {
  format: ExportFormat
  articleId: string
  includeJsonLd?: boolean
}
