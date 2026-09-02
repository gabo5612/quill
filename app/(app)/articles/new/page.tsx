import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { configuredProviders, isEmbeddingConfigured } from '@/lib/ai/providers'
import { NewArticleForm } from './new-article-form'
import { Building2, Plus } from 'lucide-react'

async function getPageData() {
  const supabase = await getSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS narrows `brands` to the caller's memberships (admins see everything).
  const [{ data: brands }, { data: models }] = await Promise.all([
    supabase
      .from('brands')
      .select('id, name, slug, logo_url')
      .eq('status', 'active')
      .order('name'),
    supabase
      .from('ai_models')
      .select('*')
      .eq('active', true)
      .order('is_flagship', { ascending: false }),
  ])

  // A model whose provider has no API key would fail at generation time —
  // don't offer it.
  const available = new Set<string>(configuredProviders())
  const usableModels = (models ?? []).filter(m => available.has(m.provider))

  return {
    brands: brands ?? [],
    models: usableModels,
    documentSearchEnabled: isEmbeddingConfigured(),
  }
}

export default async function NewArticlePage() {
  const { brands, models, documentSearchEnabled } = await getPageData()

  if (brands.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
          <div className="mb-10">
            <h1 className="text-display-s font-fragment text-text mb-2">
              New article
            </h1>
            <p className="text-small text-text-muted">
              Define the objective and parameters. The AI will generate a complete draft.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-card-border bg-card-bg shadow-card">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface text-text-muted">
              <Building2 size={28} strokeWidth={1.5} />
            </div>
            <h2 className="mt-5 text-heading-s font-fragment text-text">
              No brands yet
            </h2>
            <p className="mt-2 max-w-xs text-small text-text-muted">
              You need at least one brand before generating an article.
            </p>
            <Link
              href="/brands/new"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-small font-medium text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus size={15} strokeWidth={2} />
              Create your first brand
            </Link>
          </div>
    </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-display-s font-fragment text-text mb-2">
            New article
          </h1>
          <p className="text-small text-text-muted">
            Define the objective and parameters. The AI will generate a complete draft.
          </p>
        </div>

      {!documentSearchEnabled && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-[var(--status-draft-text)]/30 bg-[var(--status-draft-bg)] px-4 py-3 text-caption text-[var(--status-draft-text)]"
        >
          Brand documents are not being searched — embeddings require an OpenAI
          key, which is not configured. Drafts still use the brand profile
          (tone, audience, key messages, do&apos;s and don&apos;ts).
        </div>
      )}

      <NewArticleForm brands={brands} models={models} />
    </div>
  )
}
