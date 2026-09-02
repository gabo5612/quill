import type { PMDocument } from './article-schema'

type LooseNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: LooseNode[]
}

export interface QualityScore {
  overall: number  // 0-100
  headingHierarchy: number
  keywordDensity: number
  readability: number
  wordCount: number
  hasSlug: boolean
  hasMetaDescription: boolean
  allImagesHaveAlt: boolean
  issues: string[]
}

/** Collects all plain-text runs so density and readability can be computed. */
function collectText(nodes: LooseNode[] | undefined, out: string[] = []): string[] {
  for (const node of nodes ?? []) {
    if (node.type === 'text' && node.text) out.push(node.text)
    if (node.content) collectText(node.content, out)
  }
  return out
}

/**
 * Fernández-Huerta readability — the Spanish-language analogue of
 * Flesch Reading Ease, which is what this tool's content is mostly written in.
 * Higher is easier; ~60+ reads as accessible.
 */
function readabilityScore(text: string): number {
  const words = text.split(/\s+/).filter(Boolean)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  if (words.length === 0 || sentences.length === 0) return 0

  const syllables = words.reduce(
    (sum, w) => sum + Math.max(1, (w.toLowerCase().match(/[aeiouáéíóúü]+/g) ?? []).length),
    0,
  )

  const raw =
    206.84 - 60 * (syllables / words.length) - 1.02 * (words.length / sentences.length)

  return Math.max(0, Math.min(100, Math.round(raw)))
}

/**
 * Keyword density scored against the 0.5%–2.5% band: below is under-optimised,
 * above reads as stuffing.
 */
function keywordDensityScore(text: string, keywords: string[]): { score: number; issues: string[] } {
  const issues: string[] = []
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0 || keywords.length === 0) return { score: 100, issues }

  const haystack = ` ${words.join(' ')} `
  let total = 0

  for (const keyword of keywords) {
    const needle = keyword.toLowerCase().trim()
    if (!needle) continue
    const occurrences = haystack.split(` ${needle} `).length - 1
    total += occurrences
    if (occurrences === 0) issues.push(`Keyword not found in the body: “${keyword}”`)
  }

  const density = (total / words.length) * 100
  if (density > 2.5) {
    issues.push(`Keyword density is ${density.toFixed(1)}% — above the 2.5% stuffing threshold`)
    return { score: 60, issues }
  }
  if (density < 0.5) return { score: 75, issues }
  return { score: 100, issues }
}

export function scoreArticle(
  doc: PMDocument,
  keywords: string[],
  meta: { slug?: string; metaDescription?: string }
): QualityScore {
  const issues: string[] = []
  let score = 100

  const nodes = (doc as unknown as LooseNode).content ?? []

  // Heading hierarchy — flag skipped levels (H2 → H4).
  let lastLevel = 0
  let headingScore = 100
  function checkHeadings(list: LooseNode[]) {
    for (const node of list) {
      if (node.type === 'heading') {
        const level = Number(node.attrs?.level ?? 2)
        if (lastLevel > 0 && level > lastLevel + 1) {
          issues.push(`Heading hierarchy jump: H${lastLevel} → H${level}`)
          headingScore -= 20
        }
        lastLevel = level
      }
      if (node.content) checkHeadings(node.content)
    }
  }
  checkHeadings(nodes)

  let allImagesHaveAlt = true
  function checkImages(list: LooseNode[]) {
    for (const node of list) {
      if (node.type === 'image' && !node.attrs?.alt) {
        allImagesHaveAlt = false
        issues.push('Image missing alt text')
        score -= 10
      }
      if (node.content) checkImages(node.content)
    }
  }
  checkImages(nodes)

  const text = collectText(nodes).join(' ')
  const wordCount = text.split(/\s+/).filter(Boolean).length

  const density = keywordDensityScore(text, keywords)
  issues.push(...density.issues)

  const readability = readabilityScore(text)

  if (!meta.slug) { issues.push('Missing URL slug'); score -= 10 }
  if (!meta.metaDescription) { issues.push('Missing meta description'); score -= 10 }
  if (wordCount < 300) { issues.push(`Only ${wordCount} words — thin content`); score -= 15 }
  if (density.score < 100) score -= 10
  if (readability < 40) { issues.push('Readability is low — sentences may be too long'); score -= 5 }

  return {
    overall: Math.max(0, Math.min(100, score)),
    headingHierarchy: Math.max(0, headingScore),
    keywordDensity: density.score,
    readability,
    wordCount,
    hasSlug: !!meta.slug,
    hasMetaDescription: !!meta.metaDescription,
    allImagesHaveAlt,
    issues,
  }
}
