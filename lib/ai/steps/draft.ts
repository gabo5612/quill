import { callLLMStructured } from '../call'
import { SectionDraftSchema, type SectionDraft, type Outline, type GenerationBrief } from '../schemas'
import type { LLMUsage } from '../call'

export async function draftSection(
  brief: GenerationBrief,
  outline: Outline,
  sectionIndex: number
): Promise<SectionDraft & { usage: LLMUsage }> {
  const section = outline.sections[sectionIndex]
  if (!section) throw new Error(`No section at index ${sectionIndex}`)

  const system = `You are a professional content writer.
Write in the brand's voice. Return Markdown — never HTML, never JSON.
Language: ${brief.language}

Brand context:
${brief.brandContext || '(no brand context configured)'}
`
  const prompt = `Write the content for this article section.
Article title: ${outline.title}
Section heading: ${section.heading}
Subheadings: ${section.subheadings?.join(', ') || 'none'}
Key points to cover: ${section.keyPoints.join('; ')}
Target word count: ${section.estimatedWords}
Keywords to weave in naturally: ${brief.keywords.join(', ') || '(none supplied)'}

Return the heading as plain text, and the body as Markdown. Use ### for any
subheadings inside the section. Do not repeat the heading in the body.`

  const { object, usage } = await callLLMStructured({
    provider: brief.provider,
    modelId: brief.modelId,
    system,
    prompt,
    schema: SectionDraftSchema,
    schemaName: 'article_section',
    maxTokens: 3000,
  })

  return { ...object, usage }
}
