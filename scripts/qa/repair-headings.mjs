import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const DIR = HERE

// One-off repair: articles saved before the toPlainDoc fix lost every attrs
// bag. body_markdown was written by the pipeline and is intact, so the
// ProseMirror doc can be rebuilt from it losslessly.
import { createRequire } from 'node:module'; import fs from 'node:fs'


const require_ = createRequire(path.join(ROOT, 'package.json'))
const { createClient } = require_('@supabase/supabase-js')
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env.local'),'utf8')
  .split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},db:{schema:'app'}})
const { markdownToProseMirror } = await import(pathToFileURL(path.join(ROOT, 'lib/content/markdown-to-prosemirror.ts')).href)

const { data: rows, error } = await db.from('article_body').select('article_id, body_prosemirror, body_markdown')
if (error) throw error

const apply = process.argv.includes('--apply')
let broken = 0, repaired = 0, skipped = 0

for (const row of rows) {
  const nodes = row.body_prosemirror?.content ?? []
  const headings = nodes.filter(n => n.type === 'heading')
  const missing = headings.filter(h => h.attrs?.level == null).length
  if (!missing) continue
  broken++
  if (!row.body_markdown?.trim()) {
    console.log(`  skip ${row.article_id} — ${missing} broken headings but no markdown to rebuild from`)
    skipped++
    continue
  }
  const rebuilt = { type: 'doc', content: markdownToProseMirror(row.body_markdown) }
  const levels = rebuilt.content.filter(n => n.type === 'heading').map(n => n.attrs.level)
  if (levels.length !== headings.length) {
    console.log(`  warn ${row.article_id} — markdown yields ${levels.length} headings vs ${headings.length} stored; repairing anyway`)
  }
  console.log(`  ${apply ? 'fix ' : 'plan'} ${row.article_id} — ${missing} headings → [${levels.join(',')}]`)
  if (apply) {
    const { error: e } = await db.from('article_body').update({ body_prosemirror: rebuilt }).eq('article_id', row.article_id)
    if (e) { console.log(`       FAILED: ${e.message}`); continue }
    repaired++
  }
}
console.log(`\n${rows.length} article bodies | ${broken} damaged | ${apply ? repaired + ' repaired' : 'dry run — pass --apply'}${skipped ? ` | ${skipped} unrepairable` : ''}`)
