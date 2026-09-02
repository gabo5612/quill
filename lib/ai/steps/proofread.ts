import { callLLMStructured } from '../call'
import { getBalancedModelId } from '../registry'
import { ProofreadSchema, normalizeProofread, type ProofreadResult, type GenerationBrief } from '../schemas'
import type { LLMUsage } from '../call'

export async function proofreadArticle(
  brief: GenerationBrief,
  fullText: string,
  bannedWords: string[]
): Promise<ProofreadResult & { usage: LLMUsage; modelId: string }> {
  const system = `You are a professional editor and quality assurance specialist.
Check for: spelling errors in ${brief.language}, grammar issues, coherence, brand voice adherence.
${bannedWords.length ? `Banned words that must not appear: ${bannedWords.join(', ')}` : 'No banned words are configured.'}
Be thorough but fair. Score 0-100.`

  // QA runs on the cheaper model — the drafting model's capability isn't
  // needed to spot spelling, coherence, and banned-word issues.
  const modelId = getBalancedModelId(brief.provider)

  const { object, usage } = await callLLMStructured({
    provider: brief.provider,
    modelId,
    system,
    prompt: `Review this article for quality:\n\n${fullText.slice(0, 8000)}`,
    schema: ProofreadSchema,
    schemaName: 'qa_review',
    maxTokens: 2048,
  })

  return { ...normalizeProofread(object), usage, modelId }
}
