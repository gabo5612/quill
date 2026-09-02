'use client'

import { useState, useTransition, useOptimistic } from 'react'
import { updateUserRole } from '@/app/(app)/admin/users/actions'
import type { GlobalRole } from '@/lib/auth/permissions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string
  name: string
  email: string
  global_role: GlobalRole
  avatar_url: string | null
  brand_count: number
  joined: string // ISO date string
}

type SortKey = 'name' | 'email' | 'global_role' | 'brand_count' | 'joined'
type SortDir = 'asc' | 'desc'

const ROLE_OPTIONS: GlobalRole[] = ['admin', 'editor', 'viewer']

const ROLE_LABELS: Record<GlobalRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

function ConfirmDialog({
  open,
  userName,
  newRole,
  onConfirm,
  onCancel,
}: {
  open: boolean
  userName: string
  newRole: GlobalRole
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-neutrals-900/40"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-surface border border-border shadow-modal p-6">
        <h2
          id="confirm-dialog-title"
          className="text-heading-s font-fragment text-text mb-2"
        >
          Change role
        </h2>
        <p className="text-small text-text-muted mb-6">
          Set{' '}
          <span className="font-medium text-text">{userName}</span> to{' '}
          <span className="font-medium text-text">{ROLE_LABELS[newRole]}</span>?
          This change takes effect immediately.
        </p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-small font-medium rounded-md border border-btn-secondary-border bg-btn-secondary-bg text-btn-secondary-text hover:bg-btn-ghost-hover-bg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-small font-medium rounded-md bg-btn-primary-bg text-btn-primary-text hover:bg-btn-primary-hover-bg transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Role dropdown
// ---------------------------------------------------------------------------

function RoleDropdown({
  userId,
  currentRole,
  userName,
  onRoleChange,
  disabled,
}: {
  userId: string
  currentRole: GlobalRole
  userName: string
  onRoleChange: (userId: string, newRole: GlobalRole, userName: string) => void
  disabled?: boolean
}) {
  return (
    <select
      value={currentRole}
      disabled={disabled}
      onChange={(e) =>
        onRoleChange(userId, e.target.value as GlobalRole, userName)
      }
      className={[
        'text-small font-medium rounded-md px-2 py-1',
        'bg-input-bg border border-input-border text-input-text',
        'focus:outline-none focus:border-input-border-focus focus:ring-1 focus:ring-ring',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'transition-colors cursor-pointer',
      ].join(' ')}
      aria-label={`Role for ${userName}`}
    >
      {ROLE_OPTIONS.map((role) => (
        <option key={role} value={role}>
          {ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  )
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function Avatar({
  name,
  avatarUrl,
}: {
  name: string
  avatarUrl: string | null
}) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('')

  if (avatarUrl) {
    // Avatars come from arbitrary Google CDN hosts; next/image would require
    // allowlisting each one in next.config.ts.
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={avatarUrl}
        alt={name}
        width={32}
        height={32}
        className="h-8 w-8 rounded-full object-cover flex-shrink-0"
      />
    )
  }

  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised border border-border text-caption font-medium text-text-muted flex-shrink-0">
      {initials}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

function sortUsers(
  users: UserRow[],
  key: SortKey,
  dir: SortDir
): UserRow[] {
  return [...users].sort((a, b) => {
    let cmp = 0
    if (key === 'brand_count') {
      cmp = a.brand_count - b.brand_count
    } else if (key === 'joined') {
      cmp = a.joined.localeCompare(b.joined)
    } else {
      cmp = a[key].localeCompare(b[key])
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

// ---------------------------------------------------------------------------
// Column header with sort button
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onSort: (key: SortKey) => void
}) {
  const isActive = sortKey === currentKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={[
        'flex items-center gap-1 text-caption font-medium uppercase tracking-wide',
        'hover:text-text transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded',
        isActive ? 'text-text' : 'text-text-muted',
      ].join(' ')}
      aria-label={`Sort by ${label}${
        isActive ? (currentDir === 'asc' ? ', currently ascending' : ', currently descending') : ''
      }`}
    >
      {label}
      <span aria-hidden="true" className="text-text-muted">
        {isActive ? (currentDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UsersTable({ users: initialUsers }: { users: UserRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('joined')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Pending confirmation state
  const [pending, setPending] = useState<{
    userId: string
    userName: string
    newRole: GlobalRole
  } | null>(null)

  const [isPending, startTransition] = useTransition()

  // Optimistic role updates
  const [optimisticUsers, setOptimisticUsers] = useOptimistic(
    initialUsers,
    (users: UserRow[], update: { userId: string; newRole: GlobalRole }) =>
      users.map((u) =>
        u.id === update.userId ? { ...u, global_role: update.newRole } : u
      )
  )

  // ---- Sort trigger ---
  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // ---- Role dropdown selects a new role — open confirm dialog ---
  function handleRoleChange(
    userId: string,
    newRole: GlobalRole,
    userName: string
  ) {
    const user = optimisticUsers.find((u) => u.id === userId)
    if (!user || user.global_role === newRole) return
    setPending({ userId, userName, newRole })
  }

  // ---- User confirms role change ---
  function handleConfirm() {
    if (!pending) return
    const { userId, newRole } = pending
    setPending(null)

    startTransition(async () => {
      setOptimisticUsers({ userId, newRole })
      await updateUserRole({ userId, newRole })
    })
  }

  // ---- User cancels ---
  function handleCancel() {
    setPending(null)
  }

  const sorted = sortUsers(optimisticUsers, sortKey, sortDir)

  return (
    <>
      <ConfirmDialog
        open={!!pending}
        userName={pending?.userName ?? ''}
        newRole={pending?.newRole ?? 'viewer'}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      <div className="w-full overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-card">
        <table className="w-full text-small" aria-label="Users">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left w-8" aria-label="Avatar" />
              <th className="px-4 py-3 text-left">
                <SortableHeader
                  label="Name"
                  sortKey="name"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortableHeader
                  label="Email"
                  sortKey="email"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortableHeader
                  label="Role"
                  sortKey="global_role"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortableHeader
                  label="Brands"
                  sortKey="brand_count"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortableHeader
                  label="Joined"
                  sortKey="joined"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
            </tr>
          </thead>

          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-text-muted"
                >
                  No users found.
                </td>
              </tr>
            )}
            {sorted.map((user) => (
              <tr
                key={user.id}
                className="border-b border-border last:border-0 hover:bg-surface-raised transition-colors"
              >
                {/* Avatar */}
                <td className="px-4 py-3">
                  <Avatar name={user.name} avatarUrl={user.avatar_url} />
                </td>

                {/* Name */}
                <td className="px-4 py-3 font-medium text-text whitespace-nowrap">
                  {user.name}
                </td>

                {/* Email */}
                <td className="px-4 py-3 text-text-muted">
                  {user.email}
                </td>

                {/* Role dropdown */}
                <td className="px-4 py-3">
                  <RoleDropdown
                    userId={user.id}
                    currentRole={user.global_role}
                    userName={user.name}
                    onRoleChange={handleRoleChange}
                    disabled={isPending}
                  />
                </td>

                {/* Brand count */}
                <td className="px-4 py-3 text-text-muted tabular-nums">
                  {user.brand_count}
                </td>

                {/* Joined date */}
                <td className="px-4 py-3 text-text-muted whitespace-nowrap">
                  {new Date(user.joined).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
