import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAppOrigin, safeRedirectPath } from '@/lib/url'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/auth/constants'
import { logAudit } from '@/lib/audit/log'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  // Behind Vercel's proxy `request.url` can carry an internal host, so build
  // redirects from the forwarded headers instead.
  const origin = await getAppOrigin()
  const redirectTo = safeRedirectPath(searchParams.get('redirectTo'))

  // Google/Supabase can bounce back with an error instead of a code.
  const oauthError = searchParams.get('error') ?? searchParams.get('error_code')
  if (oauthError) {
    return NextResponse.redirect(new URL('/login?error=auth_failed', origin))
  }

  const code = searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(new URL('/login?error=auth_failed', origin))
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(new URL('/login?error=auth_failed', origin))
  }

  // Domain check #3 — OAuth `hd` and the app.profiles trigger are the other two.
  if (!data.user.email?.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=unauthorized_domain', origin))
  }

  await logAudit({
    actorId: data.user.id,
    action: 'user.login',
    resourceType: 'profile',
    resourceId: data.user.id,
  })

  return NextResponse.redirect(new URL(redirectTo, origin))
}
