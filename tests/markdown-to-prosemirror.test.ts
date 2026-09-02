import { markdownToProseMirror } from '../lib/content/markdown-to-prosemirror'
import { assembleDocument, validateArticleDoc } from '../lib/content/article-schema'
import { prosemirrorToMarkdown } from '../lib/content/markdown-serializer'

let pass = 0, fail = 0
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ok  ${name}`) }
  else { fail++; console.log(`FAIL  ${name}`, JSON.stringify(got)) }
}

// 1 paragraphs joined across soft wraps
let r = markdownToProseMirror('Line one\nstill same para.\n\nSecond para.')
check('soft wraps merge into one paragraph', r.length === 2 && r[0].content?.[0].text === 'Line one still same para.', r)

// 2 headings
r = markdownToProseMirror('### Sub head\n\nBody.')
check('### -> heading level 3', r[0].type === 'heading' && r[0].attrs?.level === 3, r[0])

// 3 bold / italic / link / code
r = markdownToProseMirror('A **bold** and *it* and `co` and [x](https://a.co/b).')
const marks = (r[0].content ?? []).map(n => n.marks?.[0]?.type ?? 'plain')
check('inline marks', JSON.stringify(marks) === '["plain","bold","plain","italic","plain","code","plain","link","plain"]', marks)
check('link href', (r[0].content ?? []).find(n => n.marks?.[0]?.type === 'link')?.marks?.[0].attrs?.href === 'https://a.co/b')

// 4 bullet list
r = markdownToProseMirror('- one\n- two\n- three')
check('bullet list w/ 3 items', r[0].type === 'bulletList' && r[0].content?.length === 3, r[0])

// 5 ordered list
r = markdownToProseMirror('1. a\n2. b')
check('ordered list', r[0].type === 'orderedList' && r[0].content?.length === 2, r[0])

// 6 nested list
r = markdownToProseMirror('- top\n  - nested\n- second')
const nested = r[0].content?.[0].content
check('nested list attaches to parent item', r[0].content?.length === 2 && nested?.length === 2 && nested?.[1].type === 'bulletList', r[0])

// 7 list terminates back into a paragraph
r = markdownToProseMirror('- a\n\nAfter the list.')
check('paragraph after list', r.length === 2 && r[1].type === 'paragraph', r)

// 8 blockquote
r = markdownToProseMirror('> quoted line\n> more')
check('blockquote', r[0].type === 'blockquote' && r[0].content?.[0].type === 'paragraph', r[0])

// 9 hr + code fence
r = markdownToProseMirror('---\n\n```js\nconst a = 1\n```')
check('hr then codeBlock', r[0].type === 'horizontalRule' && r[1].type === 'codeBlock' && r[1].attrs?.language === 'js', r)

// 10 image
r = markdownToProseMirror('![alt text](https://i.co/a.png)')
check('image node', r[0].content?.[0].type === 'image' && r[0].content?.[0].attrs?.src === 'https://i.co/a.png', r[0])

// 11 unmatched asterisk must not eat the line
r = markdownToProseMirror('5 * 3 = 15 and a lone * star')
check('unmatched asterisks stay literal', r[0].content?.[0].text === '5 * 3 = 15 and a lone * star', r[0])

r = markdownToProseMirror('snake_case_name and another_var here')
check('intra-word underscores stay literal', r[0].content?.length === 1 && r[0].content?.[0].text === 'snake_case_name and another_var here', r[0])
r = markdownToProseMirror('_leading italic_ works')
check('underscore italic still works at word start', r[0].content?.[0].marks?.[0].type === 'italic', r[0])
r = markdownToProseMirror('**Real bold** next to 2 * 3')
check('bold still works beside a stray asterisk', r[0].content?.[0].marks?.[0].type === 'bold' && r[0].content?.[1].text === ' next to 2 * 3', r[0])

// 12 empty input
check('empty markdown -> no nodes', markdownToProseMirror('').length === 0)
check('whitespace-only -> no nodes', markdownToProseMirror('\n\n   \n').length === 0)

// 13 assembleDocument: dedupes repeated heading + demotes H1/H2 in body
const doc = assembleDocument('The Title', [
  { heading: 'First Section', markdown: '## First Section\n\nIntro text.\n\n# Rogue H1\n\nMore.' },
  { heading: 'Second Section', markdown: 'Body two.\n\n### Real sub\n\nx' },
])
const levels = (doc.content as any[]).filter(n => n.type === 'heading').map(n => n.attrs.level)
check('heading levels 1,2,3,2,3', JSON.stringify(levels) === '[1,2,3,2,3]', levels)
const texts = (doc.content as any[]).filter(n => n.type === 'heading').map(n => n.content?.[0]?.text)
check('duplicate heading removed', !texts.slice(2).includes('First Section'), texts)

// 14 validates against the article schema
const v = validateArticleDoc(doc)
check('assembled doc passes validateArticleDoc', v.valid, v.errors)

// 15 round-trips back through the markdown serializer without losing content
const back = prosemirrorToMarkdown(doc)
check('round-trip keeps body copy', back.includes('Intro text.') && back.includes('Body two.'), back)
check('round-trip keeps the H1', back.includes('# The Title'), back)

// 16 realistic section
const real = markdownToProseMirror(`Costa Rica's coffee sector faces a real problem: **climate volatility**.
Yields fell 12% last season.

### What growers are doing

- Shade-grown replanting at higher altitude
- Switching to *Geisha* and other resilient varietals
- Investing in [micro-mills](https://example.com/micro-mills)

The economics still work, but margins are thinner.`)
check('realistic section: 4 blocks', real.length === 4 && real[0].type === 'paragraph' && real[1].type === 'heading' && real[2].type === 'bulletList' && real[3].type === 'paragraph', real.map(n => n.type))
check('realistic section: 3 bullets', real[2].content?.length === 3)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
