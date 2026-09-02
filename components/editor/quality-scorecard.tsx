'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { PMDocument } from '@/lib/content/article-schema'
import type { QualityScore } from '@/lib/content/quality'

interface Props {
  document: PMDocument | null
  keywords: string[]
  meta: {
    slug?: string
    metaDescription?: string
  }
}

const SCORE_DEBOUNCE_MS = 3000

type ScoreStatus = 'idle' | 'loading' | 'loaded' | 'error'

function ScoreRing({ score }: { score: number }) {
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - score / 100)

  const color =
    score >= 80 ? '#22c55e' :
    score >= 60 ? '#f59e0b' :
    '#4F46E5'

  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        {/* Track */}
        <circle
          cx="40" cy="40" r={radius}
          fill="none"
          stroke="var(--surface-raised)"
          strokeWidth="6"
        />
        {/* Progress */}
        <circle
          cx="40" cy="40" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-heading-s font-medium leading-none"
          style={{ color }}
        >
          {score}
        </span>
        <span className="text-caption text-text-muted leading-none mt-0.5">/ 100</span>
      </div>
    </div>
  )
}

interface CategoryRowProps {
  label: string
  value: number | boolean
  type: 'score' | 'boolean'
}

function CategoryRow({ label, value, type }: CategoryRowProps) {
  const isOk = type === 'boolean' ? (value as boolean) : (value as number) >= 60

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-caption text-text-muted truncate">{label}</span>
      {type === 'score' ? (
        <div className="flex items-center gap-1.5">
          <div className="h-1 w-16 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${value as number}%`,
                backgroundColor: (value as number) >= 80 ? '#22c55e' : (value as number) >= 60 ? '#f59e0b' : '#4F46E5',
              }}
            />
          </div>
          <span className="w-6 shrink-0 text-right text-caption font-medium text-text">
            {value as number}
          </span>
        </div>
      ) : (
        <span
          className={[
            'rounded-full px-2 py-0.5 text-caption font-medium',
            isOk
              ? 'bg-[var(--status-published-bg)] text-[var(--status-published-text)]'
              : 'bg-[var(--status-draft-bg)] text-[var(--status-draft-text)]',
          ].join(' ')}
        >
          {isOk ? 'OK' : 'Missing'}
        </span>
      )}
    </div>
  )
}

interface IssueItemProps {
  issue: string
}

function IssueItem({ issue }: IssueItemProps) {
  const isHigh = issue.toLowerCase().includes('missing') ||
    issue.toLowerCase().includes('multiple')

  return (
    <li className="flex items-start gap-2">
      <span
        className={[
          'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px]',
          isHigh
            ? 'bg-[var(--status-review-bg)] text-[var(--status-review-text)]'
            : 'bg-[#f59e0b]/15 text-[#f59e0b]',
        ].join(' ')}
        aria-hidden="true"
      >
        !
      </span>
      <span className="text-caption text-text-muted leading-4">{issue}</span>
    </li>
  )
}

export function QualityScorecard({ document, keywords, meta }: Props) {
  const [score, setScore] = useState<QualityScore | null>(null)
  const [status, setStatus] = useState<ScoreStatus>('idle')

  const fetchScore = useCallback(async (doc: PMDocument) => {
    setStatus('loading')
    try {
      const res = await fetch('/api/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: doc, keywords, meta }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json() as QualityScore
      setScore(data)
      setStatus('loaded')
    } catch {
      setStatus('error')
    }
  }, [keywords, meta])

  // Debounced scoring. The very first run uses a 0ms delay so the card fills in
  // immediately on mount; every later document change waits out the debounce.
  const hasScoredRef = useRef(false)

  useEffect(() => {
    if (!document) return

    const delay = hasScoredRef.current ? SCORE_DEBOUNCE_MS : 0
    hasScoredRef.current = true

    const timer = setTimeout(() => { void fetchScore(document) }, delay)
    return () => clearTimeout(timer)
  }, [document, fetchScore])

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-small font-medium text-text">Article quality</h3>
        {status === 'loading' && (
          <svg className="h-3.5 w-3.5 animate-spin text-text-muted" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
      </div>

      {/* Score ring + overall */}
      <div className="mb-4 flex items-center gap-4">
        {score ? (
          <ScoreRing score={score.overall} />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-[6px] border-surface-raised">
            <span className="text-caption text-text-muted">—</span>
          </div>
        )}
        <div className="flex-1">
          <p className="text-caption text-text-muted">
            {status === 'idle' && 'Start writing to see the score'}
            {status === 'loading' && 'Calculating…'}
            {status === 'loaded' && score && (
              score.overall >= 80 ? 'Excellent quality' :
              score.overall >= 60 ? 'Good quality, room for improvement' :
              'Needs review'
            )}
            {status === 'error' && 'Error calculating'}
          </p>
        </div>
      </div>

      {/* Category breakdown */}
      {score && (
        <div className="border-t border-border pt-3">
          <div className="divide-y divide-border/50">
            <CategoryRow label="Heading hierarchy" value={score.headingHierarchy} type="score" />
            <CategoryRow label="Keyword density" value={score.keywordDensity} type="score" />
            <CategoryRow label="Readability" value={score.readability} type="score" />
            <CategoryRow label="Image alt text" value={score.allImagesHaveAlt} type="boolean" />
            <CategoryRow label="Slug URL" value={score.hasSlug} type="boolean" />
            <CategoryRow label="Meta description" value={score.hasMetaDescription} type="boolean" />
          </div>
        </div>
      )}

      {/* Issues list */}
      {score && score.issues.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 text-caption font-medium text-text">
            {score.issues.length} {score.issues.length === 1 ? 'issue' : 'issues'}
          </p>
          <ul className="space-y-1.5">
            {score.issues.map((issue, i) => (
              <IssueItem key={i} issue={issue} />
            ))}
          </ul>
        </div>
      )}

      {score && score.issues.length === 0 && status === 'loaded' && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-caption text-[var(--status-published-text)]">
            No issues detected
          </p>
        </div>
      )}
    </div>
  )
}
