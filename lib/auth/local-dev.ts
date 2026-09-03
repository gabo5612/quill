/**
 * Local development sign-in bypass.
 *
 * The only auth method this app ships is Google OAuth against a single
 * Workspace domain, which is unavailable when running the whole stack on a
 * laptop. With LOCAL_DEV_USER set, /api/dev-login mints a real Supabase
 * session for that address so the app is usable locally — no login screen,
 * and, crucially, a genuine JWT, so every Row Level Security policy keeps
 * being exercised exactly as it is in production.
 *
 * The guard is deliberately not NODE_ENV: `next start` runs a production
 * build, which is what we run locally. It keys off the Supabase URL instead —
 * the bypass can only ever engage against a Supabase running on this machine.
 */

/** Password used for the local dev account. Local-only by construction. */
export const LOCAL_DEV_PASSWORD = 'local-dev-only-password'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

function supabaseIsLocal(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return false
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

/** The address to sign in as, or null when the bypass must not engage. */
export function localDevUserEmail(): string | null {
  const email = process.env.LOCAL_DEV_USER?.trim()
  if (!email) return null
  if (!supabaseIsLocal()) return null
  return email
}

/** True when the dev sign-in bypass is available for this process. */
export function isLocalDevAuthEnabled(): boolean {
  return localDevUserEmail() !== null
}
