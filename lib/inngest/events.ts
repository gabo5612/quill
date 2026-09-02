import type { GenerationBrief } from '@/lib/ai/schemas'

export type InngestEvents = {
  'article/generate': {
    data: GenerationBrief & { triggeredBy: string }
  }
  'brand/ingest-docs': {
    data: {
      brandId: string
      documentIds: string[]
      triggeredBy: string
    }
  }
  'schedule/sweep': {
    data: Record<string, never>
  }
}

// Event name constants
export const EVENTS = {
  GENERATE_ARTICLE: 'article/generate',
  INGEST_BRAND_DOCS: 'brand/ingest-docs',
  SCHEDULE_SWEEP: 'schedule/sweep',
} as const
