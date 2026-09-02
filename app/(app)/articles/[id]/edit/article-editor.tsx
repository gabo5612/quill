'use client'

import { useState, useCallback, useTransition } from 'react'
import Link from 'next/link'
import { TiptapEditor } from '@/components/editor/tiptap-editor'
import { QualityScorecard } from '@/components/editor/quality-scorecard'
import { saveArticleBody } from './actions'
import type { Tables } from '@/lib/supabase/types'
import type { PMDocument } from '@/lib/content/article-schema'

type Article = Pick<Tables<'articles'>, 'id' | 'status' | 'objective' | 'keywords' | 'brand_id'>
type ArticleBody = Pick<Tables<'article_body'>, 'body_prosemirror' | 'title_tag' | 'meta_description' | 'slug'>

interface Props {
  article: Article
  initialBody: ArticleBody | null
  canEdit: boolean
  /** True when the article is still a draft and no pipeline step ever ran. */
  generationNeverRan?: boolean
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  exported: 'Exported',
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-[var(--status-draft-bg)] text-[var(--status-draft-text)]',
  in_review: 'bg-[var(--status-review-bg)] text-[var(--status-review-text)]',
  approved: 'bg-[var(--status-published-bg)] text-[var(--status-published-text)]',
  exported: 'bg-[var(--status-archived-bg)] text-[var(--status-archived-text)]',
}

export function ArticleEditor({ article, initialBody, canEdit, generationNeverRan = false }: Props) {
  const [isSaving, startSaveTransition] = useTransition()
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [status, setStatus] = useState(article.status)

  // Meta fields (editable in sidebar)
  const [titleTag, setTitleTag] = useState(initialBody?.title_tag ?? '')
  const [metaDescription, setMetaDescription] = useState(initialBody?.meta_description ?? '')
  const [slug, setSlug] = useState(initialBody?.slug ?? '')

  // Current document (kept in sync for quality scoring)
  const [currentDoc, setCurrentDoc] = useState<PMDocument | null>(
    initialBody?.body_prosemirror
      ? (initialBody.body_prosemirror as unknown as PMDocument)
      : null
  )

  const handleDocumentChange = useCallback((doc: PMDocument) => {
    setCurrentDoc(doc)
  }, [])

  const handleSave = useCallback((doc: PMDocument) => {
    setSaveError(null)
    startSaveTransition(async () => {
      const result = await saveArticleBody({
        articleId: article.id,
        bodyProsemirror: doc as unknown as Record<string, unknown>,
        titleTag: titleTag || null,
        metaDescription: metaDescription || null,
        slug: slug || null,
      })

      if (result.error) {
        setSaveError(result.error)
      } else {
        setLastSaved(new Date())
      }
    })
  }, [article.id, titleTag, metaDescription, slug])

  async function handleRequestReview() {
    const res = await fetch(`/api/articles/${article.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_review' }),
    })
    if (res.ok) setStatus('in_review')
  }

  async function handleExport(format: 'html' | 'markdown' | 'copy') {
    setExportOpen(false)
    const res = await fetch(`/api/export/${article.id}?format=${format}`)
    if (!res.ok) return

    if (format === 'copy') {
      const text = await res.text()
      await navigator.clipboard.writeText(text)
      return
    }

    const blob = await res.blob()
    const ext = format === 'html' ? 'html' : 'md'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug || article.id}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="-mx-4 -my-6 lg:-mx-8 lg:-my-8 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-bg">
      {/* ── Top bar ── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
        {/* Left: nav + status */}
        <div className="flex items-center gap-3">
          <Link
            href="/articles"
            className="rounded-md p-1.5 text-text-muted hover:bg-surface-raised hover:text-text transition-colors"
            aria-label="Back to articles"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 14l-5-5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>

          <span
            className={[
              'inline-flex items-center rounded-full px-2.5 py-1 text-caption font-medium',
              STATUS_STYLES[status] ?? STATUS_STYLES.draft,
            ].join(' ')}
          >
            {STATUS_LABELS[status] ?? status}
          </span>

          {/* Save state */}
          <span className="text-caption text-text-muted">
            {isSaving ? 'Saving…' : lastSaved ? `Saved ${formatRelativeTime(lastSaved)}` : ''}
          </span>

          {saveError && (
            <span className="text-caption text-[var(--status-review-text)]">{saveError}</span>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {canEdit && status === 'draft' && (
            <button
              onClick={handleRequestReview}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-small font-medium text-text hover:bg-surface-raised transition-colors"
            >
              Request review
            </button>
          )}

          <Link
            href={`/articles/${article.id}/trace`}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-small font-medium text-text hover:bg-surface-raised transition-colors"
          >
            How it was written
          </Link>

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportOpen(o => !o)}
              className="flex items-center gap-1.5 rounded-lg bg-btn-primary-bg px-3 py-1.5 text-small font-medium text-btn-primary-text hover:bg-btn-primary-hover-bg transition-colors"
            >
              Export
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 5l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {exportOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setExportOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-surface shadow-raised">
                  {([
                    { key: 'html',     label: 'Export HTML' },
                    { key: 'markdown', label: 'Export Markdown' },
                    { key: 'copy',     label: 'Copy HTML' },
                  ] as const).map(item => (
                    <button
                      key={item.key}
                      onClick={() => handleExport(item.key)}
                      className="w-full px-4 py-2.5 text-left text-small text-text hover:bg-surface-raised transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {generationNeverRan && (
        <div
          role="status"
          className="shrink-0 border-b border-[var(--status-review-text)]/30 bg-[var(--status-review-bg)] px-4 py-3"
        >
          <p className="text-small font-medium text-[var(--status-review-text)]">
            This draft was never generated
          </p>
          <p className="mt-0.5 text-caption text-[var(--text-muted)]">
            The article was created but no pipeline step ever ran, so the editor
            is empty. That normally means the background job queue could not
            reach the app — check that the Inngest app is synced to{' '}
            <code className="font-mono">/api/inngest</code>. You can start
            writing here in the meantime; anything you type is saved.
          </p>
        </div>
      )}

      {/* ── Body: editor + sidebar ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor area */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-8 py-10">
            <TiptapEditor
              initialContent={initialBody?.body_prosemirror as unknown as PMDocument ?? null}
              editable={canEdit}
              onUpdate={handleDocumentChange}
              onSave={handleSave}
              placeholder="Start writing, or wait for the generated draft to load…"
            />
          </div>
        </main>

        {/* Right sidebar */}
        <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-surface xl:flex">
          <div className="space-y-px p-4">
            {/* Quality scorecard */}
            <QualityScorecard
              document={currentDoc}
              keywords={article.keywords ?? []}
              meta={{ slug, metaDescription }}
            />

            {/* SEO metadata */}
            <div className="mt-4 space-y-4 rounded-xl border border-border bg-surface p-4">
              <h3 className="text-small font-medium text-text">SEO metadata</h3>

              <div className="space-y-1.5">
                <label className="block text-caption font-medium text-text-muted">
                  Title tag
                  <span className={[
                    'ml-1',
                    titleTag.length > 60 ? 'text-[var(--status-review-text)]' : 'text-text-muted',
                  ].join(' ')}>
                    {titleTag.length}/60
                  </span>
                </label>
                <input
                  type="text"
                  value={titleTag}
                  onChange={e => setTitleTag(e.target.value)}
                  placeholder="Title for search engines"
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-caption text-input-text placeholder:text-input-placeholder focus:border-input-border-focus focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-caption font-medium text-text-muted">
                  Meta description
                  <span className={[
                    'ml-1',
                    metaDescription.length > 160 ? 'text-[var(--status-review-text)]' : 'text-text-muted',
                  ].join(' ')}>
                    {metaDescription.length}/160
                  </span>
                </label>
                <textarea
                  value={metaDescription}
                  onChange={e => setMetaDescription(e.target.value)}
                  placeholder="Description for search engines"
                  rows={3}
                  disabled={!canEdit}
                  className="w-full resize-none rounded-lg border border-input-border bg-input-bg px-3 py-2 text-caption text-input-text placeholder:text-input-placeholder focus:border-input-border-focus focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-caption font-medium text-text-muted">
                  Slug URL
                </label>
                <div className="flex items-center gap-1.5 rounded-lg border border-input-border bg-input-bg px-3 py-2 focus-within:border-input-border-focus focus-within:ring-1 focus-within:ring-ring">
                  <span className="shrink-0 text-caption text-text-muted">/</span>
                  <input
                    type="text"
                    value={slug}
                    onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
                    placeholder="article-url-slug"
                    disabled={!canEdit}
                    className="flex-1 bg-transparent text-caption text-input-text placeholder:text-input-placeholder focus:outline-none disabled:opacity-60"
                  />
                </div>
              </div>
            </div>

            {/* Keywords */}
            {(article.keywords ?? []).length > 0 && (
              <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                <h3 className="mb-2 text-small font-medium text-text">Target keywords</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(article.keywords ?? []).map(kw => (
                    <span
                      key={kw}
                      className="rounded-full bg-[var(--chip-accent-bg)] px-2.5 py-1 text-caption font-medium text-[var(--chip-accent-text)]"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 10) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}
