import { headers } from 'next/headers'

/**
 * Resolves the public origin of the current deployment.
 *
 * Order of preference:
 *   1. Forwarded headers (correct on Vercel, behind any proxy, and on localhost)
 *   2. NEXT_PUBLIC_APP_URL   (explicit override)
 *   3. VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL (build-time fallbacks)
 *   4. http://localhost:3000
 *
 * Header-first matters: NEXT_PUBLIC_APP_URL is frequently unset or stale, and
 * an empty value silently produced the relative `"/auth/callback"` redirect that
 * broke Google sign-in.
 */
export async function getAppOrigin(): Promise<string> {
  const h = await headers()

  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (host) {
    const proto =
      h.get('x-forwarded-proto') ??
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
    return `${proto}://${host}`
  }

  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`

  return 'http://localhost:3000'
}

/**
 * Guards against open redirects: only same-origin absolute paths are allowed.
 * Anything else (protocol-relative `//evil.com`, absolute URLs, empty) falls
 * back to the dashboard.
 */
export function safeRedirectPath(value: string | null | undefined): string {
  if (!value) return '/dashboard'
  if (!value.startsWith('/')) return '/dashboard'
  if (value.startsWith('//')) return '/dashboard'
  if (value.startsWith('/login')) return '/dashboard'
  return value
}
