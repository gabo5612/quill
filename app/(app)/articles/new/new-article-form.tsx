'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createNewArticle } from './actions'

interface Brand {
  id: string
  name: string
  slug: string
  logo_url: string | null
}

interface AIModel {
  id: string
  provider: 'openai' | 'anthropic'
  model_id: string
  label: string
  capabilities: string[]
  is_flagship: boolean
}

interface Props {
  brands: Brand[]
  models: AIModel[]
}

// Mirrors the CHECK constraint on app.articles.target_words.
const MIN_WORDS = 300
const MAX_WORDS = 4000

const LENGTH_PRESETS: { label: string; words: number | null }[] = [
  { label: 'Short',    words: 600 },
  { label: 'Standard', words: 1200 },
  { label: 'Long',     words: 2000 },
  { label: 'In depth', words: 3000 },
  { label: 'Let the model decide', words: null },
]

const MODEL_ICONS: Record<string, string> = {
  anthropic: 'A',
  openai: 'O',
}

const MODEL_COLORS: Record<string, string> = {
  anthropic: 'bg-[#D4704A]/10 text-[#D4704A] border-[#D4704A]/20',
  openai: 'bg-[#10A37F]/10 text-[#10A37F] border-[#10A37F]/20',
}

export function NewArticleForm({ brands, models }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [brandId, setBrandId] = useState(brands[0]?.id ?? '')
  const [objective, setObjective] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [keywordInput, setKeywordInput] = useState('')
  const [targetWords, setTargetWords] = useState<number | null>(1200)
  const [selectedModelId, setSelectedModelId] = useState(
    models.find(m => m.is_flagship)?.id ?? models[0]?.id ?? ''
  )
  const [error, setError] = useState<string | null>(null)

  function addKeyword(value: string) {
    const trimmed = value.trim().toLowerCase()
    if (trimmed && !keywords.includes(trimmed) && keywords.length < 20) {
      setKeywords(prev => [...prev, trimmed])
    }
    setKeywordInput('')
  }

  function removeKeyword(kw: string) {
    setKeywords(prev => prev.filter(k => k !== kw))
  }

  function handleKeywordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addKeyword(keywordInput)
    } else if (e.key === 'Backspace' && !keywordInput && keywords.length > 0) {
      setKeywords(prev => prev.slice(0, -1))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!brandId) { setError('Select a brand'); return }
    if (!objective.trim()) { setError('Objective is required'); return }
    if (!selectedModelId) { setError('Select a model'); return }

    const selectedModel = models.find(m => m.id === selectedModelId)
    if (!selectedModel) { setError('Invalid model'); return }

    startTransition(async () => {
      const result = await createNewArticle({
        brandId,
        objective: objective.trim(),
        targetWords: targetWords ?? undefined,
        keywords,
        modelProvider: selectedModel.provider,
        modelId: selectedModel.model_id,
      })

      if (result.error) {
        setError(result.error)
      } else if (result.articleId) {
        router.push(`/articles/${result.articleId}/generation`)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Brand selector */}
      {brands.length > 1 && (
        <div className="space-y-2">
          <label className="block text-small font-medium text-text">
            Brand
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {brands.map(brand => (
              <button
                key={brand.id}
                type="button"
                onClick={() => setBrandId(brand.id)}
                className={[
                  'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-small transition-all',
                  brandId === brand.id
                    ? 'border-accent bg-accent/5 text-text ring-1 ring-accent'
                    : 'border-border bg-surface text-text-muted hover:border-neutrals-400 hover:text-text',
                ].join(' ')}
              >
                {brand.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brand.logo_url}
                    alt={brand.name}
                    className="h-5 w-5 rounded-xs object-contain"
                  />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-xs bg-surface-raised text-caption font-medium text-text-muted">
                    {brand.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate font-medium">{brand.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Objective */}
      <div className="space-y-2">
        <label htmlFor="objective" className="block text-small font-medium text-text">
          Article objective
        </label>
        <p className="text-caption text-text-muted">
          What do you want to achieve with this article? Be specific.
        </p>
        <textarea
          id="objective"
          value={objective}
          onChange={e => setObjective(e.target.value)}
          placeholder="E.g.: Explain the benefits of vitamin D for healthcare professionals, highlighting the latest clinical research and recommended doses."
          rows={4}
          maxLength={500}
          className={[
            'w-full rounded-lg border bg-input-bg px-4 py-3 text-small text-input-text',
            'placeholder:text-input-placeholder resize-none',
            'transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:border-input-border-focus',
            'border-input-border',
          ].join(' ')}
          required
        />
        <p className="text-right text-caption text-text-muted">
          {objective.length}/500
        </p>
      </div>

      {/* Length */}
      <div className="space-y-2">
        <label className="block text-small font-medium text-text">
          Article length
        </label>
        <p className="text-caption text-text-muted">
          The outline splits this across sections, so the draft lands close to
          the target instead of wherever the model happens to stop.
        </p>
        <div className="flex flex-wrap gap-2">
          {LENGTH_PRESETS.map(preset => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setTargetWords(preset.words)}
              aria-pressed={targetWords === preset.words}
              className={[
                'rounded-lg border px-3 py-2 text-left text-small transition-all',
                targetWords === preset.words
                  ? 'border-accent bg-accent/5 text-text ring-1 ring-accent'
                  : 'border-border bg-surface text-text-muted hover:border-neutrals-400 hover:text-text',
              ].join(' ')}
            >
              <span className="font-medium">{preset.label}</span>
              <span className="ml-1.5 text-caption text-text-muted">
                {preset.words ? `~${preset.words}` : 'auto'}
              </span>
            </button>
          ))}
        </div>
        {targetWords !== null && (
          <div className="flex items-center gap-3 pt-1">
            <input
              type="range"
              min={MIN_WORDS}
              max={MAX_WORDS}
              step={100}
              value={targetWords}
              onChange={e => setTargetWords(Number(e.target.value))}
              aria-label="Target word count"
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-raised accent-[var(--accent)]"
            />
            <span className="w-24 shrink-0 text-right text-small tabular-nums text-text">
              {targetWords.toLocaleString('en-US')} words
            </span>
          </div>
        )}
      </div>

      {/* Keywords */}
      <div className="space-y-2">
        <label className="block text-small font-medium text-text">
          Keywords
          <span className="ml-1 text-caption text-text-muted">(optional)</span>
        </label>
        <p className="text-caption text-text-muted">
          Press Enter or comma to add. Max 20 keywords.
        </p>
        <div
          className={[
            'flex flex-wrap gap-1.5 rounded-lg border bg-input-bg px-3 py-2.5',
            'min-h-[3rem] cursor-text transition-colors',
            'border-input-border focus-within:border-input-border-focus focus-within:ring-2 focus-within:ring-ring',
          ].join(' ')}
          onClick={() => document.getElementById('keyword-input')?.focus()}
        >
          {keywords.map(kw => (
            <span
              key={kw}
              className="flex items-center gap-1 rounded-full bg-[var(--chip-accent-bg)] px-2.5 py-0.5 text-caption font-medium text-[var(--chip-accent-text)]"
            >
              {kw}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removeKeyword(kw) }}
                className="ml-0.5 rounded-full p-0.5 hover:bg-accent/20 transition-colors"
                aria-label={`Remove ${kw}`}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 1l8 8M9 1l-8 8" />
                </svg>
              </button>
            </span>
          ))}
          <input
            id="keyword-input"
            type="text"
            value={keywordInput}
            onChange={e => setKeywordInput(e.target.value)}
            onKeyDown={handleKeywordKeyDown}
            onBlur={() => { if (keywordInput.trim()) addKeyword(keywordInput) }}
            placeholder={keywords.length === 0 ? 'vitamina-d, salud, suplementos…' : ''}
            className="flex-1 min-w-[140px] bg-transparent text-small text-input-text placeholder:text-input-placeholder focus:outline-none"
          />
        </div>
        {keywords.length > 0 && (
          <p className="text-caption text-text-muted">{keywords.length}/20 keywords</p>
        )}
      </div>

      {/* Model selector */}
      <div className="space-y-3">
        <label className="block text-small font-medium text-text">
          AI model
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {models.map(model => (
            <button
              key={model.id}
              type="button"
              onClick={() => setSelectedModelId(model.id)}
              className={[
                'group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                selectedModelId === model.id
                  ? 'border-accent bg-accent/5 ring-1 ring-accent'
                  : 'border-border bg-surface hover:border-neutrals-400',
              ].join(' ')}
            >
              {/* Provider icon */}
              <span
                className={[
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-caption font-bold',
                  MODEL_COLORS[model.provider],
                ].join(' ')}
              >
                {MODEL_ICONS[model.provider]}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-small font-medium text-text">
                    {model.label}
                  </span>
                  {model.is_flagship && (
                    <span className="shrink-0 rounded-full bg-[var(--chip-highlight-bg)] px-1.5 py-0.5 text-caption font-medium text-[var(--chip-highlight-text)]">
                      Flagship
                    </span>
                  )}
                </div>
                <span className="text-caption text-text-muted capitalize">
                  {model.provider}
                </span>
                {model.capabilities.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {model.capabilities.slice(0, 3).map(cap => (
                      <span
                        key={cap}
                        className="rounded-sm bg-surface-raised px-1.5 py-px text-caption text-text-muted"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected indicator */}
              {selectedModelId === model.id && (
                <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-accent">
                  <svg width="8" height="6" viewBox="0 0 8 6" fill="none" stroke="white" strokeWidth="1.5">
                    <path d="M1 3l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--status-review-text)]/30 bg-[var(--status-review-bg)] px-4 py-3"
        >
          <p className="text-small text-[var(--status-review-text)]">{error}</p>
        </div>
      )}

      {/* Submit */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className={[
            'w-full rounded-xl bg-btn-primary-bg px-6 py-3.5 text-body font-medium text-btn-primary-text',
            'transition-all hover:bg-btn-primary-hover-bg active:scale-[0.99]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            'disabled:cursor-not-allowed disabled:opacity-60',
          ].join(' ')}
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Starting generation…
            </span>
          ) : (
            'Generate article'
          )}
        </button>
      </div>
    </form>
  )
}
