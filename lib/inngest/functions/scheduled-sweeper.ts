import { inngest } from '../client'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getBalancedModelId, isModelAllowed } from '@/lib/ai/registry'
import { logAudit } from '@/lib/audit/log'

/* eslint-disable @typescript-eslint/no-explicit-any -- see generate-article.ts */
type Step = any

interface ScheduleEntry {
  id: string
  brand_id: string
  author_id: string
  objective: string | null
  keywords: string[] | null
  model_provider: string
  model_id: string
  target_words: number | null
}

export const scheduledSweeper = inngest.createFunction(
  {
    id: 'scheduled-sweeper',
    name: 'Scheduled Content Sweeper',
    // A second concurrent sweep would race the claim below.
    concurrency: { limit: 1 },
    triggers: [{ cron: 'TZ=America/Costa_Rica */15 * * * *' }],
  },
  async ({ step }: { step: Step }) => {
    const admin = getSupabaseAdminClient()

    const claimed = await step.run('claim-due-entries', async () => {
      const now = new Date().toISOString()

      const { data: due } = await admin
        .from('schedule_entries')
        .select('id, brand_id, author_id, objective, keywords, model_provider, model_id, target_words')
        .eq('status', 'pending')
        .lte('scheduled_at', now)
        .is('claimed_at', null)
        .limit(10)

      if (!due?.length) return [] as ScheduleEntry[]

      // Conditional update: only rows still pending+unclaimed are taken, so a
      // concurrent sweeper (or a manual status change) can't double-claim.
      const { data: locked } = await admin
        .from('schedule_entries')
        .update({ status: 'claimed', claimed_at: now })
        .in('id', due.map(e => e.id))
        .eq('status', 'pending')
        .is('claimed_at', null)
        .select('id')

      const lockedIds = new Set((locked ?? []).map(r => r.id))
      return (due as unknown as ScheduleEntry[]).filter(e => lockedIds.has(e.id))
    })

    if (!claimed.length) return { processed: 0 }

    let processed = 0

    for (const entry of claimed as ScheduleEntry[]) {
      await step.run(`process-entry-${entry.id}`, async () => {
        const provider = entry.model_provider === 'openai' ? 'openai' : 'anthropic'
        // A scheduled entry can outlive a model's retirement; fall back rather
        // than fail the whole sweep.
        const modelId = isModelAllowed(provider, entry.model_id)
          ? entry.model_id
          : getBalancedModelId(provider)

        const { data: article, error } = await admin.from('articles').insert({
          brand_id: entry.brand_id,
          author_id: entry.author_id,
          status: 'draft',
          model_provider: provider,
          model_id: modelId,
          objective: entry.objective ?? '',
          keywords: entry.keywords ?? [],
          target_words: entry.target_words,
        }).select('id').single()

        if (error || !article) {
          await admin.from('schedule_entries')
            .update({ status: 'error' })
            .eq('id', entry.id)
          return
        }

        // 'generating' until the Inngest function finishes; the article's own
        // status becomes in_review on completion.
        await admin.from('schedule_entries')
          .update({ status: 'generating', article_id: article.id })
          .eq('id', entry.id)

        await inngest.send({
          name: 'article/generate',
          data: {
            brandId: entry.brand_id,
            articleId: article.id,
            objective: entry.objective ?? '',
            keywords: entry.keywords ?? [],
            provider,
            modelId,
            brandContext: '', // retrieved inside the generation function
            language: 'es',
            targetWords: entry.target_words ?? undefined,
            triggeredBy: entry.author_id,
          },
        })

        await logAudit({
          actorId: entry.author_id,
          action: 'article.created',
          resourceType: 'schedule_entry',
          resourceId: entry.id,
          brandId: entry.brand_id,
          metadata: { scheduleEntryId: entry.id, articleId: article.id },
        })

        processed += 1
      })
    }

    return { processed }
  }
)
