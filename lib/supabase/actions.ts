'use server'

import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/supabase/types'
import type { User } from '@supabase/supabase-js'
import { getAppOrigin, safeRedirectPath } from '@/lib/url'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/auth/constants'

async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database, 'app'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'app' },
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch {
            // no-op in Server Components; the proxy refreshes cookies instead
          }
        },
      },
    }
  )
}

export async function signInWithGoogle(formData?: FormData): Promise<void> {
  const supabase = await createClient()

  // Origin is derived from the request, not from NEXT_PUBLIC_APP_URL — that env
  // var is easy to leave empty, which produced a relative redirectTo that
  // Supabase rejected and silently swallowed.
  const origin = await getAppOrigin()
  const redirectTo = safeRedirectPath(formData?.get('redirectTo')?.toString())

  const callback = new URL('/auth/callback', origin)
  if (redirectTo !== '/dashboard') callback.searchParams.set('redirectTo', redirectTo)

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callback.toString(),
      queryParams: {
        hd: ALLOWED_EMAIL_DOMAIN,
        prompt: 'select_account',
      },
    },
  })

  if (error) {
    redirect(`/login?error=auth_failed`)
  }

  if (data.url) {
    redirect(data.url)
  }

  redirect('/login?error=auth_failed')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

/** Current user, or null when signed out. Never throws. */
export async function getSession(): Promise<User | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Current user, redirecting to /login when signed out. */
export async function requireAuth(): Promise<User> {
  const user = await getSession()
  if (!user) redirect('/login')
  return user
}
