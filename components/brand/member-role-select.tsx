'use client'

import { useRef } from 'react'

export type BrandRole = 'owner' | 'editor' | 'viewer'

const ROLE_LABELS: Record<BrandRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
}

/**
 * Auto-submitting role picker. This has to be a Client Component: `onChange`
 * cannot be passed to a DOM element from a Server Component.
 */
export function MemberRoleSelect({
  userId,
  memberName,
  currentRole,
  action,
}: {
  userId: string
  memberName: string
  currentRole: BrandRole
  action: (formData: FormData) => Promise<void>
}) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form action={action} ref={formRef}>
      <input type="hidden" name="user_id" value={userId} />
      <label className="sr-only" htmlFor={`role-${userId}`}>
        Role for {memberName}
      </label>
      <select
        id={`role-${userId}`}
        name="role"
        defaultValue={currentRole}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-md border border-input-border bg-input-bg px-2 py-1 text-small text-input-text transition-colors focus:outline-none focus:border-input-border-focus focus-visible:ring-2 focus-visible:ring-ring"
      >
        {(Object.keys(ROLE_LABELS) as BrandRole[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="ml-2 text-caption underline">
          Save
        </button>
      </noscript>
    </form>
  )
}
