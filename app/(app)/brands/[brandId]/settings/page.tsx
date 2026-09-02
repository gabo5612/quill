import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { logAudit } from '@/lib/audit/log'
import { MemberRoleSelect } from '@/components/brand/member-role-select'
import { Users, Trash2, ArchiveRestore } from 'lucide-react'

export const metadata: Metadata = { title: 'Brand Settings' }

type BrandRole = 'owner' | 'editor' | 'viewer'

type MemberRow = {
  user_id: string
  brand_role: BrandRole
  name: string
  email: string
}

async function getBrandWithMembers(brandId: string) {
  const supabase = await getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const [{ data: brand }, { data: rawMembers }] = await Promise.all([
    sb
      .from('brands')
      .select('id, name, slug, status')
      .eq('id', brandId)
      .single() as Promise<{
      data: {
        id: string
        name: string
        slug: string
        status: 'active' | 'archived'
      } | null
    }>,
    sb
      .from('brand_members')
      .select('user_id, brand_role')
      .eq('brand_id', brandId) as Promise<{
      data: { user_id: string; brand_role: BrandRole }[] | null
    }>,
  ])

  if (!brand) return { brand: null, members: [] }

  const userIds = (rawMembers ?? []).map((m) => m.user_id)
  const { data: profiles } =
    userIds.length > 0
      ? await sb
          .from('profiles')
          .select('id, name, email')
          .in('id', userIds)
      : { data: [] }

  const profileMap: Record<string, { name: string; email: string }> = {}
  for (const p of profiles ?? []) {
    profileMap[p.id] = { name: p.name, email: p.email }
  }

  const members: MemberRow[] = (rawMembers ?? []).map((m) => ({
    user_id: m.user_id,
    brand_role: m.brand_role,
    name: profileMap[m.user_id]?.name ?? '—',
    email: profileMap[m.user_id]?.email ?? '—',
  }))

  return { brand, members }
}

async function updateMemberRole(
  brandId: string,
  formData: FormData,
) {
  'use server'

  const ctx = await requirePermission('brand.manage', brandId)

  const userId = formData.get('user_id') as string
  const role = formData.get('role') as BrandRole
  if (!userId || !['owner', 'editor', 'viewer'].includes(role)) return

  const supabase = await getSupabaseServerClient()
  await supabase
    .from('brand_members')
    .update({ brand_role: role })
    .eq('brand_id', brandId)
    .eq('user_id', userId)

  await logAudit({
    actorId: ctx.userId,
    action: 'brand.member.added',
    resourceType: 'brand_member',
    resourceId: userId,
    brandId,
    metadata: { new_role: role },
  })

  revalidatePath(`/brands/${brandId}/settings`)
}

async function removeMember(brandId: string, formData: FormData) {
  'use server'

  const ctx = await requirePermission('brand.manage', brandId)

  const userId = formData.get('user_id') as string
  if (!userId) return

  const supabase = await getSupabaseServerClient()
  await supabase
    .from('brand_members')
    .delete()
    .eq('brand_id', brandId)
    .eq('user_id', userId)

  await logAudit({
    actorId: ctx.userId,
    action: 'brand.member.removed',
    resourceType: 'brand_member',
    resourceId: userId,
    brandId,
  })

  revalidatePath(`/brands/${brandId}/settings`)
}

async function toggleArchive(brandId: string, formData: FormData) {
  'use server'

  const ctx = await requirePermission('brand.manage', brandId)

  const currentStatus = formData.get('current_status') as string
  const newStatus = currentStatus === 'active' ? 'archived' : 'active'

  const supabase = await getSupabaseServerClient()
  await supabase
    .from('brands')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', brandId)

  await logAudit({
    actorId: ctx.userId,
    action: 'brand.updated',
    resourceType: 'brand',
    resourceId: brandId,
    brandId,
    metadata: { status: newStatus },
  })

  revalidatePath(`/brands/${brandId}/settings`)
  revalidatePath('/brands')
}

type Props = { params: Promise<{ brandId: string }> }

export default async function BrandSettingsPage({ params }: Props) {
  const { brandId } = await params
  await requirePermission('brand.read', brandId)
  const { brand, members } = await getBrandWithMembers(brandId)

  if (!brand) notFound()

  const updateRoleAction = updateMemberRole.bind(null, brandId)
  const removeMemberAction = removeMember.bind(null, brandId)
  const toggleArchiveAction = toggleArchive.bind(null, brandId)

  return (
    <div className="-mx-4 -my-6 lg:-mx-8 lg:-my-8">
      {/* Studio header */}
      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 pt-6">
          <p className="text-caption text-text-muted">Brand Studio</p>
          <h1 className="mt-0.5 text-heading-l font-fragment text-text">
            {brand.name}
          </h1>

          {/* Tabs */}
          <div className="mt-4 flex gap-1">
            <TabLink href={`/brands/${brandId}/context`}>Context</TabLink>
            <TabLink href={`/brands/${brandId}/documents`}>Documents</TabLink>
            <TabLink href={`/brands/${brandId}/profile`}>Profile</TabLink>
            <TabLink href={`/brands/${brandId}/settings`} active>
              Settings
            </TabLink>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* Members */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Users size={16} className="text-text-muted" strokeWidth={1.75} />
            <h2 className="text-heading-s font-fragment text-text">Members</h2>
          </div>

          {members.length === 0 ? (
            <div className="rounded-xl border border-card-border bg-card-bg p-8 shadow-card text-center">
              <p className="text-small text-text-muted">
                No members yet. Add collaborators from the admin panel.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-card-border bg-card-bg shadow-card overflow-hidden">
              <table className="w-full text-small" aria-label="Brand members">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left font-normal">
                      <span className="text-caption font-medium uppercase tracking-wide text-text-muted">
                        Member
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left font-normal hidden sm:table-cell">
                      <span className="text-caption font-medium uppercase tracking-wide text-text-muted">
                        Email
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left font-normal">
                      <span className="text-caption font-medium uppercase tracking-wide text-text-muted">
                        Role
                      </span>
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr
                      key={member.user_id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-text">
                        {member.name}
                      </td>
                      <td className="px-4 py-3 text-text-muted hidden sm:table-cell">
                        {member.email}
                      </td>
                      <td className="px-4 py-3">
                        <MemberRoleSelect
                          userId={member.user_id}
                          memberName={member.name}
                          currentRole={member.brand_role}
                          action={updateRoleAction}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <form action={removeMemberAction}>
                          <input
                            type="hidden"
                            name="user_id"
                            value={member.user_id}
                          />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-caption font-medium text-text-muted hover:text-[var(--status-review-text)] hover:bg-[var(--status-review-bg)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Remove ${member.name}`}
                          >
                            <Trash2 size={13} strokeWidth={1.75} />
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Danger zone */}
        <section>
          <h2 className="mb-4 text-heading-s font-fragment text-[var(--status-review-text)]">
            Danger zone
          </h2>
          <div className="rounded-xl border border-[var(--status-review-text)]/20 bg-card-bg p-5 shadow-card">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-small font-medium text-text">
                  {brand.status === 'active'
                    ? 'Archive this brand'
                    : 'Reactivate this brand'}
                </p>
                <p className="mt-0.5 text-caption text-text-muted">
                  {brand.status === 'active'
                    ? 'Archived brands are hidden from the selector and cannot generate new articles.'
                    : 'Reactivating will make this brand available again for content generation.'}
                </p>
              </div>
              <form action={toggleArchiveAction} className="flex-shrink-0">
                <input
                  type="hidden"
                  name="current_status"
                  value={brand.status}
                />
                <button
                  type="submit"
                  className={[
                    'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-small font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    brand.status === 'active'
                      ? 'border-[var(--status-review-text)]/30 text-[var(--status-review-text)] hover:bg-[var(--status-review-bg)]'
                      : 'border-border text-text-muted hover:text-text hover:border-text-muted',
                  ].join(' ')}
                >
                  <ArchiveRestore size={15} strokeWidth={1.75} />
                  {brand.status === 'active' ? 'Archive brand' : 'Reactivate brand'}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={[
        'relative px-4 py-2 text-small font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-md',
        active
          ? 'text-text border-b-2 border-accent -mb-px bg-transparent'
          : 'text-text-muted hover:text-text',
      ].join(' ')}
    >
      {children}
    </Link>
  )
}
