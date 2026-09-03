import { isLocalDevAuthEnabled, localDevUserEmail } from '../lib/auth/local-dev'

let failures = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok  ${label}`)
  else { failures++; console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const set = (user?: string, url?: string) => {
  delete process.env.LOCAL_DEV_USER; delete process.env.NEXT_PUBLIC_SUPABASE_URL
  if (user !== undefined) process.env.LOCAL_DEV_USER = user
  if (url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = url
}

set('owner@example.com', 'http://127.0.0.1:54321')
check('enabled against 127.0.0.1', isLocalDevAuthEnabled())
check('returns the configured address', localDevUserEmail() === 'owner@example.com')

set('owner@example.com', 'http://localhost:54321')
check('enabled against localhost', isLocalDevAuthEnabled())

// ── The guard that matters: never against a hosted project ──────────────────
set('owner@example.com', 'https://abcdefgh.supabase.co')
check('DISABLED against a hosted Supabase project', isLocalDevAuthEnabled() === false)
check('hosted project yields no address', localDevUserEmail() === null)

set(undefined, 'http://127.0.0.1:54321')
check('disabled when LOCAL_DEV_USER is unset', isLocalDevAuthEnabled() === false)

set('   ', 'http://127.0.0.1:54321')
check('disabled when LOCAL_DEV_USER is blank', isLocalDevAuthEnabled() === false)

set('owner@example.com', 'not-a-url')
check('disabled when the Supabase URL is malformed', isLocalDevAuthEnabled() === false)

set('owner@example.com', undefined)
check('disabled when the Supabase URL is missing', isLocalDevAuthEnabled() === false)

console.log(`\n${failures === 0 ? 'all passed' : `${failures} failed`}`)
if (failures > 0) process.exit(1)
