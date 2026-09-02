'use client'

import { useEffect, useState, useTransition } from 'react'
import { FileText, Trash2, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import type { Tables } from '@/lib/supabase/types'
import { formatDistanceToNow } from 'date-fns'

type Document = Tables<'brand_documents'>

type Props = {
  documents: Document[]
  deleteAction: (documentId: string) => Promise<void>
  brandId: string
}

const POLL_INTERVAL_MS = 3000

function isPending(d: Document) {
  return d.ingestion_status === 'pending' || d.ingestion_status === 'processing'
}

export function DocumentList({ documents: initial, deleteAction, brandId }: Props) {
  // `polled` is null until the client has fetched fresher data than the server
  // render; that keeps the server list authoritative on first paint and avoids
  // a setState-in-effect just to mirror props into state.
  const [polled, setPolled] = useState<Document[] | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  const docs = polled ?? initial
  const shouldPoll = docs.some(isPending)

  // Poll while any document is still being ingested.
  useEffect(() => {
    if (!shouldPoll) return

    let cancelled = false
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/brands/${brandId}/documents`, { cache: 'no-store' })
        if (!res.ok) return
        const data: Document[] = await res.json()
        if (!cancelled) setPolled(data)
      } catch {
        // Non-fatal — retry on the next tick.
      }
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [shouldPoll, brandId])

  function handleDelete(docId: string) {
    setDeletingIds((prev) => new Set(prev).add(docId))
    startTransition(async () => {
      try {
        await deleteAction(docId)
        setPolled((prev) => (prev ?? initial).filter((d) => d.id !== docId))
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev)
          next.delete(docId)
          return next
        })
      }
    })
  }

  return (
    <div>
      <h3 className="text-small font-medium text-text-muted mb-3 uppercase tracking-wide">
        Documents ({docs.length})
      </h3>
      <ul className="divide-y divide-border rounded-xl border border-card-border bg-card-bg shadow-card overflow-hidden">
        {docs.map((doc) => (
          <DocumentRow
            key={doc.id}
            doc={doc}
            isDeleting={deletingIds.has(doc.id)}
            onDelete={() => handleDelete(doc.id)}
          />
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Row                                                                  */
/* ------------------------------------------------------------------ */

function DocumentRow({
  doc,
  isDeleting,
  onDelete,
}: {
  doc: Document
  isDeleting: boolean
  onDelete: () => void
}) {
  return (
    <li className="flex items-center gap-4 px-5 py-3.5">
      {/* Icon */}
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-border text-text-muted">
        <FileText className="h-4 w-4" strokeWidth={1.5} />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-medium text-text">{doc.name}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-caption text-text-muted uppercase tracking-wide">
            {doc.file_type}
          </span>
          <span className="text-caption text-text-muted">
            {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Status */}
      <StatusBadge status={doc.ingestion_status} />

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        aria-label={`Delete ${doc.name}`}
        className="ml-2 rounded p-1.5 text-text-muted hover:bg-surface-raised hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
        )}
      </button>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Status badge                                                         */
/* ------------------------------------------------------------------ */

type Status = 'pending' | 'processing' | 'done' | 'error'

function StatusBadge({ status }: { status: Status }) {
  const configs: Record<
    Status,
    { label: string; icon: React.ReactNode; className: string }
  > = {
    pending: {
      label: 'Queued',
      icon: <Clock className="h-3.5 w-3.5" />,
      className:
        'bg-[var(--status-draft-bg)] text-[var(--status-draft-text)]',
    },
    processing: {
      label: 'Processing',
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      className:
        'bg-[var(--status-review-bg)] text-[var(--status-review-text)]',
    },
    done: {
      label: 'Done',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      className:
        'bg-[var(--status-published-bg)] text-[var(--status-published-text)]',
    },
    error: {
      label: 'Error',
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      className:
        'bg-[var(--status-review-bg)] text-[var(--status-review-text)]',
    },
  }

  const { label, icon, className } = configs[status]

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium',
        className,
      ].join(' ')}
    >
      {icon}
      {label}
    </span>
  )
}
