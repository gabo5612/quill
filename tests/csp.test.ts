/**
 * The CSP must admit the Supabase origin this deployment actually talks to.
 *
 * Locally that origin is plain HTTP on another port, which neither `'self'`
 * nor the `https:` source covers. When it is missing the only symptom is that
 * article images do not appear: the files exist, are public, and serve fine
 * when fetched directly — the browser blocks them and says so nowhere but the
 * console. Hence a test.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'

let failures = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok  ${label}`)
  else { failures++; console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

async function main() {
const { default: config } = await import('../next.config')
const groups = await config.headers!()
const headers: Record<string, string> = {}
for (const g of groups) for (const h of g.headers) headers[h.key] = h.value
const csp = headers['Content-Security-Policy'] ?? ''
const directive = (name: string) =>
  csp.split(';').map(s => s.trim()).find(d => d.startsWith(name + ' ')) ?? ''

const ORIGIN = 'http://127.0.0.1:54321'
check('a CSP is emitted at all', csp.length > 0)
check('img-src admits the Supabase origin', directive('img-src').includes(ORIGIN), directive('img-src'))
check('connect-src admits the Supabase origin', directive('connect-src').includes(ORIGIN))
check('media-src admits the Supabase origin', directive('media-src').includes(ORIGIN))
check('connect-src admits the websocket origin for realtime',
  directive('connect-src').includes('ws://127.0.0.1:54321'))
check('no dangling null/undefined source leaked in',
  !csp.includes('undefined') && !csp.includes('null'), csp.slice(0, 160))
check('the hardened directives survived',
  ['frame-ancestors', 'object-src', 'base-uri', 'form-action'].every(d => csp.includes(d)))

// next/image must accept the same origin, or <Image> 400s where <img> works.
const patterns = (config.images?.remotePatterns ?? []) as Array<{ protocol?: string; hostname?: string; port?: string }>
check('next/image accepts the Supabase host',
  patterns.some(p => p.hostname === '127.0.0.1' && p.protocol === 'http' && p.port === '54321'),
  patterns)

console.log(`\n${failures === 0 ? 'all passed' : `${failures} failed`}`)
if (failures > 0) process.exit(1)
}

void main()
