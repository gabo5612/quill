import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { logAudit } from '@/lib/audit/log'

export const metadata: Metadata = { title: 'Brand Profile' }

async function getBrand(brandId: string) {
  const supabase = await getSupabaseServerClient()

  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, slug, logo_url, status')
    .eq('id', brandId)
    .maybeSingle()

  return brand as {
    id: string
    name: string
    slug: string
    logo_url: string | null
    status: 'active' | 'archived'
  } | null
}

async function updateBrand(brandId: string, formData: FormData) {
  'use server'

  const ctx = await requirePermission('brand.manage', brandId)

  const name = String(formData.get('name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const logo_url = String(formData.get('logo_url') ?? '').trim() || null

  if (!name || !slug) return

  const supabase = await getSupabaseServerClient()
  await supabase
    .from('brands')
    .update({ name, slug, logo_url, updated_at: new Date().toISOString() })
    .eq('id', brandId)

  await logAudit({
    actorId: ctx.userId,
    action: 'brand.updated',
    resourceType: 'brand',
    resourceId: brandId,
    brandId,
    metadata: { name, slug },
  })

  revalidatePath(`/brands/${brandId}/profile`)
  revalidatePath('/brands')
}

type Props = { params: Promise<{ brandId: string }> }

export default async function BrandProfilePage({ params }: Props) {
  const { brandId } = await params
  await requirePermission('brand.read', brandId)
  const brand = await getBrand(brandId)

  if (!brand) notFound()

  const updateAction = updateBrand.bind(null, brandId)

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
            <TabLink href={`/brands/${brandId}/profile`} active>
              Profile
            </TabLink>
            <TabLink href={`/brands/${brandId}/settings`}>Settings</TabLink>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-6 py-8">
        <form action={updateAction} className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-heading-s font-fragment text-text">
                Brand identity
              </h2>
              <p className="mt-0.5 text-small text-text-muted">
                Name, slug, and logo shown across the tool.
              </p>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-small font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Save changes
            </button>
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div className="rounded-xl border border-card-border bg-card-bg p-5 shadow-card">
              <label
                htmlFor="name"
                className="block text-small font-medium text-text mb-0.5"
              >
                Brand name
              </label>
              <p className="text-caption text-text-muted mb-3">
                How this brand is identified throughout the tool.
              </p>
              <input
                id="name"
                name="name"
                type="text"
                defaultValue={brand.name}
                required
                maxLength={120}
                className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2.5 text-small text-input-text placeholder:text-input-placeholder transition-colors duration-150 focus:outline-none focus:border-input-border-focus"
              />
            </div>

            {/* Slug */}
            <div className="rounded-xl border border-card-border bg-card-bg p-5 shadow-card">
              <label
                htmlFor="slug"
                className="block text-small font-medium text-text mb-0.5"
              >
                Slug
              </label>
              <p className="text-caption text-text-muted mb-3">
                URL-safe identifier. Auto-formatted on save.
              </p>
              <input
                id="slug"
                name="slug"
                type="text"
                defaultValue={brand.slug}
                required
                maxLength={80}
                pattern="[a-z0-9-]+"
                className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2.5 text-small text-input-text font-mono placeholder:text-input-placeholder transition-colors duration-150 focus:outline-none focus:border-input-border-focus"
              />
            </div>

            {/* Logo URL */}
            <div className="rounded-xl border border-card-border bg-card-bg p-5 shadow-card">
              <label
                htmlFor="logo_url"
                className="block text-small font-medium text-text mb-0.5"
              >
                Logo URL
              </label>
              <p className="text-caption text-text-muted mb-3">
                Optional. Public URL of the brand&apos;s logo image.
              </p>
              <div className="flex items-center gap-3">
                {brand.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brand.logo_url}
                    alt="Brand logo"
                    className="h-10 w-10 rounded-lg object-contain border border-border bg-surface flex-shrink-0"
                  />
                )}
                <input
                  id="logo_url"
                  name="logo_url"
                  type="url"
                  defaultValue={brand.logo_url ?? ''}
                  maxLength={512}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2.5 text-small text-input-text placeholder:text-input-placeholder transition-colors duration-150 focus:outline-none focus:border-input-border-focus"
                />
              </div>
            </div>

            {/* Status (read-only — changed in Settings) */}
            <div className="rounded-xl border border-card-border bg-card-bg p-5 shadow-card">
              <p className="text-small font-medium text-text mb-0.5">Status</p>
              <p className="text-caption text-text-muted mb-3">
                Archive or reactivate this brand in the{' '}
                <Link
                  href={`/brands/${brandId}/settings`}
                  className="text-accent-text hover:underline"
                >
                  Settings
                </Link>{' '}
                tab.
              </p>
              <span
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium',
                  brand.status === 'active'
                    ? 'bg-[var(--status-published-bg)] text-[var(--status-published-text)]'
                    : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]',
                ].join(' ')}
              >
                <span
                  className={[
                    'h-1.5 w-1.5 rounded-full',
                    brand.status === 'active'
                      ? 'bg-[var(--status-published-text)]'
                      : 'bg-[var(--text-muted)]',
                  ].join(' ')}
                />
                {brand.status === 'active' ? 'Active' : 'Archived'}
              </span>
            </div>
          </div>
        </form>
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
