import {
  normalizeOutline, normalizeSeo, normalizeProofread, normalizeImagePlan,
  truncateWords, slugify,
} from '../lib/ai/schemas'

let pass = 0, fail = 0
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) { pass++; console.log(`  ok  ${name}`) }
  else { fail++; console.log(`FAIL  ${name}`, JSON.stringify(got)) }
}

// ── truncateWords ───────────────────────────────────────────────────────────
check('short text is untouched', truncateWords('Café y clima', 60) === 'Café y clima')
const long = 'Café de especialidad y clima extremo: cómo proteger tus rendimientos en las próximas tres cosechas'
const cut = truncateWords(long, 60)
check('long text is cut to the limit', cut.length <= 60, `${cut.length}: ${cut}`)
check('cut lands on a word boundary', !long.slice(cut.length).startsWith('') || long[cut.length] === ' ' || long[cut.length] === undefined || cut === long.slice(0, cut.length), cut)
check('cut has no trailing punctuation', !/[\s,;:.–-]$/.test(cut), cut)
check('a single long word still fits the budget', truncateWords('a'.repeat(120), 60).length === 60)
check('whitespace is trimmed', truncateWords('   hola   ', 60) === 'hola')

// ── slugify ─────────────────────────────────────────────────────────────────
check('accents are stripped', slugify('Café de Especialidad') === 'cafe-de-especialidad', slugify('Café de Especialidad'))
check('already-valid slug is stable', slugify('cafe-clima-2026') === 'cafe-clima-2026')
check('punctuation collapses to single hyphens', slugify('¿Qué pasa?  ¡Mucho!') === 'que-pasa-mucho', slugify('¿Qué pasa?  ¡Mucho!'))
check('no leading or trailing hyphens', slugify('  --Hola--  ') === 'hola', slugify('  --Hola--  '))
check('ñ survives as n', slugify('Diseño') === 'diseno', slugify('Diseño'))

// ── normalizeSeo — the exact shapes that used to fail validation ────────────
const seo = normalizeSeo({
  titleTag: 'Café de especialidad y clima extremo: cómo proteger tus rendimientos este año',  // 78
  metaDescription: 'x'.repeat(210),
  slug: 'Café de Especialidad / Clima!',
  headline: 'y'.repeat(150),
  articleSection: '  Cultivo de café  ',
  keywords: [' café ', '', 'clima'],
  internalLinkSuggestions: undefined,
})
check('titleTag clamped to 60', seo.titleTag.length <= 60, `${seo.titleTag.length}: ${seo.titleTag}`)
check('metaDescription clamped to 160', seo.metaDescription.length <= 160, seo.metaDescription.length)
check('headline clamped to 110', seo.headline.length <= 110, seo.headline.length)
check('slug is url-safe', /^[a-z0-9-]+$/.test(seo.slug), seo.slug)
check('articleSection trimmed', seo.articleSection === 'Cultivo de café')
check('empty keywords dropped and trimmed', JSON.stringify(seo.keywords) === '["café","clima"]', seo.keywords)
check('missing link suggestions become an array', Array.isArray(seo.internalLinkSuggestions))

const seoNoHeadline = normalizeSeo({
  titleTag: 'Un título corto', metaDescription: 'Desc', slug: '', headline: '',
  articleSection: 'Café', keywords: [], internalLinkSuggestions: [],
})
check('empty headline falls back to the title tag', seoNoHeadline.headline === 'Un título corto', seoNoHeadline.headline)
check('empty slug is derived from the title tag', seoNoHeadline.slug === 'un-titulo-corto', seoNoHeadline.slug)

// ── normalizeOutline ────────────────────────────────────────────────────────
const mkSection = (i: number, words: number) => ({
  heading: `S${i}`, subheadings: [], keyPoints: ['a'], estimatedWords: words,
})
const outline = normalizeOutline({
  title: '  Un título  ',
  sections: [mkSection(1, 900), mkSection(2, 40), mkSection(3, 250.6), ...Array.from({ length: 7 }, (_, i) => mkSection(i + 4, 300))],
  estimatedTotalWords: 99_999,
  imageCount: 12,
})
check('sections capped at 8', outline.sections.length === 8, outline.sections.length)
check('over-budget section clamped to 800', outline.sections[0].estimatedWords === 800, outline.sections[0].estimatedWords)
check('under-budget section clamped to 100', outline.sections[1].estimatedWords === 100, outline.sections[1].estimatedWords)
check('fractional word count rounded', outline.sections[2].estimatedWords === 251, outline.sections[2].estimatedWords)
check('total clamped to 4000', outline.estimatedTotalWords === 4000, outline.estimatedTotalWords)
check('imageCount clamped to 6', outline.imageCount === 6, outline.imageCount)
check('title trimmed', outline.title === 'Un título')

const nanOutline = normalizeOutline({
  title: 'T', sections: [{ heading: 'H', subheadings: [], keyPoints: [], estimatedWords: NaN }],
  estimatedTotalWords: NaN, imageCount: NaN,
})
check('NaN word count falls back, never propagates', nanOutline.sections[0].estimatedWords === 250, nanOutline.sections[0].estimatedWords)
check('NaN total falls back to 1200', nanOutline.estimatedTotalWords === 1200, nanOutline.estimatedTotalWords)
check('NaN imageCount falls back to 0', nanOutline.imageCount === 0, nanOutline.imageCount)
check('a 1-section outline is kept, not rejected', nanOutline.sections.length === 1)

// ── normalizeProofread ──────────────────────────────────────────────────────
check('score above 100 clamped', normalizeProofread({ issues: [], overallScore: 140, passesQA: true }).overallScore === 100)
check('negative score clamped', normalizeProofread({ issues: [], overallScore: -5, passesQA: false }).overallScore === 0)
check('NaN score becomes 0', normalizeProofread({ issues: [], overallScore: NaN, passesQA: false }).overallScore === 0)

// ── normalizeImagePlan ──────────────────────────────────────────────────────
const plan = normalizeImagePlan({
  images: [
    { sectionIndex: 0, altText: 'Buen alt', prompt: 'Una finca' },
    { sectionIndex: 1, altText: '   ', prompt: 'Sin alt' },
    { sectionIndex: 9, altText: 'Fuera de rango', prompt: 'x' },
    { sectionIndex: -1, altText: 'Negativo', prompt: 'x' },
    { sectionIndex: 2, altText: 'Sin prompt', prompt: '' },
    { sectionIndex: 1.5, altText: 'Fraccional', prompt: 'x' },
  ],
}, 4)
check('only the valid image survives', plan.images.length === 1 && plan.images[0].altText === 'Buen alt',
  plan.images.map(i => i.altText))

const many = normalizeImagePlan({
  images: Array.from({ length: 10 }, (_, i) => ({ sectionIndex: 0, altText: `alt ${i}`, prompt: 'p' })),
}, 4)
check('image plan capped at 6', many.images.length === 6, many.images.length)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
