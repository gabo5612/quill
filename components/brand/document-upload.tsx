'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { Upload, FileText, X, AlertCircle, Loader2 } from 'lucide-react'

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
]
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.md', '.txt']
const MAX_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

function validateFile(file: File): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXTENSIONS.includes(ext)) {
    return `File type not allowed: ${ext}. Use PDF, DOCX, MD or TXT.`
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `File exceeds the 20 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`
  }
  return null
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

type QueuedFile = {
  id: string
  file: File
  error: string | null
  progress: 'idle' | 'uploading' | 'done' | 'error'
}

type Props = {
  uploadAction: (formData: FormData) => Promise<void>
  /** False when OPENAI_API_KEY is absent — uploads would fail to index. */
  indexingEnabled?: boolean
}

export function DocumentUpload({ uploadAction, indexingEnabled = true }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [queue, setQueue] = useState<QueuedFile[]>([])
  const [, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function enqueueFiles(files: FileList | File[]) {
    const newItems: QueuedFile[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      error: validateFile(file),
      progress: 'idle' as const,
    }))
    setQueue((prev) => [...prev, ...newItems])

    // Auto-upload valid files
    for (const item of newItems) {
      if (!item.error) {
        uploadFile(item)
      }
    }
  }

  function uploadFile(item: QueuedFile) {
    setQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, progress: 'uploading' } : q))
    )

    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.append('file', item.file)
        await uploadAction(fd)
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, progress: 'done' } : q))
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error uploading the file'
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, progress: 'error', error: msg } : q
          )
        )
      }
    })
  }

  function removeFromQueue(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id))
  }

  // Drag handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      enqueueFiles(e.dataTransfer.files)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      enqueueFiles(e.target.files)
      e.target.value = '' // reset so same file can be picked again
    }
  }

  const doneCount = queue.filter((q) => q.progress === 'done').length
  const uploading = queue.some((q) => q.progress === 'uploading')

  return (
    <div className="space-y-4">
      {!indexingEnabled && (
        <div
          role="status"
          className="rounded-lg border border-[var(--status-review-text)]/30 bg-[var(--status-review-bg)] px-4 py-3 text-caption text-[var(--status-review-text)]"
        >
          Uploads will not be indexed: embeddings require an OpenAI key, which
          is not configured on this deployment. Files are stored, but their
          contents will not be searchable until a key is added and they are
          re-uploaded.
        </div>
      )}

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Document upload area. Drag files here or click to select them."
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        className={[
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-12 text-center cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring select-none',
          isDragging
            ? 'border-accent bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]'
            : 'border-border bg-surface hover:border-text-muted hover:bg-surface-raised',
        ].join(' ')}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={handleInputChange}
          className="sr-only"
          tabIndex={-1}
        />

        <div
          className={[
            'flex h-12 w-12 items-center justify-center rounded-xl border transition-colors duration-150',
            isDragging
              ? 'border-accent text-accent-text'
              : 'border-border text-text-muted',
          ].join(' ')}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Upload className="h-6 w-6" strokeWidth={1.5} />
          )}
        </div>

        <p className="mt-4 text-small font-medium text-text">
          {isDragging ? 'Drop files here' : 'Drag documents or click to select'}
        </p>
        <p className="mt-1 text-caption text-text-muted">
          PDF, DOCX, MD, TXT — max 20 MB per file
        </p>

        {doneCount > 0 && (
          <p className="mt-3 text-caption text-[var(--status-published-text)] font-medium">
            {doneCount} file{doneCount !== 1 ? 's' : ''} uploaded successfully
          </p>
        )}
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <ul className="space-y-2">
          {queue.map((item) => (
            <QueueItem
              key={item.id}
              item={item}
              onRemove={() => removeFromQueue(item.id)}
              onRetry={() => uploadFile(item)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Queue item row                                                       */
/* ------------------------------------------------------------------ */

function QueueItem({
  item,
  onRemove,
  onRetry,
}: {
  item: QueuedFile
  onRemove: () => void
  onRetry: () => void
}) {
  const ext = item.file.name.split('.').pop()?.toUpperCase() ?? '—'

  return (
    <li className="flex items-center gap-3 rounded-lg border border-card-border bg-card-bg px-4 py-3 shadow-card">
      {/* Icon */}
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border text-text-muted">
        {item.progress === 'uploading' ? (
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
        ) : item.progress === 'error' || item.error ? (
          <AlertCircle className="h-4 w-4 text-[var(--status-review-text)]" />
        ) : (
          <FileText className="h-4 w-4" strokeWidth={1.5} />
        )}
      </div>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-medium text-text">{item.file.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-caption text-text-muted">
            {ext} · {formatSize(item.file.size)}
          </span>
          {item.progress === 'uploading' && (
            <span className="text-caption text-accent-text">Uploading…</span>
          )}
          {item.progress === 'done' && (
            <span className="text-caption text-[var(--status-published-text)]">
              Listo — procesando en segundo plano
            </span>
          )}
          {(item.error || item.progress === 'error') && (
            <span className="text-caption text-[var(--status-review-text)]">
              {item.error ?? 'Upload error'}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {item.progress === 'error' && !item.error && (
          <button
            type="button"
            onClick={onRetry}
            className="text-caption text-accent-text hover:text-accent-hover transition-colors"
          >
            Reintentar
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${item.file.name}`}
          className="rounded p-1 text-text-muted hover:bg-surface-raised hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
    </li>
  )
}
