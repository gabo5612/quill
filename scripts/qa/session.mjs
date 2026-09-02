import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const DIR = HERE

// Mints a real browser session for the QA user without going through Google OAuth.
import { createRequire } from 'node:module'
const require_ = createRequire(path.join(ROOT, 'package.json'))
const { createClient } = require_('@supabase/supabase-js')
import fs from 'node:fs'



const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const REF = new global.URL(URL_).hostname.split('.')[0]
const EMAIL = 'qa-bot@example.com'
const PASSWORD = process.env.QA_USER_PASSWORD
if (!PASSWORD) {
  console.error('Set QA_USER_PASSWORD to a throwaway value before running this.')
  process.exit(1)
}

const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }, db: { schema: 'app' },
})

const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
let user = list.users.find(u => u.email === EMAIL)
if (!user) throw new Error('QA user not found')

await admin.auth.admin.updateUserById(user.id, { password: PASSWORD, email_confirm: true })

const anon = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data, error } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (error) throw error

// @supabase/ssr stores the session as base64-encoded JSON, chunked at 3180 chars.
const payload = 'base64-' + Buffer.from(JSON.stringify(data.session)).toString('base64url')
const name = `sb-${REF}-auth-token`
const CHUNK = 3180
const cookies = payload.length <= CHUNK
  ? [{ name, value: payload }]
  : Array.from({ length: Math.ceil(payload.length / CHUNK) }, (_, i) => ({
      name: `${name}.${i}`, value: payload.slice(i * CHUNK, (i + 1) * CHUNK),
    }))

fs.writeFileSync(process.argv[2] ?? path.join(DIR, 'session.json'), JSON.stringify({
  userId: user.id,
  cookies: cookies.map(c => ({ ...c, domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' })),
}, null, 2))
console.error(`session ready for ${EMAIL} (${user.id}), ${cookies.length} cookie(s)`)
