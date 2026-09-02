import { experimental_generateImage as generateImage } from 'ai'
import { openai } from '@ai-sdk/openai'
import { callLLMStructured } from '../call'
import { getBalancedModelId, IMAGE_MODEL_ID, IMAGE_SIZE } from '../registry'
import { isProviderConfigured } from '../providers'
import { ImagePlanSchema, normalizeImagePlan, type GenerationBrief, type Outline } from '../schemas'
import type { LLMUsage } from '../call'

export interface PlannedImage {
  /** Index of the outline section this image belongs after. */
  sectionIndex: number
  altText: string
  prompt: string
}

export interface GeneratedImage extends PlannedImage {
  /** PNG bytes, base64-encoded. Uploaded to storage by the caller. */
  base64: string
  mediaType: string
}

/**
 * Decides which sections deserve an illustration and writes a prompt for each.
 * Runs on the cheap model — this is a planning task, not a writing one.
 *
 * Alt text is mandatory: an article image without it fails the accessibility
 * check in lib/content/quality.ts and hurts the SEO score the pipeline just
 * spent a model call optimising.
 */
export async function planArticleImages(
  brief: GenerationBrief,
  outline: Outline,
  maxImages: number,
): Promise<{ images: PlannedImage[]; usage: LLMUsage }> {
  const modelId = getBalancedModelId(brief.provider)

  const sectionList = outline.sections
    .map((s, i) => `${i}. ${s.heading} — ${s.keyPoints.join('; ')}`)
    .join('\n')

  const { object, usage } = await callLLMStructured({
    provider: brief.provider,
    modelId,
    system: `You plan editorial illustrations for articles.
Pick only the sections where an image genuinely adds meaning — a diagram, a scene, a concrete object.
Skip sections that would only get a generic stock-photo filler.
Never plan an image containing text, charts with numbers, logos, or recognisable real people.
Language for alt text: ${brief.language}`,
    prompt: `Article: ${outline.title}
Objective: ${brief.objective}
Sections:
${sectionList}

Plan at most ${maxImages} images. For each: the section index it follows, SEO-ready alt text, and a detailed generation prompt describing style, composition and subject.`,
    schema: ImagePlanSchema,
    schemaName: 'image_plan',
    maxTokens: 1536,
  })

  // Drops images with no alt text or an out-of-range section, which the
  // schema cannot reject on its own.
  const images: PlannedImage[] = normalizeImagePlan(object, outline.sections.length).images
    .slice(0, maxImages)
    .map(img => ({
      sectionIndex: Math.min(
        Math.max(0, Math.trunc(img.sectionIndex)),
        outline.sections.length - 1,
      ),
      altText: img.altText.trim(),
      prompt: img.prompt.trim(),
    }))
    .filter(img => img.altText && img.prompt)

  return { images, usage }
}

/**
 * Renders the planned images. Returns only the ones that succeeded — a failed
 * illustration must never fail the article.
 */
export async function renderArticleImages(
  planned: PlannedImage[],
): Promise<{ images: GeneratedImage[]; failed: number }> {
  if (!isProviderConfigured('openai')) return { images: [], failed: planned.length }

  const images: GeneratedImage[] = []
  let failed = 0

  for (const plan of planned) {
    try {
      const { image } = await generateImage({
        model: openai.image(IMAGE_MODEL_ID),
        prompt: plan.prompt,
        size: IMAGE_SIZE,
        n: 1,
      })
      images.push({
        ...plan,
        base64: image.base64,
        mediaType: image.mediaType || 'image/png',
      })
    } catch (error) {
      failed += 1
      console.error(`[images] failed to render "${plan.altText}":`, error)
    }
  }

  return { images, failed }
}
