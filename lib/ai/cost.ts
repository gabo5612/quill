import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import type { LLMUsage } from './call'
import type { ModelProvider } from './registry'

/**
 * USD per 1M tokens. Anthropic rates from platform.claude.com/pricing;
 * OpenAI rates from platform.openai.com/pricing. These drive the
 * app.generations cost ledger, which is reporting-only — an out-of-date entry
 * skews a dashboard, it does not affect what gets called.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5':    { input: 5.00, output: 25.00 },
  'claude-sonnet-5':  { input: 3.00, output: 15.00 },
  'claude-haiku-4-5': { input: 1.00, output: 5.00 },
  'gpt-4o':           { input: 2.50, output: 10.00 },
  'gpt-4o-mini':      { input: 0.15, output: 0.60 },
}

export function estimateCostUsd(modelId: string, usage: LLMUsage): number {
  const price = MODEL_PRICING[modelId]
  if (!price) return 0
  const cost =
    (usage.inputTokens / 1_000_000) * price.input +
    (usage.outputTokens / 1_000_000) * price.output
  // app.generations.cost_usd is NUMERIC(10,6)
  return Math.round(cost * 1e6) / 1e6
}

export type GenerationStep = 'outline' | 'draft' | 'images' | 'qa' | 'seo' | 'done'

/**
 * Image generation is billed per image, not per token, so it bypasses
 * estimateCostUsd and passes an explicit cost instead.
 */
export interface GenerationRecord {
  articleId: string
  brandId: string
  provider: ModelProvider
  modelId: string
  step: GenerationStep
  usage?: LLMUsage
  durationMs?: number
  status?: 'success' | 'error'
  error?: string
  /** Overrides the token-based estimate. Used for per-image billing. */
  costUsdOverride?: number
  /**
   * What this step decided — the outline it produced, the chunks it retrieved,
   * the issues it found. Rendered by the trace page so an editor can audit why
   * a draft says what it says. Keep it small: this is a summary, not the
   * article.
   */
  payload?: Record<string, unknown>
}

/**
 * Appends a row to the app.generations cost ledger. Also drives the
 * /api/articles/[id]/status endpoint, which reads the newest row to report
 * which pipeline step is running.
 *
 * Ledger writes must never fail a generation — errors are logged, not thrown.
 */
export async function recordGeneration(entry: GenerationRecord): Promise<void> {
  try {
    const admin = getSupabaseAdminClient()
    await admin.from('generations').insert({
      article_id: entry.articleId,
      brand_id: entry.brandId,
      provider: entry.provider,
      model_id: entry.modelId,
      step: entry.step,
      payload: entry.payload ?? null,
      tokens_in: entry.usage?.inputTokens ?? 0,
      tokens_out: entry.usage?.outputTokens ?? 0,
      cost_usd: entry.costUsdOverride
        ?? (entry.usage ? estimateCostUsd(entry.modelId, entry.usage) : 0),
      duration_ms: entry.durationMs ?? null,
      status: entry.status ?? 'success',
      error: entry.error ?? null,
    })
  } catch (error) {
    console.error('[generations] failed to record generation:', error)
  }
}
