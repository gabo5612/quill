import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/require-permission'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { UsersTable, type UserRow } from '@/components/admin/users-table'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const metadata = {
  title: 'Users — Admin',
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  // Guard — non-admins are redirected inside requirePermission
  await requirePermission('admin.access')

  const { q } = await searchParams
  const query = q?.trim() ?? ''

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-heading-l text-text font-fragment">Users</h1>
          <p className="mt-1 text-small text-text-muted">
            Manage user access and global roles.
          </p>
        </div>
      </div>

      {/* Search */}
      <form method="GET" className="mb-6 max-w-sm">
        <label htmlFor="user-search" className="sr-only">
          Search users
        </label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-muted"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <circle cx="6.5" cy="6.5" r="4.5" />
              <path d="M11 11 L14.5 14.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            id="user-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search by name or email…"
            className={[
              'w-full rounded-md border border-input-border bg-input-bg pl-9 pr-4 py-2',
              'text-small text-input-text placeholder:text-input-placeholder',
              'focus:outline-none focus:border-input-border-focus focus:ring-1 focus:ring-ring',
              'transition-colors',
            ].join(' ')}
          />
        </div>
      </form>

      {/* Table */}
      <Suspense fallback={<UsersTableSkeleton />}>
        <UsersTableLoader query={query} />
      </Suspense>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data loader (async Server Component)
// ---------------------------------------------------------------------------

// Local row shapes for the Supabase query results
type ProfileQueryRow = {
  id: string
  name: string
  email: string
  global_role: 'admin' | 'editor' | 'viewer'
  created_at: string
}
type MembershipQueryRow = { user_id: string }

async function UsersTableLoader({ query }: { query: string }) {
  const supabase = await getSupabaseServerClient()

  // Load all profiles with brand membership count
  let profilesQuery = supabase
    .from('profiles')
    .select('id, name, email, global_role, created_at')
    .order('created_at', { ascending: false })

  if (query) {
    profilesQuery = profilesQuery.or(
      `name.ilike.%${query}%,email.ilike.%${query}%`
    )
  }

  const { data: rawProfiles, error } = await profilesQuery
  const profiles = (rawProfiles ?? []) as unknown as ProfileQueryRow[]

  if (error) {
    return (
      <p role="alert" className="text-small text-[var(--status-review-text)]">
        Failed to load users: {error.message}
      </p>
    )
  }

  // Load brand membership counts for each user
  const userIds = profiles.map((p) => p.id)
  const { data: rawMemberships } = await supabase
    .from('brand_members')
    .select('user_id')
    .in('user_id', userIds.length > 0 ? userIds : ['_none'])

  const memberships = (rawMemberships ?? []) as unknown as MembershipQueryRow[]

  const brandCounts: Record<string, number> = {}
  for (const m of memberships) {
    brandCounts[m.user_id] = (brandCounts[m.user_id] ?? 0) + 1
  }

  const rows: UserRow[] = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    global_role: p.global_role,
    avatar_url: null, // profiles table has no avatar_url; extend when added
    brand_count: brandCounts[p.id] ?? 0,
    joined: p.created_at,
  }))

  return <UsersTable users={rows} />
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function UsersTableSkeleton() {
  return (
    <div className="w-full rounded-xl border border-card-border bg-card-bg shadow-card overflow-hidden animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0"
        >
          <div className="h-8 w-8 rounded-full bg-surface-raised flex-shrink-0" />
          <div className="h-3 w-32 rounded bg-surface-raised" />
          <div className="h-3 w-40 rounded bg-surface-raised" />
          <div className="h-3 w-16 rounded bg-surface-raised" />
          <div className="ml-auto h-3 w-10 rounded bg-surface-raised" />
        </div>
      ))}
    </div>
  )
}
