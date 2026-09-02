import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/require-permission'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { AuditAction } from '@/lib/audit/log'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50

// Human-readable labels for audit actions
const ACTION_LABELS: Record<AuditAction, string> = {
  'user.login':              'User login',
  'user.logout':             'User logout',
  'brand.created':           'Brand created',
  'brand.updated':           'Brand updated',
  'brand.deleted':           'Brand deleted',
  'brand.member.added':      'Member added to brand',
  'brand.member.removed':    'Member removed from brand',
  'document.uploaded':       'Document uploaded',
  'document.ingested':       'Document ingested',
  'document.deleted':        'Document deleted',
  'article.created':         'Article created',
  'article.updated':         'Article updated',
  'article.generated':       'Article generated',
  'article.exported':        'Article exported',
  'article.deleted':         'Article deleted',
  'article.status_changed':  'Article status changed',
  'schedule.created':        'Schedule entry created',
  'schedule.updated':        'Schedule entry updated',
  'schedule.deleted':        'Schedule entry deleted',
  'admin.role_changed':      'User role changed',
  'admin.key_updated':       'API key updated',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const metadata = {
  title: 'Audit Log — Admin',
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    action?: string
    actor?: string
    from?: string
    to?: string
  }>
}) {
  await requirePermission('admin.access')

  const params = await searchParams

  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const actionFilter = params.action?.trim() ?? ''
  const actorFilter = params.actor?.trim() ?? ''
  const fromDate = params.from?.trim() ?? ''
  const toDate = params.to?.trim() ?? ''

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-heading-l text-text font-fragment">Audit Log</h1>
          <p className="mt-1 text-small text-text-muted">
            Read-only record of all actions in the system.
          </p>
        </div>
        {/* Export CSV — v2 placeholder */}
        <button
          type="button"
          disabled
          title="CSV export coming in v2"
          className="px-4 py-2 text-small font-medium rounded-md border border-btn-secondary-border bg-btn-secondary-bg text-btn-secondary-text opacity-40 cursor-not-allowed"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <form method="GET" className="mb-6 flex flex-wrap gap-3 items-end">
        {/* Action type filter */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="audit-action"
            className="text-caption font-medium text-text-muted uppercase tracking-wide"
          >
            Action
          </label>
          <select
            id="audit-action"
            name="action"
            defaultValue={actionFilter}
            className={[
              'rounded-md border border-input-border bg-input-bg px-3 py-2',
              'text-small text-input-text',
              'focus:outline-none focus:border-input-border-focus focus:ring-1 focus:ring-ring',
              'transition-colors',
            ].join(' ')}
          >
            <option value="">All actions</option>
            {(Object.keys(ACTION_LABELS) as AuditAction[]).map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </div>

        {/* Actor filter */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="audit-actor"
            className="text-caption font-medium text-text-muted uppercase tracking-wide"
          >
            Actor
          </label>
          <input
            id="audit-actor"
            name="actor"
            type="text"
            defaultValue={actorFilter}
            placeholder="Filter by name or email…"
            className={[
              'rounded-md border border-input-border bg-input-bg px-3 py-2',
              'text-small text-input-text placeholder:text-input-placeholder',
              'focus:outline-none focus:border-input-border-focus focus:ring-1 focus:ring-ring',
              'transition-colors',
            ].join(' ')}
          />
        </div>

        {/* Date range: from */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="audit-from"
            className="text-caption font-medium text-text-muted uppercase tracking-wide"
          >
            From
          </label>
          <input
            id="audit-from"
            name="from"
            type="date"
            defaultValue={fromDate}
            className={[
              'rounded-md border border-input-border bg-input-bg px-3 py-2',
              'text-small text-input-text',
              'focus:outline-none focus:border-input-border-focus focus:ring-1 focus:ring-ring',
              'transition-colors',
            ].join(' ')}
          />
        </div>

        {/* Date range: to */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="audit-to"
            className="text-caption font-medium text-text-muted uppercase tracking-wide"
          >
            To
          </label>
          <input
            id="audit-to"
            name="to"
            type="date"
            defaultValue={toDate}
            className={[
              'rounded-md border border-input-border bg-input-bg px-3 py-2',
              'text-small text-input-text',
              'focus:outline-none focus:border-input-border-focus focus:ring-1 focus:ring-ring',
              'transition-colors',
            ].join(' ')}
          />
        </div>

        <button
          type="submit"
          className="px-4 py-2 text-small font-medium rounded-md bg-btn-primary-bg text-btn-primary-text hover:bg-btn-primary-hover-bg transition-colors self-end"
        >
          Apply
        </button>

        {(actionFilter || actorFilter || fromDate || toDate) && (
          <a
            href="/admin/audit"
            className="px-4 py-2 text-small font-medium rounded-md border border-btn-secondary-border text-btn-secondary-text hover:bg-btn-ghost-hover-bg transition-colors self-end"
          >
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      <Suspense fallback={<AuditTableSkeleton />}>
        <AuditTableLoader
          page={page}
          actionFilter={actionFilter as AuditAction | ''}
          actorFilter={actorFilter}
          fromDate={fromDate}
          toDate={toDate}
        />
      </Suspense>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data loader
// ---------------------------------------------------------------------------

// Local row shapes matching audit_log and profiles queries
type AuditLogRow = {
  id: string
  action: string
  resource_type: string
  resource_id: string | null
  brand_id: string | null
  actor_id: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}
type ActorProfileRow = { id: string; name: string; email: string }

async function AuditTableLoader({
  page,
  actionFilter,
  actorFilter,
  fromDate,
  toDate,
}: {
  page: number
  actionFilter: AuditAction | ''
  actorFilter: string
  fromDate: string
  toDate: string
}) {
  const supabase = await getSupabaseServerClient()

  const offset = (page - 1) * PAGE_SIZE

  // The actor filter has to be resolved to IDs *before* the query runs.
  // Filtering the fetched page client-side (the previous behaviour) silently
  // dropped matches that lived on other pages and made the count wrong.
  let actorIdFilter: string[] | null = null
  if (actorFilter) {
    const { data: matchingActors } = await supabase
      .from('profiles')
      .select('id')
      .or(`email.ilike.%${actorFilter}%,name.ilike.%${actorFilter}%`)

    actorIdFilter = (matchingActors ?? []).map((a) => (a as { id: string }).id)
    // No matching actor → no events, rather than "filter ignored".
    if (actorIdFilter.length === 0) actorIdFilter = ['00000000-0000-0000-0000-000000000000']
  }

  let q = supabase
    .from('audit_log')
    .select('id, action, resource_type, resource_id, brand_id, actor_id, created_at, metadata', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (actionFilter) {
    q = q.eq('action', actionFilter)
  }
  if (actorIdFilter) {
    q = q.in('actor_id', actorIdFilter)
  }
  if (fromDate) {
    q = q.gte('created_at', `${fromDate}T00:00:00Z`)
  }
  if (toDate) {
    q = q.lte('created_at', `${toDate}T23:59:59Z`)
  }

  const { data: rawLogs, count, error } = await q
  const logs = (rawLogs ?? []) as unknown as AuditLogRow[]

  if (error) {
    return (
      <p role="alert" className="text-small text-[var(--status-review-text)]">
        Failed to load audit log: {error.message}
      </p>
    )
  }

  // Collect unique actor IDs
  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[]

  // Load actor profiles
  const { data: rawActorProfiles } = actorIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', actorIds)
    : { data: [] }
  const actorProfiles = (rawActorProfiles ?? []) as unknown as ActorProfileRow[]

  const actorMap: Record<string, { name: string; email: string }> = {}
  for (const p of actorProfiles) {
    actorMap[p.id] = { name: p.name, email: p.email }
  }

  const filtered = logs

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  return (
    <div>
      {/* Count badge */}
      <p className="mb-3 text-caption text-text-muted">
        {count ?? 0} event{count !== 1 ? 's' : ''}
        {totalPages > 1
          ? ` — page ${page} of ${totalPages}`
          : ''}
      </p>

      <div className="w-full overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-card">
        <table className="w-full text-small" aria-label="Audit log">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left">
                <span className="text-caption font-medium uppercase tracking-wide text-text-muted">
                  Timestamp
                </span>
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-caption font-medium uppercase tracking-wide text-text-muted">
                  Actor
                </span>
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-caption font-medium uppercase tracking-wide text-text-muted">
                  Action
                </span>
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-caption font-medium uppercase tracking-wide text-text-muted">
                  Resource
                </span>
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-caption font-medium uppercase tracking-wide text-text-muted">
                  Brand
                </span>
              </th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-text-muted"
                >
                  No events found.
                </td>
              </tr>
            )}
            {filtered.map((log) => {
              const actor = log.actor_id ? actorMap[log.actor_id] : null
              const label =
                ACTION_LABELS[log.action as AuditAction] ?? log.action

              return (
                <tr
                  key={log.id}
                  className="border-b border-border last:border-0 hover:bg-surface-raised transition-colors"
                >
                  {/* Timestamp */}
                  <td className="px-4 py-3 text-text-muted whitespace-nowrap tabular-nums">
                    {new Date(log.created_at).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>

                  {/* Actor */}
                  <td className="px-4 py-3">
                    {actor ? (
                      <div>
                        <p className="font-medium text-text leading-tight">
                          {actor.name}
                        </p>
                        <p className="text-caption text-text-muted leading-tight">
                          {actor.email}
                        </p>
                      </div>
                    ) : (
                      <span className="text-text-muted">System</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium bg-surface-raised text-text border border-border">
                      {label}
                    </span>
                  </td>

                  {/* Resource */}
                  <td className="px-4 py-3 text-text-muted font-mono text-caption">
                    <span className="text-text">{log.resource_type}</span>
                    {log.resource_id && (
                      <span className="ml-1 text-text-muted">
                        #{log.resource_id.slice(0, 8)}
                      </span>
                    )}
                  </td>

                  {/* Brand */}
                  <td className="px-4 py-3 text-text-muted font-mono text-caption">
                    {log.brand_id ? log.brand_id.slice(0, 8) : (
                      <span className="text-text-muted/50">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-caption text-text-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <PaginationLink
                page={page - 1}
                label="Previous"
                actionFilter={actionFilter}
                actorFilter={actorFilter}
                fromDate={fromDate}
                toDate={toDate}
              />
            )}
            {page < totalPages && (
              <PaginationLink
                page={page + 1}
                label="Next"
                actionFilter={actionFilter}
                actorFilter={actorFilter}
                fromDate={fromDate}
                toDate={toDate}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pagination link helper
// ---------------------------------------------------------------------------

function PaginationLink({
  page,
  label,
  actionFilter,
  actorFilter,
  fromDate,
  toDate,
}: {
  page: number
  label: string
  actionFilter: string
  actorFilter: string
  fromDate: string
  toDate: string
}) {
  const params = new URLSearchParams()
  if (page > 1) params.set('page', String(page))
  if (actionFilter) params.set('action', actionFilter)
  if (actorFilter) params.set('actor', actorFilter)
  if (fromDate) params.set('from', fromDate)
  if (toDate) params.set('to', toDate)

  const href = `/admin/audit${params.size > 0 ? `?${params}` : ''}`

  return (
    <a
      href={href}
      className="px-4 py-2 text-small font-medium rounded-md border border-btn-secondary-border bg-btn-secondary-bg text-btn-secondary-text hover:bg-btn-ghost-hover-bg transition-colors"
    >
      {label}
    </a>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function AuditTableSkeleton() {
  return (
    <div className="w-full rounded-xl border border-card-border bg-card-bg shadow-card overflow-hidden animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0"
        >
          <div className="h-3 w-32 rounded bg-surface-raised" />
          <div className="h-3 w-28 rounded bg-surface-raised" />
          <div className="h-3 w-36 rounded bg-surface-raised" />
          <div className="h-3 w-24 rounded bg-surface-raised" />
          <div className="ml-auto h-3 w-16 rounded bg-surface-raised" />
        </div>
      ))}
    </div>
  )
}
