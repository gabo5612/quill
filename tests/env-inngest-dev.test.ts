import { ENV_CONTRACT, getEnvReport } from '../lib/env'

let failures = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok  ${label}`)
  else { failures++; console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const BASE = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  OPENAI_API_KEY: 'sk-test',
}
function withEnv(vars: Record<string, string>) {
  for (const r of ENV_CONTRACT) delete process.env[r.name]
  delete process.env.INNGEST_DEV
  for (const [k, v] of Object.entries(vars)) process.env[k] = v
  return getEnvReport()
}

// ── INNGEST_DEV=1 means the local dev server, which needs no cloud keys ──────
const dev = withEnv({ ...BASE, INNGEST_DEV: '1' })
check('INNGEST_DEV: the deployment is ok', dev.ok, dev.missingRequired.map(r => r.name))
check('INNGEST_DEV: event key is not missing-required',
  !dev.missingRequired.some(r => r.name === 'INNGEST_EVENT_KEY'))
check('INNGEST_DEV: signing key is not missing-required',
  !dev.missingRequired.some(r => r.name === 'INNGEST_SIGNING_KEY'))

// ── Without INNGEST_DEV the cloud keys are genuinely required ────────────────
const cloud = withEnv({ ...BASE })
check('no INNGEST_DEV: deployment is not ok', cloud.ok === false)
check('no INNGEST_DEV: event key is missing-required',
  cloud.missingRequired.some(r => r.name === 'INNGEST_EVENT_KEY'))
check('no INNGEST_DEV: signing key is missing-required',
  cloud.missingRequired.some(r => r.name === 'INNGEST_SIGNING_KEY'))

const cloudWithKeys = withEnv({ ...BASE, INNGEST_EVENT_KEY: 'evt', INNGEST_SIGNING_KEY: 'signkey-x' })
check('cloud keys present: deployment is ok', cloudWithKeys.ok)

// ── INNGEST_DEV must not paper over a genuinely broken config ────────────────
const devNoSupabase = withEnv({ OPENAI_API_KEY: 'sk', INNGEST_DEV: '1' })
check('INNGEST_DEV does not excuse missing Supabase', devNoSupabase.ok === false)

console.log(`\n${failures === 0 ? 'all passed' : `${failures} failed`}`)
if (failures > 0) process.exit(1)
