'use server'

import { revalidatePath } from 'next/cache'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit/log'
import { requirePermission } from '@/lib/auth/require-permission'
import type { GlobalRole } from '@/lib/auth/permissions'

const VALID_ROLES: GlobalRole[] = ['admin', 'editor', 'viewer']

export async function updateUserRole({
  userId,
  newRole,
}: {
  userId: string
  newRole: GlobalRole
}): Promise<void> {
  const { userId: actorId } = await requirePermission('admin.access')

  if (!VALID_ROLES.includes(newRole)) {
    throw new Error(`Invalid role: ${newRole}`)
  }

  // An admin demoting themselves would lock the workspace out of /admin.
  if (userId === actorId && newRole !== 'admin') {
    throw new Error('You cannot change your own admin role.')
  }

  const supabase = await getSupabaseServerClient()

  const { data: rawExisting } = await supabase
    .from('profiles')
    .select('global_role')
    .eq('id', userId)
    .maybeSingle()

  const existing = rawExisting as { global_role: GlobalRole } | null

  // Service-role client — bypasses RLS and, crucially, targets the `app`
  // schema. A bare createClient() would hit public.profiles, which does not
  // exist, and every role change would fail.
  const admin = getSupabaseAdminClient()

  const { error } = await admin
    .from('profiles')
    .update({ global_role: newRole })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to update role: ${error.message}`)
  }

  await logAudit({
    actorId,
    action: 'admin.role_changed',
    resourceType: 'profile',
    resourceId: userId,
    metadata: {
      previous_role: existing?.global_role ?? null,
      new_role: newRole,
    },
  })

  revalidatePath('/admin/users')
}
