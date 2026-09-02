import Link from 'next/link'
import type { Metadata } from 'next'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { Badge, type BadgeStatus } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Plus } from 'lucide-react'

export const metadata: Metadata = { title: 'Articles' }

const STATUSES = ['all', 'draft', 'in_review', 'approved', 'exported'] as const
type StatusFilter = (typeof STATUSES)[number]

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  draft: 'Draft',
  in_review: 'In Review',
  approved: 'Approved',
  exported: 'Exported',
}

type ArticleRow = {
  id: string
  objective: string | null
  status: 'draft' | 'in_review' | 'approved' | 'exported'
  brand_id: string
  brandName: string
  created_at: string
}

async function getArticles(statusFilter: StatusFilter): Promise<ArticleRow[]> {
  const supabase = await getSupabaseServerClient()

  let q = supabase
    .from('articles')
    .select('id, objective, status, brand_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (statusFilter !== 'all') {
    q = q.eq('status', statusFilter)
  }

  const { data: articles } = await q

  const rows = (articles ?? []) as ArticleRow[]

  const brandIds = [...new Set(rows.map((a) => a.brand_id))]
  const { data: brands } =
    brandIds.length > 0
      ? await supabase.from('brands').select('id, name').in('id', brandIds)
      : { data: [] }

  const brandMap: Record<string, string> = {}
  for (const b of brands ?? []) {
    brandMap[b.id] = b.name
  }

  return rows.map((a) => ({ ...a, brandName: brandMap[a.brand_id] ?? '—' }))
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const statusFilter = (
    STATUSES.includes(status as StatusFilter) ? status : 'all'
  ) as StatusFilter

  const articles = await getArticles(statusFilter)

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-heading-l font-fragment text-[var(--text)]">
            Articles
          </h1>
          <p className="mt-1 text-small text-[var(--text-muted)]">
            {articles.length === 0
              ? 'No articles yet.'
              : `${articles.length} article${articles.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button asChild variant="primary" size="md" icon={<Plus size={15} />}>
          <Link href="/articles/new">Generate article</Link>
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === 'all' ? '/articles' : `/articles?status=${s}`}
            className={[
              'px-3 py-2 text-small font-medium transition-colors -mb-px border-b-2',
              statusFilter === s
                ? 'border-[var(--accent)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
            ].join(' ')}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {articles.length === 0 ? (
        <EmptyState statusFilter={statusFilter} />
      ) : (
        <ArticleTable articles={articles} />
      )}
    </div>
  )
}

function ArticleTable({ articles }: { articles: ArticleRow[] }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-card overflow-hidden">
      <table className="w-full text-small" aria-label="Articles list">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="px-4 py-3 text-left font-normal">
              <span className="text-caption font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Article
              </span>
            </th>
            <th className="px-4 py-3 text-left font-normal hidden sm:table-cell">
              <span className="text-caption font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Brand
              </span>
            </th>
            <th className="px-4 py-3 text-left font-normal">
              <span className="text-caption font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Status
              </span>
            </th>
            <th className="px-4 py-3 text-left font-normal hidden md:table-cell">
              <span className="text-caption font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Created
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {articles.map((article) => (
            <tr
              key={article.id}
              className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-raised)] transition-colors group"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/articles/${article.id}/edit`}
                  className="block min-w-0"
                >
                  <p className="font-medium text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate max-w-sm">
                    {article.objective ?? 'Untitled article'}
                  </p>
                </Link>
              </td>
              <td className="px-4 py-3 hidden sm:table-cell">
                <span className="text-[var(--text-muted)]">
                  {article.brandName}
                </span>
              </td>
              <td className="px-4 py-3">
                <Badge status={article.status as BadgeStatus} size="sm" />
              </td>
              <td className="px-4 py-3 hidden md:table-cell text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                {new Intl.DateTimeFormat('en-US', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }).format(new Date(article.created_at))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState({ statusFilter }: { statusFilter: StatusFilter }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
        <FileText size={28} strokeWidth={1.5} />
      </div>
      <h2 className="mt-5 text-heading-s font-fragment text-[var(--text)]">
        {statusFilter === 'all'
          ? 'No articles yet'
          : `No ${STATUS_LABELS[statusFilter].toLowerCase()} articles`}
      </h2>
      <p className="mt-2 max-w-xs text-small text-[var(--text-muted)]">
        {statusFilter === 'all'
          ? 'Generate your first AI-powered article for a brand.'
          : 'Articles with this status will appear here.'}
      </p>
      {statusFilter === 'all' && (
        <Button
          asChild
          variant="primary"
          size="md"
          className="mt-6"
          icon={<Plus size={15} />}
        >
          <Link href="/articles/new">Generate article</Link>
        </Button>
      )}
    </div>
  )
}
