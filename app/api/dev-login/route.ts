import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { isLocalDevAuthEnabled, localDevUserEmail, LOCAL_DEV_PASSWORD } from '@/lib/auth/local-dev'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dev-login — signs in as LOCAL_DEV_USER against a local Supabase.
 *
 * Exists because the only shipped auth method is Google OAuth, which cannot be
 * used against a stack running on a laptop. This mints a *real* session, so
 * RLS, the audit log and every permission check behave exactly as they do in
 * production — the login screen is skipped, the authorization model is not.
 *
 * Returns 404 when the bypass is not enabled, so a deployment that does not
 * opt in does not even admit the endpoint exists.
 */
export async function GET(request: Request) {
  const email = localDevUserEmail()
  if (!isLocalDevAuthEnabled() || !email) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Create the account on first run. The profile row and its role come from
  // the trigger on auth.users, so nothing else needs seeding.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password: LOCAL_DEV_PASSWORD,
    email_confirm: true,
    // The profile trigger reads full_name; without it the greeting renders blank.
    user_metadata: { full_name: 'Local Dev' },
  })
  // "already registered" is the normal path on every run after the first.
  if (createError && !/already/i.test(createError.message)) {
    return NextResponse.json(
      { error: `Could not create the local dev user: ${createError.message}` },
      { status: 500 },
    )
  }

  const supabase = await getSupabaseServerClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: LOCAL_DEV_PASSWORD,
  })
  if (signInError) {
    return NextResponse.json(
      { error: `Could not sign in as ${email}: ${signInError.message}` },
      { status: 500 },
    )
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
