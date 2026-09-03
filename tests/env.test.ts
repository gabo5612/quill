import { ENV_CONTRACT, getEnvReport } from '../lib/env'

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { console.log(`  ok  ${label}`) }
  else { failures++; console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const SUPABASE = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  INNGEST_EVENT_KEY: 'evt',
  INNGEST_SIGNING_KEY: 'signkey-x',
}

function withEnv(vars: Record<string, string | undefined>) {
  for (const r of ENV_CONTRACT) delete process.env[r.name]
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v
  return getEnvReport()
}

// ── Neither provider is individually required; at least one of them is ───────
const onlyOpenAI = withEnv({ ...SUPABASE, OPENAI_API_KEY: 'sk-test' })
check('OpenAI alone is a usable deployment', onlyOpenAI.ok, onlyOpenAI.missingRequired.map(r => r.name))
check('OpenAI alone: Anthropic is not reported as missing-required',
  !onlyOpenAI.missingRequired.some(r => r.name === 'ANTHROPIC_API_KEY'))

const onlyAnthropic = withEnv({ ...SUPABASE, ANTHROPIC_API_KEY: 'sk-ant-test' })
check('Anthropic alone is a usable deployment', onlyAnthropic.ok, onlyAnthropic.missingRequired.map(r => r.name))
check('Anthropic alone: OpenAI is reported as degrading',
  onlyAnthropic.degraded.some(r => r.name === 'OPENAI_API_KEY'))

const neither = withEnv({ ...SUPABASE })
check('no AI provider at all is NOT ok', neither.ok === false)
check('no AI provider is signalled explicitly', neither.noAiProvider === true, neither.noAiProvider)

const bothPlusProvider = withEnv({ ...SUPABASE, OPENAI_API_KEY: 'sk', ANTHROPIC_API_KEY: 'sk-ant' })
check('both providers set is ok', bothPlusProvider.ok)
check('both providers set: noAiProvider is false', bothPlusProvider.noAiProvider === false)

// ── Supabase stays genuinely required ────────────────────────────────────────
const noSupabase = withEnv({ OPENAI_API_KEY: 'sk-test' })
check('missing Supabase is still not ok', noSupabase.ok === false)
check('missing Supabase is reported as missing-required',
  noSupabase.missingRequired.some(r => r.name === 'NEXT_PUBLIC_SUPABASE_URL'))

console.log(`\n${failures === 0 ? 'all passed' : `${failures} failed`}`)
if (failures > 0) process.exit(1)
