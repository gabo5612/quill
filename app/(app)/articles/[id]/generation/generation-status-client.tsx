'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  articleId: string
  objective: string
}

type StepKey = 'outline' | 'draft' | 'images' | 'qa' | 'seo' | 'done'

interface Step {
  key: StepKey
  label: string
  description: string
  estimatedSeconds: number
}

const STEPS: Step[] = [
  { key: 'outline',  label: 'Outline',    description: 'Planning sections and hierarchy',          estimatedSeconds: 15 },
  { key: 'draft',    label: 'Draft',      description: 'Writing content section by section',         estimatedSeconds: 45 },
  { key: 'images',   label: 'Images',     description: 'Illustrating the article',                   estimatedSeconds: 30 },
  { key: 'qa',       label: 'QA Review',  description: 'Checking coherence and brand voice',         estimatedSeconds: 20 },
  { key: 'seo',      label: 'SEO',        description: 'Generating metadata and schema markup',      estimatedSeconds: 10 },
  { key: 'done',     label: 'Done',       description: 'Article generated',                          estimatedSeconds: 0 },
]

const POLL_INTERVAL_MS = 3000

type StepStatus = 'pending' | 'active' | 'complete' | 'error'

interface GenerationState {
  currentStep: StepKey
  stepStatuses: Record<StepKey, StepStatus>
  startedAt: number
  error: string | null
}

function buildInitialState(): GenerationState {
  return {
    currentStep: 'outline',
    stepStatuses: {
      outline: 'active',
      draft: 'pending',
      images: 'pending',
      qa: 'pending',
      seo: 'pending',
      done: 'pending',
    },
    startedAt: Date.now(),
    error: null,
  }
}

function getStepIndex(key: StepKey) {
  return STEPS.findIndex(s => s.key === key)
}

function getEstimatedRemaining(currentStep: StepKey, startedAt: number): number {
  const elapsed = (Date.now() - startedAt) / 1000
  const currentIndex = getStepIndex(currentStep)
  const remaining = STEPS.slice(currentIndex).reduce((acc, s) => acc + s.estimatedSeconds, 0)
  return Math.max(0, Math.round(remaining - elapsed * 0.3))
}

export function GenerationStatusClient({ articleId, objective }: Props) {
  const router = useRouter()
  const [state, setState] = useState<GenerationState>(buildInitialState)

  // Poll the article status
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/articles/${articleId}/status`)
      if (!res.ok) return

      const data = await res.json() as {
        step: StepKey
        status: 'generating' | 'done' | 'error'
        error?: string
      }

      setState(prev => {
        const idx = getStepIndex(data.step)
        const newStatuses = { ...prev.stepStatuses }

        // Mark previous steps complete
        STEPS.forEach((s, i) => {
          if (i < idx) newStatuses[s.key] = 'complete'
          else if (i === idx) newStatuses[s.key] = data.status === 'error' ? 'error' : 'active'
          else newStatuses[s.key] = 'pending'
        })

        if (data.status === 'done') {
          newStatuses['done'] = 'complete'
          STEPS.forEach(s => { if (s.key !== 'done') newStatuses[s.key] = 'complete' })
        }

        return {
          ...prev,
          currentStep: data.step,
          stepStatuses: newStatuses,
          error: data.error ?? null,
        }
      })

      if (data.status === 'done') {
        router.push(`/articles/${articleId}/edit`)
      }
    } catch {
      // silently retry
    }
  }, [articleId, router])

  // Subscribe to the generation's progress. The first poll is deferred to a
  // task so the effect body itself performs no synchronous state update.
  useEffect(() => {
    const kickoff = setTimeout(pollStatus, 0)
    const interval = setInterval(pollStatus, POLL_INTERVAL_MS)
    return () => {
      clearTimeout(kickoff)
      clearInterval(interval)
    }
  }, [pollStatus])

  const currentStepDef = STEPS.find(s => s.key === state.currentStep)!
  const estimatedRemaining = getEstimatedRemaining(state.currentStep, state.startedAt)
  const currentIndex = getStepIndex(state.currentStep)
  const totalSteps = STEPS.length - 1 // exclude 'done' from progress calc
  const progressPct = Math.round((currentIndex / totalSteps) * 100)

  return (
    <div className="space-y-8">
      {/* Header. Once a run has failed nothing is still generating, so the
          heading and the progress bar say so rather than contradicting the
          error message below them. */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
          {state.error ? (
            <svg className="h-7 w-7 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          ) : (
            <svg className="h-7 w-7 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          )}
        </div>
        <h1 className="text-heading-m font-fragment text-text">
          {state.error ? 'Generation stopped' : 'Generating article'}
        </h1>
        {objective && (
          <p className="mt-1 text-small text-text-muted line-clamp-2 max-w-sm mx-auto">
            {objective}
          </p>
        )}
      </div>

      {/* Overall progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-caption text-text-muted">
          <span>
            {state.error
              ? `Stopped at ${currentStepDef.label.toLowerCase()}`
              : currentStepDef.description}
          </span>
          {estimatedRemaining > 0 && !state.error && (
            <span>~{estimatedRemaining}s remaining</span>
          )}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
          <div
            className={[
              'h-full rounded-full transition-all duration-1000',
              state.error ? 'bg-text-muted' : 'bg-accent',
            ].join(' ')}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Steps list */}
      <div className="rounded-xl border border-border bg-surface p-1">
        {STEPS.filter(s => s.key !== 'done').map((step, index) => {
          const status = state.stepStatuses[step.key]
          return (
            <div
              key={step.key}
              className={[
                'flex items-start gap-3 rounded-lg px-4 py-3 transition-colors',
                status === 'active' ? 'bg-surface-raised' : '',
              ].join(' ')}
            >
              {/* Step indicator */}
              <div className="mt-0.5 shrink-0">
                {status === 'complete' && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22c55e]">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="white" strokeWidth="1.5">
                      <path d="M1 4l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
                {status === 'active' && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-accent bg-accent/10">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                  </span>
                )}
                {status === 'error' && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--status-review-text)]">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5">
                      <path d="M1 1l6 6M7 1l-6 6" strokeLinecap="round" />
                    </svg>
                  </span>
                )}
                {status === 'pending' && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-border bg-transparent">
                    <span className="text-caption font-medium text-text-muted">{index + 1}</span>
                  </span>
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0">
                <p className={[
                  'text-small font-medium',
                  status === 'active' ? 'text-text' : status === 'complete' ? 'text-text' : 'text-text-muted',
                ].join(' ')}>
                  {step.label}
                </p>
                {status === 'active' && (
                  <p className="text-caption text-text-muted mt-0.5">{step.description}</p>
                )}
              </div>

              {/* Time estimate */}
              {status === 'pending' && (
                <span className="shrink-0 text-caption text-text-muted">
                  ~{step.estimatedSeconds}s
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Error state */}
      {state.error && (
        <div className="rounded-lg border border-[var(--status-review-text)]/30 bg-[var(--status-review-bg)] px-4 py-3">
          <p className="text-small font-medium text-[var(--status-review-text)]">Generation failed</p>
          <p className="mt-0.5 text-caption text-text-muted">{state.error}</p>
          <button
            onClick={() => window.location.href = '/articles/new'}
            className="mt-2 text-caption text-accent-text hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Footer note */}
      {!state.error && (
        <p className="text-center text-caption text-text-muted">
          You can close this window — the draft keeps generating in the background.
        </p>
      )}
    </div>
  )
}
