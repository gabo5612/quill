'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Building2,
  FileText,
  Calendar,
  Shield,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { signOut } from '@/lib/supabase/actions'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Profile = {
  id: string
  name: string
  email: string
  global_role: 'admin' | 'editor' | 'viewer'
} | null

type BrandEntry = {
  brand_id: string
  brand_role: 'owner' | 'editor' | 'viewer'
  brands: {
    id: string
    name: string
    slug: string
    logo_url: string | null
    status: 'active' | 'archived'
  } | null
}

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard',  Icon: LayoutDashboard },
  { href: '/brands',    label: 'Brands',    Icon: Building2 },
  { href: '/articles',  label: 'Articles',  Icon: FileText },
  { href: '/calendar',  label: 'Calendar',  Icon: Calendar,  v1: true },
] as const

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({
  profile,
  open,
  onClose,
}: {
  profile: Profile
  open: boolean
  onClose: () => void
}) {
  const pathname = usePathname()
  const isAdmin = profile?.global_role === 'admin'

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-40 flex h-full w-sidebar flex-col',
          'bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)]',
          'transition-transform duration-250 ease-[cubic-bezier(0.4,0,0.2,1)]',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo / Brand mark */}
        <div className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-[var(--sidebar-border)]">
          <Link
            href="/dashboard"
            className="font-fragment text-heading-s text-[var(--text)] tracking-tight"
            onClick={onClose}
          >
            Quill
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden flex h-7 w-7 items-center justify-center rounded-md text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-active)] transition-colors"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  'group flex items-center gap-3 rounded-md px-3 py-2 text-small transition-colors',
                  active
                    ? 'bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)] font-medium'
                    : 'text-[var(--sidebar-text)] hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-active-text)]'
                )}
              >
                <Icon
                  size={16}
                  className={cn(
                    'shrink-0 transition-colors',
                    active
                      ? 'text-[var(--accent)]'
                      : 'text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-text)]'
                  )}
                />
                {label}
              </Link>
            )
          })}

          {isAdmin && (
            <Link
              href="/admin"
              onClick={onClose}
              className={cn(
                'group flex items-center gap-3 rounded-md px-3 py-2 text-small transition-colors',
                pathname.startsWith('/admin')
                  ? 'bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)] font-medium'
                  : 'text-[var(--sidebar-text)] hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-active-text)]'
              )}
            >
              <Shield
                size={16}
                className={cn(
                  'shrink-0 transition-colors',
                  pathname.startsWith('/admin')
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-text)]'
                )}
              />
              Admin
            </Link>
          )}
        </nav>

        {/* Profile section */}
        <div className="shrink-0 border-t border-[var(--sidebar-border)] p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            {/* Avatar */}
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] text-caption font-medium select-none">
              {profile?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-small font-medium text-[var(--text)] truncate leading-tight">
                {profile?.name ?? 'User'}
              </p>
              <p className="text-caption text-[var(--text-muted)] truncate leading-tight">
                {profile?.email ?? ''}
              </p>
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="mt-1 w-full rounded-md px-3 py-1.5 text-small text-left text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-text)] transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}

// ---------------------------------------------------------------------------
// Brand switcher
// ---------------------------------------------------------------------------

/**
 * Jumps to a brand's studio. The active brand is derived from the URL rather
 * than held in local state — the previous version stored a selection that
 * nothing read, so choosing a brand did nothing at all.
 */
function BrandSwitcher({ brands }: { brands: BrandEntry[] }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  const activeBrandId = pathname.match(/^\/brands\/([0-9a-fA-F-]{36})/)?.[1] ?? null
  const activeBrand = brands.find(b => b.brands?.id === activeBrandId)?.brands
  const activeItems = brands.filter(b => b.brands?.status === 'active')

  if (!activeItems.length) return null

  function selectBrand(id: string) {
    setOpen(false)
    router.push(`/brands/${id}/context`)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-small text-[var(--text)] hover:bg-[var(--surface)] border border-[var(--border)] transition-colors max-w-[200px]"
      >
        <span className="truncate font-medium">
          {activeBrand?.name ?? 'Go to brand'}
        </span>
        <ChevronDown
          size={14}
          className={cn('shrink-0 text-[var(--text-muted)] transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <ul
            role="listbox"
            className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-raised py-1 overflow-hidden"
          >
            {activeItems.map(entry => {
              const brand = entry.brands!
              const isActive = brand.id === activeBrandId
              return (
                <li key={brand.id}>
                  <button
                    role="option"
                    aria-selected={isActive}
                    onClick={() => selectBrand(brand.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-small transition-colors',
                      isActive
                        ? 'bg-[var(--surface-raised)] text-[var(--text)] font-medium'
                        : 'text-[var(--text)] hover:bg-[var(--surface-raised)]'
                    )}
                  >
                    {brand.name}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function TopBar({
  profile,
  brands,
  onMenuOpen,
}: {
  profile: Profile
  brands: BrandEntry[]
  onMenuOpen: () => void
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 border-b border-[var(--border)] bg-[var(--bg)] px-4 lg:px-6">
      {/* Mobile menu button */}
      <button
        onClick={onMenuOpen}
        className="lg:hidden flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface)] transition-colors"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      {/* Brand switcher */}
      <BrandSwitcher brands={brands} />

      <div className="flex-1" />

      {/* Right side: theme toggle + avatar */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] text-caption font-medium select-none"
          title={profile?.name ?? ''}
          aria-label={`Signed in as ${profile?.name ?? ''}`}
        >
          {profile?.name?.[0]?.toUpperCase() ?? '?'}
        </div>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// App Shell
// ---------------------------------------------------------------------------

export function AppShell({
  profile,
  brands,
  children,
}: {
  profile: Profile
  brands: BrandEntry[]
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-full min-h-screen bg-[var(--bg)]">
      <Sidebar
        profile={profile}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main area: offset by the fixed sidebar on large screens */}
      <div className="flex flex-1 flex-col lg:pl-sidebar min-w-0">
        <TopBar
          profile={profile}
          brands={brands}
          onMenuOpen={() => setSidebarOpen(true)}
        />

        {/* Pages with a full-bleed sub-header cancel this padding with
            `-mx-4 -my-6 lg:-mx-8 lg:-my-8`. */}
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
