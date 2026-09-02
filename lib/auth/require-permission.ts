import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { hasPermission } from './permissions'
import type { BrandRole, GlobalRole, Permission } from './permissions'

export interface PermissionContext {
  userId: string
  globalRole: GlobalRole
  brandRole?: BrandRole
}

/**
 * Server-side authorization guard. Redirects to /login when signed out and to
 * /dashboard?error=forbidden when the caller lacks `permission`.
 *
 * Pass `brandId` to additionally consider the caller's per-brand role.
 */
export async function requirePermission(
  permission: Permission,
  brandId?: string,
): Promise<PermissionContext> {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('global_role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const globalRole = (profile as { global_role: GlobalRole }).global_role

  let brandRole: BrandRole | undefined
  if (brandId) {
    const { data: member } = await supabase
      .from('brand_members')
      .select('brand_role')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .maybeSingle()

    brandRole = (member as { brand_role: BrandRole } | null)?.brand_role
  }

  if (!hasPermission(globalRole, permission, brandRole)) {
    redirect('/dashboard?error=forbidden')
  }

  return { userId: user.id, globalRole, brandRole }
}

/**
 * Non-redirecting variant for API route handlers, which must answer with a
 * status code rather than a redirect.
 */
export async function checkPermission(
  permission: Permission,
  brandId?: string,
): Promise<PermissionContext | null> {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('global_role')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  const globalRole = (profile as { global_role: GlobalRole }).global_role

  let brandRole: BrandRole | undefined
  if (brandId) {
    const { data: member } = await supabase
      .from('brand_members')
      .select('brand_role')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .maybeSingle()

    brandRole = (member as { brand_role: BrandRole } | null)?.brand_role
  }

  if (!hasPermission(globalRole, permission, brandRole)) return null

  return { userId: user.id, globalRole, brandRole }
}
