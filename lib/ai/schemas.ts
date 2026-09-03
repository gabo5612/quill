import { z } from 'zod'

// ProseMirror node types
export const ProseMirrorMarkSchema = z.object({
  type: z.string(),
  attrs: z.record(z.string(), z.unknown()).optional(),
})

export interface ProseMirrorNodeShape {
  type: string
  attrs?: Record<string, unknown>
  content?: ProseMirrorNodeShape[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

// Recursive schema: the explicit annotation is required because the type
// references itself through z.lazy().
export const ProseMirrorNodeSchema: z.ZodType<ProseMirrorNodeShape> = z.lazy(() => z.object({
  type: z.string(),
  attrs: z.record(z.string(), z.unknown()).optional(),
  content: z.array(ProseMirrorNodeSchema).optional(),
  marks: z.array(ProseMirrorMarkSchema).optional(),
  text: z.string().optional(),
}))

export const ArticleBodySchema = z.object({
  type: z.literal('doc'),
  content: z.array(ProseMirrorNodeSchema),
})

// ---------------------------------------------------------------------------
// A note on constraints, which is why none of these schemas carry any.
//
// Anthropic's structured outputs guarantee the *shape* of the response: the
// fields, their types, and their nesting. They do not enforce value
// constraints — `min`/`max` on numbers, `max` on strings, `regex` on patterns.
// A `z.string().max(60)` therefore does nothing to the request and everything
// to the response: the provider happily returns 68 characters, Zod rejects a
// reply the model was never told to keep short, and the step fails.
//
// Measured on the SEO schema, that cost two runs in six even with native
// structured outputs enabled.
//
// So limits live in two places instead: stated in prose inside `.describe()`,
// where the model can act on them, and enforced by the `normalize*` functions
// below, which cannot fail. The schema only asks for shape.
// ---------------------------------------------------------------------------

const WORDS_MIN = 100
const WORDS_MAX = 800
const SECTIONS_MAX = 8
const TOTAL_MIN = 500
const TOTAL_MAX = 4000
const IMAGES_MAX = 6

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** Truncates on a word boundary so a clipped title still reads as language. */
export function truncateWords(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  const cut = trimmed.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–-]+$/, '')
}

/** Lowercase, unaccented, hyphen-separated — whatever the model returned. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Outline step output
export const OutlineSchema = z.object({
  title: z.string().describe('Article title (H1)'),
  sections: z.array(z.object({
    heading: z.string().describe('Section heading (H2)'),
    subheadings: z.array(z.string()).describe('H3 subheadings for this section. Empty array if none.'),
    keyPoints: z.array(z.string()).describe('2-4 key points to cover in this section'),
    estimatedWords: z.number().describe(`Words to write here, between ${WORDS_MIN} and ${WORDS_MAX}`),
  })).describe(`Between 3 and ${SECTIONS_MAX} sections`),
  estimatedTotalWords: z.number().describe(`Total words, between ${TOTAL_MIN} and ${TOTAL_MAX}`),
  imageCount: z.number().describe(`How many images this article needs, 0 to ${IMAGES_MAX}`),
})
export type Outline = z.infer<typeof OutlineSchema>

export function normalizeOutline(outline: Outline): Outline {
  // Extra sections are dropped rather than rejected — an eight-section cap is
  // an editorial preference, not a reason to throw away a finished outline.
  const sections = outline.sections.slice(0, SECTIONS_MAX).map(section => ({
    ...section,
    subheadings: section.subheadings ?? [],
    estimatedWords: clamp(section.estimatedWords, WORDS_MIN, WORDS_MAX, 250),
  }))

  return {
    ...outline,
    title: outline.title.trim(),
    sections,
    estimatedTotalWords: clamp(outline.estimatedTotalWords, TOTAL_MIN, TOTAL_MAX, 1200),
    imageCount: clamp(outline.imageCount, 0, IMAGES_MAX, 0),
  }
}

// Draft section output.
//
// This used to ask for ProseMirror JSON via a recursive z.lazy schema.
// Anthropic's structured outputs do not support recursive schemas, so the
// request degraded into something the model filled unreliably and section
// drafting failed even after four retries — losing the whole article each
// time. Markdown is what these models write best, needs no schema for its
// structure, and converts to ProseMirror deterministically in code.
export const SectionDraftSchema = z.object({
  heading: z.string().describe('The section heading, as plain text without any # marks'),
  markdown: z.string().describe(
    'The section body in Markdown. Paragraphs, ### subheadings, - or 1. lists, ' +
    '**bold**, *italic*, [links](url). Do NOT repeat the section heading here.',
  ),
})
export type SectionDraft = z.infer<typeof SectionDraftSchema>

// Image plan step output
export const ImagePlanSchema = z.object({
  images: z.array(z.object({
    sectionIndex: z.number()
      .describe('Zero-based index of the outline section this image should follow'),
    altText: z.string()
      .describe('SEO-optimized alt text. Mandatory — an image without it fails the quality check.'),
    prompt: z.string()
      .describe('Detailed generation prompt: style, composition, subject. No text, charts, logos or real people.'),
  })).describe(`At most ${IMAGES_MAX} images`),
})
export type ImagePlan = z.infer<typeof ImagePlanSchema>

export function normalizeImagePlan(plan: ImagePlan, sectionCount: number): ImagePlan {
  return {
    // An image with no alt text would fail the accessibility check the
    // pipeline just spent a step optimizing, so drop it rather than ship it.
    images: plan.images
      .filter(i => i.altText.trim() && i.prompt.trim())
      .filter(i => Number.isInteger(i.sectionIndex) && i.sectionIndex >= 0 && i.sectionIndex < sectionCount)
      .slice(0, IMAGES_MAX),
  }
}

// Proofread step output
export const ProofreadSchema = z.object({
  issues: z.array(z.object({
    type: z.enum(['spelling','grammar','coherence','brand-voice','banned-word']),
    description: z.string(),
    severity: z.enum(['low','medium','high']),
    // Nullable, not optional: OpenAI's strict structured outputs require every
    // key in `properties` to appear in `required`, so a field the model may
    // leave out has to be expressible as null instead of absent.
    suggestion: z.string().nullable().describe('Concrete fix, or null when there is nothing to suggest'),
  })),
  overallScore: z.number().describe('Quality score, 0 to 100'),
  passesQA: z.boolean(),
})
export type ProofreadResult = z.infer<typeof ProofreadSchema>

export function normalizeProofread(result: ProofreadResult): ProofreadResult {
  return { ...result, overallScore: clamp(result.overallScore, 0, 100, 0) }
}

// SEO step output
//
// The model supplies only the editorial fields. `@context`, `@type`,
// `datePublished` and the like are facts the app already knows, and asking a
// model for them invites hallucinated dates and malformed markup.
//
// The previous shape used `z.record(z.string(), z.unknown())` for the whole
// JSON-LD blob. An open-ended record gives structured outputs nothing to fill,
// and the model returned a literal `{}` every time — the article shipped with
// empty structured data that Google would silently ignore.
const TITLE_TAG_MAX = 60
const META_DESCRIPTION_MAX = 160
const HEADLINE_MAX = 110

export const SeoSchema = z.object({
  titleTag: z.string().describe(`SEO title tag. Keep it under ${TITLE_TAG_MAX} characters.`),
  metaDescription: z.string().describe(`Meta description. Keep it under ${META_DESCRIPTION_MAX} characters.`),
  slug: z.string().describe('URL slug: lowercase, words separated by hyphens, no accents'),
  internalLinkSuggestions: z.array(z.string()).describe('Related topics worth linking to. Empty array if none.'),
  headline: z.string().describe(`schema.org headline. Keep it under ${HEADLINE_MAX} characters — Google truncates beyond that.`),
  articleSection: z.string().describe('Broad topic category, e.g. "Salud canina"'),
  keywords: z.array(z.string()).describe('3-8 schema.org keywords for this article'),
})
export type SeoResult = z.infer<typeof SeoSchema>

/** Input accepted by normalizeSeo: the model may omit internalLinkSuggestions. */
export type SeoInput = Omit<SeoResult, 'internalLinkSuggestions'> & {
  internalLinkSuggestions?: string[]
}

export function normalizeSeo(seo: SeoInput): SeoResult {
  return {
    ...seo,
    titleTag: truncateWords(seo.titleTag, TITLE_TAG_MAX),
    metaDescription: truncateWords(seo.metaDescription, META_DESCRIPTION_MAX),
    headline: truncateWords(seo.headline || seo.titleTag, HEADLINE_MAX),
    slug: slugify(seo.slug) || slugify(seo.titleTag),
    articleSection: seo.articleSection.trim(),
    keywords: seo.keywords.map(k => k.trim()).filter(Boolean),
    internalLinkSuggestions: seo.internalLinkSuggestions ?? [],
  }
}

export interface JsonLdInput {
  seo: SeoResult
  language: string
  wordCount: number
  brandName: string
  publishedAt: Date
}

/**
 * Assembles schema.org BlogPosting markup from the model's editorial fields
 * plus what the application knows for certain.
 */
export function buildJsonLd(input: JsonLdInput): Record<string, unknown> {
  const isoDate = input.publishedAt.toISOString()
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: input.seo.headline || input.seo.titleTag,
    description: input.seo.metaDescription,
    articleSection: input.seo.articleSection,
    keywords: input.seo.keywords.join(', '),
    inLanguage: input.language === 'en' ? 'en' : 'es',
    wordCount: input.wordCount,
    datePublished: isoDate,
    dateModified: isoDate,
    author: { '@type': 'Organization', name: input.brandName },
    publisher: { '@type': 'Organization', name: input.brandName },
  }
}

// Brief (input to generation pipeline)
export interface GenerationBrief {
  brandId: string
  articleId: string
  objective: string
  keywords: string[]
  provider: 'openai' | 'anthropic'
  modelId: string
  brandContext: string  // assembled from RAG
  language: 'es' | 'en' | 'es+en'
  /** Requested length. Undefined means the model picks. */
  targetWords?: number
}
