import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const DIR = HERE

import { createRequire } from 'node:module'
import fs from 'node:fs'


const require_ = createRequire(path.join(ROOT, 'package.json'))
const { createClient } = require_('@supabase/supabase-js')
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env.local'),'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth:{persistSession:false}, db:{schema:'app'} })

const id = fs.readFileSync(process.argv[2], 'utf8').trim()
const { data: a, error } = await db.from('articles').select('*').eq('id', id).single()
if (error) throw error
const { data: b, error: bErr } = await db.from('article_body').select('*').eq('article_id', id).single()
if (bErr) throw new Error('no article_body row: ' + bErr.message)

const doc = b.body_prosemirror
const nodes = doc?.content ?? []
const count = t => nodes.filter(n => n.type === t).length
const headings = nodes.filter(n => n.type === 'heading')
const byLevel = {}
headings.forEach(h => { const L = h.attrs?.level ?? 'MISSING'; byLevel[L] = (byLevel[L] ?? 0) + 1 })
const noLevel = headings.filter(h => h.attrs?.level == null)
if (noLevel.length) console.log('!! headings without attrs.level:', JSON.stringify(noLevel.slice(0,3)))

const walk = ns => ns.flatMap(n => [n, ...walk(n.content ?? [])])
const all = walk(nodes)
const text = all.filter(n => n.type === 'text').map(n => n.text).join(' ')
const words = text.trim().split(/\s+/).filter(Boolean).length

console.log('ARTICLE     ', id)
console.log('status      ', a.status)
console.log('title       ', a.title)
console.log('words       ', words, '(target', a.target_words + ')')
console.log('top nodes   ', nodes.length, JSON.stringify(Object.fromEntries(
  [...new Set(nodes.map(n=>n.type))].map(t=>[t,count(t)]))))
console.log('headings    ', JSON.stringify(byLevel))
console.log('lists       ', all.filter(n=>n.type==='listItem').length, 'items')
console.log('links       ', all.filter(n=>n.marks?.some(m=>m.type==='link')).length)
console.log('bold/italic ', all.filter(n=>n.marks?.some(m=>m.type==='bold'||m.type==='italic')).length)
console.log('images      ', all.filter(n=>n.type==='image').length)
console.log('--- SEO ---')
console.log('title_tag   ', JSON.stringify(b.title_tag), `(${(b.title_tag??'').length} chars)`)
console.log('meta_desc   ', JSON.stringify(b.meta_description), `(${(b.meta_description??'').length} chars)`)
console.log('slug        ', b.slug)
console.log('keywords    ', JSON.stringify(a.keywords))
console.log('jsonld      ', JSON.stringify(b.jsonld, null, 1))
console.log('html bytes  ', (b.body_html ?? '').length, '| markdown bytes', (b.body_markdown ?? '').length)
console.log('html sample ', (b.body_html ?? '').slice(0, 200).replace(/\n/g, ' '))
console.log('--- STRUCTURE SANITY ---')
const problems = []
if (byLevel[1] !== 1) problems.push(`expected exactly 1 H1, got ${byLevel[1] ?? 0}`)
if (!headings.length) problems.push('no headings')
let prev = 0
for (const h of headings) {
  const L = h.attrs?.level
  if (L == null) { problems.push('heading node with no attrs.level'); continue }
  if (L > prev + 1 && prev !== 0) problems.push(`heading jumps H${prev}→H${L}`)
  prev = L
}
const bannedWords = ['delve','tapestry','moreover','furthermore','in conclusion','en conclusión','cabe destacar','es importante destacar','en resumen']
const hits = bannedWords.filter(w => text.toLowerCase().includes(w))
if (hits.length) problems.push('banned words: ' + hits.join(', '))
const empties = nodes.filter(n => n.type === 'paragraph' && !(n.content?.length))
if (empties.length) problems.push(`${empties.length} empty paragraph(s)`)
if (/\*\*|^#{1,6} |\]\(http/m.test(text)) problems.push('raw markdown leaked into the text')
console.log(problems.length ? problems.map(p=>'  ✗ '+p).join('\n') : '  ✓ clean')

const { data: gens } = await db.from('generations').select('step,status,cost_usd,payload')
  .eq('article_id', id).order('created_at')
console.log('--- PIPELINE ---')
console.log('steps       ', gens?.length, '| errors:', gens?.filter(g=>g.status!=='success').length)
console.log('cost        $' + (gens?.reduce((s,g)=>s+Number(g.cost_usd||0),0) ?? 0).toFixed(4))
gens?.forEach(g => console.log(`  ${g.status==='success'?'✓':'✗'} ${g.step.padEnd(22)} ${JSON.stringify(g.payload ?? {}).slice(0,110)}`))
