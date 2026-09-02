import type { Metadata } from 'next'
import { Calendar } from 'lucide-react'

export const metadata: Metadata = { title: 'Calendar' }

export default function CalendarPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
        <Calendar size={36} strokeWidth={1.5} />
      </div>

      <h1 className="mt-6 text-heading-l font-fragment text-[var(--text)]">
        Calendar
      </h1>

      <p className="mt-3 max-w-sm text-small text-[var(--text-muted)] leading-relaxed">
        Schedule and visualize your content pipeline across brands. Coming in v2.
      </p>

      <span className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-caption font-medium text-[var(--text-muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
        Coming soon
      </span>
    </div>
  )
}
