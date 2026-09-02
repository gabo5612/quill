import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { TraceTimeline, type TraceRow } from './trace-timeline'

export const metadata: Metadata = { title: 'Generation trace' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function TracePage({ params }: Props) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS scopes both tables to brands the caller can read, so a missing row
  // means "not found or not yours".
  const [{ data: article }, { data: rows }] = await Promise.all([
    supabase
      .from('articles')
      .select('id, title, objective, keywords, status, model_id, model_provider, created_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('generations')
      .select('id, step, payload, tokens_in, tokens_out, cost_usd, duration_ms, status, error, model_id, provider, created_at')
      .eq('article_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (!article) redirect('/articles')

  const trace = (rows ?? []) as unknown as TraceRow[]

  const totals = trace.reduce(
    (acc, r) => ({
      tokensIn: acc.tokensIn + (r.tokens_in ?? 0),
      tokensOut: acc.tokensOut + (r.tokens_out ?? 0),
      costUsd: acc.costUsd + Number(r.cost_usd ?? 0),
      durationMs: acc.durationMs + (r.duration_ms ?? 0),
    }),
    { tokensIn: 0, tokensOut: 0, costUsd: 0, durationMs: 0 },
  )

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <Link
          href={`/articles/${id}/edit`}
          className="text-caption text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          ← Back to the editor
        </Link>
        <h1 className="mt-2 text-heading-l font-fragment text-[var(--text)]">
          How this article was written
        </h1>
        <p className="mt-1 text-small text-[var(--text-muted)]">
          Every decision the pipeline made, in order — what it knew about the
          brand, how it planned the piece, and what it flagged.
        </p>
      </div>

      {/* Brief */}
      <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-card">
        <h2 className="text-small font-medium text-[var(--text)]">The brief</h2>
        <dl className="mt-3 space-y-2 text-small">
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-[var(--text-muted)]">Objective</dt>
            <dd className="text-[var(--text)]">{article.objective || '—'}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-[var(--text-muted)]">Keywords</dt>
            <dd className="text-[var(--text)]">
              {article.keywords?.length ? article.keywords.join(', ') : '—'}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-[var(--text-muted)]">Model</dt>
            <dd className="text-[var(--text)] font-mono text-caption">
              {article.model_id}
            </dd>
          </div>
        </dl>
      </section>

      {/* Totals */}
      {trace.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Steps" value={String(trace.length)} />
          <Stat
            label="Tokens"
            value={`${(totals.tokensIn + totals.tokensOut).toLocaleString('en-US')}`}
            hint={`${totals.tokensIn.toLocaleString('en-US')} in · ${totals.tokensOut.toLocaleString('en-US')} out`}
          />
          <Stat label="Estimated cost" value={`$${totals.costUsd.toFixed(4)}`} />
          <Stat
            label="Model time"
            value={`${(totals.durationMs / 1000).toFixed(1)}s`}
          />
        </section>
      )}

      {trace.length === 0 ? (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-8 text-center shadow-card">
          <p className="text-small text-[var(--text-muted)]">
            No trace recorded for this article.
          </p>
          <p className="mt-1 text-caption text-[var(--text-muted)]">
            Articles generated before tracing was added have no history, and a
            draft written by hand never had one.
          </p>
        </div>
      ) : (
        <TraceTimeline rows={trace} />
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3">
      <p className="text-caption uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-heading-s font-fragment text-[var(--text)] tabular-nums">
        {value}
      </p>
      {hint && <p className="text-caption text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}
