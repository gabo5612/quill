import Link from 'next/link'
import type { Tables } from '@/lib/supabase/types'
import { requireAuth } from '@/lib/supabase/actions'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/auth/permissions'
import type { GlobalRole } from '@/lib/auth/permissions'
import { Building2, Plus, ArrowRight } from 'lucide-react'

async function getBrands(userId: string) {
  const supabase = await getSupabaseServerClient()

  const { data: rawProfile } = await supabase
    .from('profiles')
    .select('global_role')
    .eq('id', userId)
    .maybeSingle()

  const canCreate = hasPermission(
    (rawProfile as { global_role: GlobalRole } | null)?.global_role ?? 'viewer',
    'brand.manage',
  )

  const { data: brands, error } = await supabase
    .from('brands')
    .select('id, name, slug, logo_url, status, created_at')
    .order('created_at', { ascending: false })

  if (error) return { brands: [], canCreate }

  // Get article counts per brand
  const { data: counts } = await supabase
    .from('articles')
    .select('brand_id') as { data: Pick<Tables<'articles'>, 'brand_id'>[] | null; error: unknown }

  const countMap: Record<string, number> = {}
  if (counts) {
    for (const row of counts) {
      countMap[row.brand_id] = (countMap[row.brand_id] ?? 0) + 1
    }
  }

  const brandsTyped = (brands ?? []) as Tables<'brands'>[]
  return {
    brands: brandsTyped.map((b) => ({ ...b, articleCount: countMap[b.id] ?? 0 })),
    canCreate,
  }
}

export default async function BrandsPage() {
  const user = await requireAuth()
  const { brands, canCreate } = await getBrands(user.id)

  return (
    <div className="-mx-4 -my-6 lg:-mx-8 lg:-my-8">
      {/* Page header */}
      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-heading-l font-fragment text-text">Brands</h1>
            <p className="text-small text-text-muted mt-0.5">
              {brands.length === 0
                ? 'Create your first brand to get started'
                : `${brands.length} brand${brands.length !== 1 ? 's' : ''} configured`}
            </p>
          </div>
          {canCreate && (
            <Link
              href="/brands/new"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-small font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Create brand
            </Link>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {brands.length === 0 ? (
          <EmptyState canCreate={canCreate} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((brand) => (
              <BrandCard key={brand.id} brand={brand} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Brand card                                                           */
/* ------------------------------------------------------------------ */

type BrandWithCount = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  status: 'active' | 'archived'
  articleCount: number
}

function BrandCard({ brand }: { brand: BrandWithCount }) {
  const initials = brand.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="group relative flex flex-col rounded-xl border border-card-border bg-card-bg shadow-card transition-shadow duration-150 hover:shadow-raised">
      <div className="flex items-start gap-4 p-5">
        {/* Logo / avatar */}
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-heading-s font-fragment text-text-muted overflow-hidden">
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logo_url}
              alt={brand.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-heading-s font-fragment text-text">
              {brand.name}
            </h2>
            <StatusBadge status={brand.status} />
          </div>
          <p className="mt-1 text-caption text-text-muted">
            {brand.articleCount === 0
              ? 'No articles yet'
              : `${brand.articleCount} article${brand.articleCount !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-card-border px-5 py-3">
        <Link
          href={`/brands/${brand.id}/context`}
          className="inline-flex items-center gap-1.5 text-small font-medium text-accent-text transition-colors duration-150 hover:text-accent-hover"
        >
          Manage
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Status badge                                                         */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: 'active' | 'archived' }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-published-bg)] px-2 py-0.5 text-caption font-medium text-[var(--status-published-text)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-published-text)]" />
        Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-archived-bg)] px-2 py-0.5 text-caption font-medium text-[var(--status-archived-text)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-archived-text)]" />
      Archived
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Empty state                                                          */
/* ------------------------------------------------------------------ */

function EmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface text-text-muted">
        <Building2 className="h-8 w-8" strokeWidth={1.5} />
      </div>
      <h2 className="mt-5 text-heading-s font-fragment text-text">
        {canCreate ? 'Create your first brand' : 'No brands yet'}
      </h2>
      <p className="mt-2 max-w-xs text-small text-text-muted">
        {canCreate
          ? 'Brands group your tone of voice, reference documents, and articles in one place.'
          : 'You have not been added to any brand yet. Ask an admin to grant you access.'}
      </p>
      {canCreate && (
        <Link
          href="/brands/new"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-small font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Create brand
        </Link>
      )}
    </div>
  )
}
