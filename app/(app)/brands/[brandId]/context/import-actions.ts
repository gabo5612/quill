'use server'

import { requirePermission } from '@/lib/auth/require-permission'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit/log'
import { recordGeneration } from '@/lib/ai/cost'
import { UnsafeUrlError } from '@/lib/brand/crawl'
import { inferBrandProfileFromSite, type InferredProfile } from '@/lib/brand/infer-profile'

export interface ImportResult {
  profile?: InferredProfile
  pagesFetched?: string[]
  error?: string
}

/**
 * Reads a brand's website and returns a *proposed* profile.
 *
 * Deliberately does not write to the database: the editor reviews the draft in
 * the form and presses Save. An import that silently overwrote a curated brand
 * voice would be far worse than one that needs a second click.
 */
export async function importBrandProfileFromUrl(
  brandId: string,
  url: string,
): Promise<ImportResult> {
  const ctx = await requirePermission('brand.read', brandId)

  if (!url.trim()) return { error: 'Enter the brand’s website URL.' }

  const supabase = await getSupabaseServerClient()
  const { data: brand } = await supabase
    .from('brands')
    .select('name')
    .eq('id', brandId)
    .maybeSingle()

  if (!brand) return { error: 'Brand not found.' }

  try {
    const result = await inferBrandProfileFromSite(url, brand.name)

    // Site analysis is a real model call — it belongs in the cost ledger even
    // though it isn't part of an article generation.
    await recordGeneration({
      articleId: brandId, // no article; keyed to the brand for attribution
      brandId,
      provider: 'anthropic',
      modelId: result.modelId,
      step: 'outline',
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.inputTokens + result.usage.outputTokens,
      },
      payload: {
        kind: 'brand-import',
        origin: result.crawl.origin,
        pagesFetched: result.crawl.pagesFetched,
        confidence: result.profile.confidence,
        notes: result.profile.notes,
      },
    })

    await logAudit({
      actorId: ctx.userId,
      action: 'brand.updated',
      resourceType: 'brand_profile',
      resourceId: brandId,
      brandId,
      metadata: {
        importedFrom: result.crawl.origin,
        pages: result.crawl.pagesFetched.length,
        confidence: result.profile.confidence,
      },
    })

    return { profile: result.profile, pagesFetched: result.crawl.pagesFetched }
  } catch (error) {
    if (error instanceof UnsafeUrlError) return { error: error.message }
    const message = error instanceof Error ? error.message : 'Could not read that site.'
    console.error('[brand-import]', message)
    return { error: message }
  }
}
