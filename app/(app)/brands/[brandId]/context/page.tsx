import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import type { Database } from '@/lib/supabase/types'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { logAudit } from '@/lib/audit/log'
import { BrandProfileForm } from '@/components/brand/brand-profile-form'
import { importBrandProfileFromUrl } from './import-actions'

async function getBrandAndProfile(brandId: string) {
  const supabase = await getSupabaseServerClient()

  const [{ data: brand }, { data: profile }] = await Promise.all([
    supabase.from('brands').select('id, name, slug').eq('id', brandId).maybeSingle(),
    supabase.from('brand_profiles').select('*').eq('brand_id', brandId).maybeSingle(),
  ])

  return { brand, profile }
}

// Server Action: save brand profile
function parseJsonArray(raw: unknown, fallback: string[]): string[] {
  if (typeof raw !== 'string' || !raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : fallback
  } catch {
    return fallback
  }
}

async function saveBrandProfile(brandId: string, formData: FormData) {
  'use server'

  const ctx = await requirePermission('brand.read', brandId)

  const supabase = await getSupabaseServerClient()

  const payload: Database['app']['Tables']['brand_profiles']['Update'] = {
    tone_of_voice: (formData.get('tone_of_voice') as string) || null,
    audience: (formData.get('audience') as string) || null,
    key_messages: (formData.get('key_messages') as string) || null,
    dos: (formData.get('dos') as string) || null,
    donts: (formData.get('donts') as string) || null,
    banned_words: parseJsonArray(formData.get('banned_words'), []),
    // Stored lowercase to match the app.brand_profiles default ('{es}') and
    // the generation pipeline's language switch.
    language: parseJsonArray(formData.get('language'), ['es']).map((l) => l.toLowerCase()),
    copy_examples: (formData.get('copy_examples') as string) || null,
    ctas: (formData.get('ctas') as string) || null,
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase
    .from('brand_profiles')
    .select('id')
    .eq('brand_id', brandId)
    .maybeSingle()

  if (existing) {
    await supabase.from('brand_profiles').update(payload).eq('brand_id', brandId)
  } else {
    await supabase.from('brand_profiles').insert({ ...payload, brand_id: brandId })
  }

  await logAudit({
    actorId: ctx.userId,
    action: 'brand.updated',
    resourceType: 'brand_profile',
    resourceId: brandId,
    brandId,
  })

  revalidatePath(`/brands/${brandId}/context`)
}

type Props = {
  params: Promise<{ brandId: string }>
}

export default async function BrandContextPage({ params }: Props) {
  const { brandId } = await params
  await requirePermission('brand.read', brandId)
  const { brand, profile } = await getBrandAndProfile(brandId)

  if (!brand) notFound()

  const saveAction = saveBrandProfile.bind(null, brandId)
  const importAction = importBrandProfileFromUrl.bind(null, brandId)

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
            <TabLink href={`/brands/${brandId}/context`} active>
              Context
            </TabLink>
            <TabLink href={`/brands/${brandId}/documents`}>Documents</TabLink>
            <TabLink href={`/brands/${brandId}/profile`}>Profile</TabLink>
            <TabLink href={`/brands/${brandId}/settings`}>Settings</TabLink>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-6 py-8">
        <BrandProfileForm
          profile={profile}
          saveAction={saveAction}
          importAction={importAction}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tab nav link                                                         */
/* ------------------------------------------------------------------ */

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
