import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { generateArticle } from '@/lib/inngest/functions/generate-article'
import { ingestBrandDocs } from '@/lib/inngest/functions/ingest-brand-docs'
import { scheduledSweeper } from '@/lib/inngest/functions/scheduled-sweeper'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateArticle, ingestBrandDocs, scheduledSweeper],
})
