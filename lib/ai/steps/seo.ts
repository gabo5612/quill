import { callLLMStructured } from '../call'
import { getBalancedModelId } from '../registry'
import { SeoSchema, normalizeSeo, type SeoResult, type GenerationBrief } from '../schemas'
import type { LLMUsage } from '../call'

export async function generateSeo(
  brief: GenerationBrief,
  articleTitle: string,
  articleExcerpt: string
): Promise<SeoResult & { usage: LLMUsage; modelId: string }> {
  const modelId = getBalancedModelId(brief.provider)

  const system = `You are an SEO specialist. Generate metadata that improves search ranking.
Target keywords: ${brief.keywords.join(', ') || '(none supplied)'}
Language: ${brief.language}
The slug must be lowercase ASCII words separated by hyphens.`

  const { object, usage } = await callLLMStructured({
    provider: brief.provider,
    modelId,
    system,
    prompt: `Generate SEO metadata for this article:
Title: ${articleTitle}
Excerpt: ${articleExcerpt.slice(0, 500)}
Keywords: ${brief.keywords.join(', ') || '(none supplied)'}`,
    schema: SeoSchema,
    schemaName: 'seo_metadata',
    maxTokens: 1024,
  })

  // Character limits and slug formatting are enforced here, not by the
  // schema — the provider does not apply value constraints.
  return { ...normalizeSeo(object), usage, modelId }
}
