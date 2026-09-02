import { requirePermission } from '@/lib/auth/require-permission'
import { AdminNavLink } from '@/components/admin/admin-nav-link'

// Admin section sub-navigation items
const NAV_ITEMS = [
  { label: 'Users', href: '/admin/users' },
  { label: 'Audit Log', href: '/admin/audit' },
  // Keys — v2
  // Usage — v2
] as const

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Guard: only admins may access /admin/*
  // requirePermission redirects to /dashboard?error=forbidden for non-admins
  await requirePermission('admin.access')

  return (
    <div className="-mx-4 -my-6 lg:-mx-8 lg:-my-8">
      {/* Admin sub-navigation bar */}
      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-center gap-1 h-12">
            <span className="text-small font-medium text-text-muted mr-4 select-none">
              Admin
            </span>
            {NAV_ITEMS.map(({ label, href }) => (
              <AdminNavLink key={href} href={href} label={label} />
            ))}
          </div>
        </div>
      </div>

      {/* Page content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {children}
      </main>
    </div>
  )
}
