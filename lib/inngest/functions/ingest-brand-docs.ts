import { inngest } from '../client'
import { runIngestionPipeline } from '@/lib/ingestion/pipeline'
import { logAudit } from '@/lib/audit/log'

/* eslint-disable @typescript-eslint/no-explicit-any -- see generate-article.ts */
type Step = any

export const ingestBrandDocs = inngest.createFunction(
  {
    id: 'ingest-brand-docs',
    name: 'Ingest Brand Documents',
    concurrency: { limit: 5 },
    retries: 3,
    triggers: [{ event: 'brand/ingest-docs' as const }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { brandId: string; documentIds: string[]; triggeredBy: string } }
    step: Step
  }) => {
    const { brandId, documentIds, triggeredBy } = event.data

    // One step per document, run sequentially. Each step swallows its own
    // error and records it on the document row, so one bad PDF can't fail the
    // whole batch or trip Inngest's retry logic for documents that succeeded.
    const results: { docId: string; status: 'done' | 'error'; error?: string }[] = []

    for (const docId of documentIds) {
      const result = await step.run(`ingest-doc-${docId}`, async () => {
        try {
          await runIngestionPipeline(brandId, docId)
          await logAudit({
            actorId: triggeredBy,
            action: 'document.ingested',
            resourceType: 'brand_document',
            resourceId: docId,
            brandId,
          })
          return { docId, status: 'done' as const }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`[ingest] ${docId} failed:`, message)
          // runIngestionPipeline already set ingestion_status = 'error'.
          return { docId, status: 'error' as const, error: message }
        }
      })
      results.push(result)
    }

    const failed = results.filter(r => r.status === 'error')
    return {
      processed: results.length - failed.length,
      failed: failed.length,
      errors: failed.map(f => ({ docId: f.docId, error: f.error })),
    }
  }
)
