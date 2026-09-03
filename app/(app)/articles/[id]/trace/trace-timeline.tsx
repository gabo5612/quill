import { Badge } from '@/components/ui/badge'

export interface TraceRow {
  id: string
  step: 'outline' | 'draft' | 'images' | 'qa' | 'seo' | 'done' | null
  payload: Record<string, unknown> | null
  tokens_in: number | null
  tokens_out: number | null
  cost_usd: number | string | null
  duration_ms: number | null
  status: 'success' | 'error'
  error: string | null
  model_id: string
  provider: string
  created_at: string
}

const STEP_LABELS: Record<string, string> = {
  outline: 'Outline',
  draft: 'Draft',
  images: 'Images',
  qa: 'QA review',
  seo: 'SEO',
  done: 'Done',
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-small">
      <span className="w-32 shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 flex-1 text-[var(--text)]">{children}</span>
    </div>
  )
}

/**
 * Renders one step's payload. Each `kind` gets a purpose-built view rather
 * than a JSON dump — the point is for an editor to read it, not to debug it.
 */
function Payload({ payload }: { payload: Record<string, unknown> }) {
  const kind = payload.kind as string | undefined

  if (kind === 'failure') {
    const attempts = (payload.attempts as {
      attempt: number; ok: boolean; durationMs: number
      errorType?: string; error?: string; finishReason?: string; responseTail?: string
    }[]) ?? []

    return (
      <div className="space-y-3">
        <Row label="Failed at">
          <span className="text-[var(--status-review-text)]">{String(payload.step ?? 'unknown step')}</span>
        </Row>
        <Row label="Error type">
          <span className="font-mono text-caption">{String(payload.errorType ?? '—')}</span>
        </Row>

        {attempts.length > 0 && (
          <div className="space-y-2">
            <p className="text-caption text-[var(--text-muted)]">
              {attempts.length} attempt{attempts.length === 1 ? '' : 's'} to the model:
            </p>
            <ol className="space-y-2">
              {attempts.map(a => (
                <li
                  key={a.attempt}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="flex items-center gap-2 text-caption">
                    <span className="font-medium text-[var(--text)]">Attempt {a.attempt}</span>
                    <span className={a.ok ? 'text-[var(--text-muted)]' : 'text-[var(--status-review-text)]'}>
                      {a.ok ? 'succeeded' : 'failed'}
                    </span>
                    <span className="text-[var(--text-muted)]">{a.durationMs} ms</span>
                    {a.finishReason && (
                      <span className="text-[var(--text-muted)]">finish: {a.finishReason}</span>
                    )}
                  </div>
                  {a.error && (
                    <p className="mt-1.5 text-caption text-[var(--text-muted)]">
                      <span className="font-mono">{a.errorType}</span>: {a.error}
                    </p>
                  )}
                  {a.responseTail && (
                    <>
                      <p className="mt-2 text-caption text-[var(--text-muted)]">
                        End of what the model actually returned:
                      </p>
                      <pre className="mt-1 overflow-x-auto rounded border border-[var(--border)] bg-[var(--surface-raised)] p-2 text-caption text-[var(--text-muted)]">
                        {a.responseTail}
                      </pre>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    )
  }

  if (kind === 'brand-context') {
    const fields = (payload.profileFields as string[]) ?? []
    const banned = (payload.bannedWords as string[]) ?? []
    const chunks = (payload.chunks as { source: string; excerpt: string }[]) ?? []
    const searchUsed = payload.documentSearchUsed as boolean

    return (
      <div className="space-y-2">
        <Row label="Search query">
          <span className="font-mono text-caption">{String(payload.query ?? '')}</span>
        </Row>
        <Row label="Profile fields">
          {fields.length ? fields.join(', ') : (
            <span className="text-[var(--text-muted)]">
              None filled in — the model had no brand voice to work from.
            </span>
          )}
        </Row>
        {banned.length > 0 && <Row label="Banned words">{banned.join(', ')}</Row>}
        <Row label="Document search">
          {searchUsed
            ? `${chunks.length} passage${chunks.length === 1 ? '' : 's'} retrieved`
            : (
              <span className="text-[var(--status-draft-text)]">
                Not used. {String(payload.documentSearchNote ?? '')}
              </span>
            )}
        </Row>
        {chunks.length > 0 && (
          <ul className="mt-2 space-y-2">
            {chunks.map((c, i) => (
              <li
                key={i}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <p className="text-caption uppercase tracking-wide text-[var(--text-muted)]">
                  {c.source}
                </p>
                <p className="mt-1 text-caption text-[var(--text)]">{c.excerpt}…</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  if (kind === 'outline') {
    const sections = (payload.sections as { heading: string; keyPoints: string[]; estimatedWords: number }[]) ?? []
    return (
      <div className="space-y-2">
        <Row label="Title">{String(payload.title ?? '')}</Row>
        <Row label="Target length">{String(payload.estimatedTotalWords ?? '—')} words</Row>
        <Row label="Images planned">{String(payload.plannedImages ?? 0)}</Row>
        <ol className="mt-2 space-y-2">
          {sections.map((sec, i) => (
            <li
              key={i}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <p className="text-small font-medium text-[var(--text)]">
                {i + 1}. {sec.heading}
                <span className="ml-2 text-caption font-normal text-[var(--text-muted)]">
                  ~{sec.estimatedWords} words
                </span>
              </p>
              <ul className="mt-1 list-disc pl-5 text-caption text-[var(--text-muted)]">
                {sec.keyPoints.map((kp, j) => <li key={j}>{kp}</li>)}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  if (kind === 'section') {
    return (
      <div className="space-y-2">
        <Row label="Section">{String(payload.heading ?? '')}</Row>
        <Row label="Target">{String(payload.targetWords ?? '—')} words</Row>
        <Row label="Written">{Number(payload.markdownChars ?? 0).toLocaleString('en-US')} characters</Row>
      </div>
    )
  }

  if (kind === 'qa') {
    const issues = (payload.issues as { type: string; description: string; severity: string; suggestion?: string | null }[]) ?? []
    return (
      <div className="space-y-2">
        <Row label="Score">
          {String(payload.overallScore ?? '—')}/100
          {payload.passesQA === false && (
            <span className="ml-2 text-[var(--status-review-text)]">— did not pass</span>
          )}
        </Row>
        {issues.length === 0 ? (
          <Row label="Issues">
            <span className="text-[var(--text-muted)]">None found.</span>
          </Row>
        ) : (
          <ul className="mt-2 space-y-2">
            {issues.map((issue, i) => (
              <li
                key={i}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <p className="text-caption uppercase tracking-wide text-[var(--text-muted)]">
                  {issue.type} · {issue.severity}
                </p>
                <p className="mt-1 text-small text-[var(--text)]">{issue.description}</p>
                {issue.suggestion && (
                  <p className="mt-1 text-caption text-[var(--text-muted)]">
                    Suggested: {issue.suggestion}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  if (kind === 'seo') {
    const links = (payload.internalLinkSuggestions as string[]) ?? []
    return (
      <div className="space-y-2">
        <Row label="Title tag">{String(payload.titleTag ?? '')}</Row>
        <Row label="Meta description">{String(payload.metaDescription ?? '')}</Row>
        <Row label="Slug">
          <span className="font-mono text-caption">/{String(payload.slug ?? '')}</span>
        </Row>
        {links.length > 0 && <Row label="Internal links">{links.join(', ')}</Row>}
      </div>
    )
  }

  if (kind === 'image-plan') {
    const planned = (payload.planned as { sectionIndex: number; altText: string; prompt: string }[]) ?? []
    return (
      <ul className="space-y-2">
        {planned.map((img, i) => (
          <li key={i} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-caption uppercase tracking-wide text-[var(--text-muted)]">
              After section {img.sectionIndex + 1}
            </p>
            <p className="mt-1 text-small text-[var(--text)]">{img.altText}</p>
            <p className="mt-1 text-caption text-[var(--text-muted)]">{img.prompt}</p>
          </li>
        ))}
      </ul>
    )
  }

  if (kind === 'image-render') {
    return (
      <div className="space-y-2">
        <Row label="Rendered">{String(payload.rendered ?? 0)}</Row>
        {Number(payload.failed ?? 0) > 0 && (
          <Row label="Failed">
            <span className="text-[var(--status-review-text)]">{String(payload.failed)}</span>
          </Row>
        )}
      </div>
    )
  }

  // Unknown shape — show it rather than hiding it.
  return (
    <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-caption text-[var(--text-muted)]">
      {JSON.stringify(payload, null, 2)}
    </pre>
  )
}

export function TraceTimeline({ rows }: { rows: TraceRow[] }) {
  return (
    <ol className="space-y-4">
      {rows.map((row, i) => {
        const cost = Number(row.cost_usd ?? 0)
        const tokens = (row.tokens_in ?? 0) + (row.tokens_out ?? 0)

        return (
          <li
            key={row.id}
            className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-card"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-caption font-medium text-[var(--text-muted)] tabular-nums">
                {i + 1}
              </span>
              <h3 className="text-small font-medium text-[var(--text)]">
                {STEP_LABELS[row.step ?? ''] ?? row.step ?? 'Step'}
              </h3>
              {row.status === 'error' && <Badge status="in_review" size="sm">Failed</Badge>}
              <span className="ml-auto flex flex-wrap gap-3 text-caption text-[var(--text-muted)] tabular-nums">
                {tokens > 0 && <span>{tokens.toLocaleString('en-US')} tokens</span>}
                {cost > 0 && <span>${cost.toFixed(4)}</span>}
                {row.duration_ms != null && <span>{(row.duration_ms / 1000).toFixed(1)}s</span>}
                <span className="font-mono">{row.model_id}</span>
              </span>
            </div>

            {row.error && (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-[var(--status-review-text)]/30 bg-[var(--status-review-bg)] px-3 py-2 text-caption text-[var(--status-review-text)]"
              >
                {row.error}
              </p>
            )}

            {row.payload && (
              <div className="mt-4">
                <Payload payload={row.payload} />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
