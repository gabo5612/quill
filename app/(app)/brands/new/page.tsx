import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { logAudit } from '@/lib/audit/log'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = { title: 'New Brand' }

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function createBrand(formData: FormData) {
  'use server'

  // Only admins may create brands — mirrors the brands_write RLS policy.
  const { userId } = await requirePermission('brand.manage')

  const name = String(formData.get('name') ?? '').trim()
  const slug = slugify(String(formData.get('slug') ?? '') || name)
  const logo_url = String(formData.get('logo_url') ?? '').trim() || null

  if (!name) redirect('/brands/new?error=name_required')
  if (!slug) redirect('/brands/new?error=slug_required')

  const supabase = await getSupabaseServerClient()

  const { data: brand, error } = await supabase
    .from('brands')
    .insert({ name, slug, logo_url, status: 'active' })
    .select('id')
    .single()

  if (error || !brand) {
    const reason = error?.code === '23505' ? 'slug_taken' : 'create_failed'
    redirect(`/brands/new?error=${reason}`)
  }

  // The creator becomes the brand owner so the brand is immediately usable.
  await supabase.from('brand_members').insert({
    brand_id: brand.id,
    user_id: userId,
    brand_role: 'owner',
  })

  await logAudit({
    actorId: userId,
    action: 'brand.created',
    resourceType: 'brand',
    resourceId: brand.id,
    brandId: brand.id,
    metadata: { name, slug },
  })

  revalidatePath('/brands')
  redirect(`/brands/${brand.id}/context`)
}

const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Brand name is required.',
  slug_required: 'Slug is required and must contain letters or numbers.',
  slug_taken: 'That slug is already used by another brand.',
  create_failed: 'Could not create the brand. Please try again.',
}

export default async function NewBrandPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requirePermission('brand.manage')
  const { error } = await searchParams
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.create_failed) : null

  return (
    <div className="-mx-4 -my-6 lg:-mx-8 lg:-my-8">
      {/* Header */}
      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-2xl px-6 py-6">
          <Link
            href="/brands"
            className="inline-flex items-center gap-1.5 text-caption text-text-muted hover:text-text transition-colors mb-4"
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            Brands
          </Link>
          <h1 className="text-heading-l font-fragment text-text">New brand</h1>
          <p className="mt-1 text-small text-text-muted">
            Create a brand to start generating content.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="mx-auto max-w-2xl px-6 py-8">
        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-[var(--status-review-text)]/30 bg-[var(--status-review-bg)] px-4 py-3 text-small text-[var(--status-review-text)]"
          >
            {errorMessage}
          </div>
        )}

        <form action={createBrand} className="space-y-4">
          {/* Name */}
          <div className="rounded-xl border border-card-border bg-card-bg p-5 shadow-card">
            <label
              htmlFor="name"
              className="block text-small font-medium text-text mb-0.5"
            >
              Brand name <span className="text-[var(--status-review-text)]">*</span>
            </label>
            <p className="text-caption text-text-muted mb-3">
              How this brand is identified throughout the tool.
            </p>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoFocus
              maxLength={120}
              placeholder="e.g. Acme Corp"
              className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2.5 text-small text-input-text placeholder:text-input-placeholder transition-colors duration-150 focus:outline-none focus:border-input-border-focus"
            />
          </div>

          {/* Slug */}
          <div className="rounded-xl border border-card-border bg-card-bg p-5 shadow-card">
            <label
              htmlFor="slug"
              className="block text-small font-medium text-text mb-0.5"
            >
              Slug <span className="text-[var(--status-review-text)]">*</span>
            </label>
            <p className="text-caption text-text-muted mb-3">
              URL-safe identifier. Auto-formatted on save (lowercase, hyphens only).
            </p>
            <input
              id="slug"
              name="slug"
              type="text"
              required
              maxLength={80}
              placeholder="e.g. acme-corp"
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
            <input
              id="logo_url"
              name="logo_url"
              type="url"
              maxLength={512}
              placeholder="https://…"
              className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2.5 text-small text-input-text placeholder:text-input-placeholder transition-colors duration-150 focus:outline-none focus:border-input-border-focus"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Link
              href="/brands"
              className="text-small text-text-muted hover:text-text transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-small font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Create brand
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
