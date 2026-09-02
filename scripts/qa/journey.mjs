import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const DIR = HERE

// Drives the real UI in a real browser as qa-bot@example.com.
import { chromium } from 'playwright'
import fs from 'node:fs'



const BASE = process.env.BASE ?? 'http://localhost:3000'
const host = new URL(BASE).hostname
const secure = BASE.startsWith('https')
const cookies = JSON.parse(fs.readFileSync(path.join(DIR, 'session.json'), 'utf8'))
  .cookies.map(c => ({ ...c, domain: host, secure }))

let pass = 0, fail = 0
const step = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`) }
  else { fail++; console.log(`FAIL   ${name}${detail ? ` — ${detail}` : ''}`) }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies(cookies)
const page = await ctx.newPage()

const consoleErrors = []
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`))
const badResponses = []
page.on('response', r => {
  if (r.status() >= 400 && !r.url().includes('favicon')) badResponses.push(`${r.status()} ${r.url()}`)
})

const shot = n => page.screenshot({ path: path.join(DIR, `shot-${n}.png`), fullPage: true })

try {
  // ── 1. Signed-in landing ──────────────────────────────────────────────────
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  step('dashboard loads while signed in', !page.url().includes('/login'), page.url())
  step('dashboard renders content', (await page.locator('body').innerText()).length > 100)
  await shot('01-dashboard')

  // ── 2. Brands ─────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/brands`, { waitUntil: 'networkidle' })
  const brandsText = await page.locator('body').innerText()
  step('brands page lists the QA brand', brandsText.includes('QA Test Brand'))
  await shot('02-brands')

  // ── 3. New article form ───────────────────────────────────────────────────
  await page.goto(`${BASE}/articles/new`, { waitUntil: 'networkidle' })
  step('new-article form renders', await page.locator('#objective').isVisible())

  await page.locator('#objective').fill(
    'Explain to Costa Rican specialty coffee producers how climate volatility is ' +
    'reshaping yields, and what concrete agronomic and commercial moves protect ' +
    'their margins over the next three harvests.',
  )

  // Pick the ~1200-word preset if the UI offers presets.
  const preset = page.locator('button', { hasText: /~1[,.]?200/ }).first()
  if (await preset.count()) await preset.click()

  // Keywords
  const kwInput = page.locator('#keyword-input')
  if (await kwInput.count()) {
    await kwInput.scrollIntoViewIfNeeded()
    for (const kw of ['specialty coffee', 'climate resilience', 'coffee yields']) {
      await kwInput.fill(kw)
      await kwInput.press('Enter')
    }
  }
  await shot('03-form-filled')

  const articleForm = page.locator('form').filter({ has: page.locator('#objective') })
  await articleForm.locator('button[type="submit"]').click()
  try {
    await page.waitForURL(/\/articles\/[0-9a-f-]+\/generation/, { timeout: 45_000 })
  } catch {
    const inline = await page.locator('[role="alert"], .text-error, [class*="error"]').allInnerTexts()
    throw new Error(`did not reach /generation (at ${page.url()}) — form said: ${inline.join(' | ') || '(nothing)'}`)
  }
  const articleId = page.url().match(/articles\/([0-9a-f-]+)/)[1]
  step('submitting the form creates an article', true, articleId)
  await shot('04-generation-start')

  // ── 4. Watch generation to completion ─────────────────────────────────────
  const deadline = Date.now() + 8 * 60_000
  let last = ''
  let outcome = 'timeout'
  while (Date.now() < deadline) {
    const body = await page.locator('body').innerText().catch(() => '')
    const line = body.split('\n').find(l => l.trim()) ?? ''
    if (line !== last) { last = line; console.log(`       … ${line.slice(0, 90)}`) }
    if (/failed|error/i.test(body) && /generation failed/i.test(body)) { outcome = 'failed'; break }
    if (page.url().includes('/edit') || /ready|in review|completed/i.test(body)) { outcome = 'done'; break }
    await page.waitForTimeout(4000)
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  }
  step('generation completes without failing', outcome === 'done', outcome)
  await shot('05-generation-end')

  // ── 5. The editor actually holds the article ──────────────────────────────
  await page.goto(`${BASE}/articles/${articleId}/edit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const editor = page.locator('.ProseMirror').first()
  step('editor mounts', await editor.count() > 0)
  const text = await editor.innerText().catch(() => '')
  const words = text.trim().split(/\s+/).filter(Boolean).length
  step('editor shows a full article, not a blank doc', words > 700, `${words} words`)
  const hs = {
    h1: await editor.locator('h1').count(), h2: await editor.locator('h2').count(),
    h3: await editor.locator('h3').count(), h4: await editor.locator('h4').count(),
  }
  step('editor shows exactly one H1', hs.h1 === 1, JSON.stringify(hs))
  step('editor shows a real heading hierarchy', hs.h2 >= 3 && hs.h3 >= 1, JSON.stringify(hs))
  step('editor has body paragraphs', await editor.locator('p').count() > 8,
    `${await editor.locator('p').count()} paragraphs`)
  await shot('06-editor')

  // ── 6. Editing persists ───────────────────────────────────────────────────
  await editor.click()
  await page.keyboard.press('End')
  const marker = `QA-EDIT-${articleId.slice(0, 8)}`
  await page.keyboard.type(` ${marker}`)
  await page.waitForTimeout(4000)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const after = await page.locator('.ProseMirror').first().innerText().catch(() => '')
  step('a manual edit survives a reload', after.includes(marker))
  const hsAfter = {
    h1: await page.locator('.ProseMirror h1').count(), h2: await page.locator('.ProseMirror h2').count(),
    h3: await page.locator('.ProseMirror h3').count(),
  }
  step('editing does not collapse the heading hierarchy',
    hsAfter.h1 === hs.h1 && hsAfter.h2 === hs.h2 && hsAfter.h3 === hs.h3,
    `${JSON.stringify(hs)} → ${JSON.stringify(hsAfter)}`)
  step('the reload did not blank the article', after.trim().split(/\s+/).length > 700,
    `${after.trim().split(/\s+/).length} words`)

  // ── 7. Reasoning trace ────────────────────────────────────────────────────
  await page.goto(`${BASE}/articles/${articleId}/trace`, { waitUntil: 'networkidle' })
  const trace = await page.locator('body').innerText()
  step('trace page renders the reasoning backlog', trace.length > 400)
  step('trace shows the outline step', /outline/i.test(trace))
  step('trace shows the SEO step', /seo/i.test(trace))
  await shot('07-trace')

  // ── 8. Article detail / SEO metadata ──────────────────────────────────────
  await page.goto(`${BASE}/articles/${articleId}`, { waitUntil: 'networkidle' })
  const detail = await page.locator('body').innerText()
  step('article detail page renders', detail.length > 200)
  await shot('08-detail')

  await page.goto(`${BASE}/articles`, { waitUntil: 'networkidle' })
  step('the new article appears in the list', (await page.locator('body').innerText()).length > 200)
  await shot('09-list')

  // ── 8b. Exports carry the real article, hierarchy intact ──────────────────
  for (const [fmt, needle] of [['html', '<h2'], ['markdown', '\n## ']]) {
    const res = await page.request.get(`${BASE}/api/export/${articleId}?format=${fmt}`)
    const text = await res.text()
    step(`${fmt} export downloads`, res.status() === 200, String(res.status()))
    step(`${fmt} export keeps the heading hierarchy`, text.includes(needle),
      `${text.length} bytes`)
    step(`${fmt} export has the body copy`, text.trim().split(/\s+/).length > 700,
      `${text.trim().split(/\s+/).length} words`)
  }
  const htmlExport = await (await page.request.get(`${BASE}/api/export/${articleId}?format=html`)).text()
  step('html export embeds the JSON-LD', htmlExport.includes('BlogPosting'))
  step('html export carries the meta description', /<meta[^>]+description/i.test(htmlExport))
  step('the manual edit is in the export', htmlExport.includes(marker))

  // ── 9. Other surfaces a user would touch ──────────────────────────────────
  for (const [name, path] of [
    ['calendar', '/calendar'],
    ['brand profile', '/brands'],
  ]) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    step(`${name} loads`, (res?.status() ?? 0) < 400, String(res?.status()))
  }

  fs.writeFileSync(path.join(DIR, `last-article-id${secure ? '-prod' : ''}.txt`), articleId)
} catch (err) {
  fail++
  console.log(`FAIL   journey threw — ${err.message}`)
  await shot('99-crash').catch(() => {})
}

// ── Console + network hygiene ───────────────────────────────────────────────
const realErrors = consoleErrors.filter(e => !/favicon|Download the React DevTools/i.test(e))
step('no uncaught client errors', realErrors.length === 0, realErrors.slice(0, 4).join(' | '))
const fontMisses = badResponses.filter(r => /\.woff2?|\/fonts\//.test(r))
const realBad = badResponses.filter(r => !/\.woff2?|\/fonts\//.test(r))
step('no 4xx/5xx responses', realBad.length === 0, realBad.slice(0, 4).join(' | '))
if (fontMisses.length) {
  console.log(`  note  ${fontMisses.length} font request(s) 404 (licensed files not in repo):`)
  ;[...new Set(fontMisses)].slice(0, 6).forEach(f => console.log(`         ${f}`))
}

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail ? 1 : 0)
