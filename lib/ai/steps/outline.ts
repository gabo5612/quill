import { callLLMStructured } from '../call'
import { OutlineSchema, normalizeOutline } from '../schemas'
import type { GenerationBrief, Outline } from '../schemas'
import type { LLMUsage } from '../call'

export async function generateOutline(
  brief: GenerationBrief,
): Promise<Outline & { usage: LLMUsage }> {
  const system = `You are an expert content strategist.
Create SEO-optimized article outlines that match the brand's voice and strategy.
Language: ${brief.language}

Brand context:
${brief.brandContext || '(no brand context configured)'}
`

  // Section word counts have to add up to the requested total, otherwise the
  // drafting step (which works section by section) overshoots or undershoots.
  const lengthInstruction = brief.targetWords
    ? `The finished article must be about ${brief.targetWords} words. Set estimatedTotalWords to ${brief.targetWords} and make the per-section estimatedWords add up to it.`
    : 'Choose a length appropriate to the topic.'

  const prompt = `Create a detailed article outline for the following:
Objective: ${brief.objective}
Keywords to include: ${brief.keywords.join(', ') || '(none supplied)'}
${lengthInstruction}
The article should be comprehensive, SEO-friendly, and match the brand voice.
Return a structured outline with 4-7 sections.`

  const { object, usage } = await callLLMStructured({
    provider: brief.provider,
    modelId: brief.modelId,
    system,
    prompt,
    schema: OutlineSchema,
    schemaName: 'article_outline',
    maxTokens: 2048,
  })

  // The schema asks only for shape; the editorial limits are applied here.
  return { ...normalizeOutline(object), usage }
}
