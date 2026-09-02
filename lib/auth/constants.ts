/**
 * Only Google Workspace accounts on this domain may sign in. Enforced in three
 * places: the OAuth `hd` parameter, the /auth/callback handler, and the
 * app.check_email_domain trigger on app.profiles.
 *
 * Kept out of lib/supabase/actions.ts because a 'use server' module may only
 * export async functions.
 */
export const ALLOWED_EMAIL_DOMAIN = 'example.com'
