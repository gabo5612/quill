'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * Admin sub-navigation link with an active state. Needs to be a Client
 * Component because the active route is only known from usePathname().
 */
export function AdminNavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'px-3 py-2 text-small font-medium rounded-md transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-btn-ghost-hover-bg text-text'
          : 'text-text-muted hover:text-text hover:bg-btn-ghost-hover-bg',
      )}
    >
      {label}
    </Link>
  )
}
