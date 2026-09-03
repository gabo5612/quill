import { pickAvailableProvider } from '../lib/ai/providers'

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ok  ${label}`)
  else { failures++; console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
function withKeys(anthropic?: string, openai?: string) {
  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY
  if (anthropic) process.env.ANTHROPIC_API_KEY = anthropic
  if (openai) process.env.OPENAI_API_KEY = openai
}

withKeys('sk-ant', 'sk-oai')
check('prefers anthropic when both are set', pickAvailableProvider() === 'anthropic', pickAvailableProvider())

withKeys(undefined, 'sk-oai')
check('falls back to openai when anthropic is absent', pickAvailableProvider() === 'openai', pickAvailableProvider())

withKeys('sk-ant', undefined)
check('uses anthropic when openai is absent', pickAvailableProvider() === 'anthropic', pickAvailableProvider())

withKeys(undefined, undefined)
check('returns null when neither is configured', pickAvailableProvider() === null, pickAvailableProvider())

console.log(`\n${failures === 0 ? 'all passed' : `${failures} failed`}`)
if (failures > 0) process.exit(1)
