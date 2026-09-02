'use server'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/auth/require-permission'
import { logAudit } from '@/lib/audit/log'
import { inngest } from '@/lib/inngest/client'
import { EVENTS } from '@/lib/inngest/events'
import { isModelAllowed, isModelUsable } from '@/lib/ai/registry'

interface CreateArticleInput {
  brandId: string
  objective: string
  keywords: string[]
  modelProvider: 'openai' | 'anthropic'
  modelId: string
  /** Requested length in words. Omit to let the model decide. */
  targetWords?: number
}

// Mirrors the CHECK constraint on app.articles.target_words.
const MIN_WORDS = 300
const MAX_WORDS = 4000

export async function createNewArticle(
  input: CreateArticleInput
): Promise<{ articleId?: string; error?: string }> {
  // The author is taken from the session, never from the client payload.
  const ctx = await checkPermission('content.generate', input.brandId)
  if (!ctx) return { error: 'You do not have permission to generate content for this brand.' }

  if (!input.objective.trim()) return { error: 'Objective is required' }

  const targetWords = input.targetWords
  if (targetWords !== undefined && (targetWords < MIN_WORDS || targetWords > MAX_WORDS)) {
    return { error: `Length must be between ${MIN_WORDS} and ${MAX_WORDS} words.` }
  }
  if (!isModelAllowed(input.modelProvider, input.modelId)) {
    return { error: 'That model is not available.' }
  }
  if (!isModelUsable(input.modelProvider, input.modelId)) {
    return {
      error: `${input.modelProvider === 'openai' ? 'OpenAI' : 'Anthropic'} is not configured on this deployment. Pick a different model.`,
    }
  }

  const supabase = await getSupabaseServerClient()

  const { data: article, error: insertError } = await supabase
    .from('articles')
    .insert({
      brand_id: input.brandId,
      author_id: ctx.userId,
      status: 'draft',
      model_provider: input.modelProvider,
      model_id: input.modelId,
      objective: input.objective.trim(),
      keywords: input.keywords,
      target_words: targetWords ?? null,
    })
    .select('id')
    .single()

  if (insertError || !article) {
    return { error: insertError?.message ?? 'Error creating the article' }
  }

  // Brand context for the generation brief. Full RAG retrieval happens inside
  // the Inngest function; this is only the language hint plus a short summary.
  const { data: brandProfile } = await supabase
    .from('brand_profiles')
    .select('tone_of_voice, audience, key_messages, language')
    .eq('brand_id', input.brandId)
    .maybeSingle()

  const brandContext = [
    brandProfile?.tone_of_voice && `Tone: ${brandProfile.tone_of_voice}`,
    brandProfile?.audience && `Audience: ${brandProfile.audience}`,
    brandProfile?.key_messages && `Key messages: ${brandProfile.key_messages}`,
  ]
    .filter(Boolean)
    .join('\n')

  const rawLanguage = brandProfile?.language?.[0]?.toLowerCase()
  const language: 'es' | 'en' | 'es+en' =
    rawLanguage === 'en' ? 'en' : rawLanguage === 'es+en' ? 'es+en' : 'es'

  await logAudit({
    actorId: ctx.userId,
    action: 'article.created',
    resourceType: 'article',
    resourceId: article.id,
    brandId: input.brandId,
    metadata: { provider: input.modelProvider, model: input.modelId, targetWords: targetWords ?? null },
  })

  await inngest.send({
    name: EVENTS.GENERATE_ARTICLE,
    data: {
      brandId: input.brandId,
      articleId: article.id,
      objective: input.objective.trim(),
      keywords: input.keywords,
      provider: input.modelProvider,
      modelId: input.modelId,
      brandContext,
      language,
      targetWords,
      triggeredBy: ctx.userId,
    },
  })

  return { articleId: article.id }
}
