'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Sparkles, Save, CheckCircle2, Loader2, Globe } from 'lucide-react'
import type { Tables } from '@/lib/supabase/types'
import type { ImportResult } from '@/app/(app)/brands/[brandId]/context/import-actions'

/* ------------------------------------------------------------------ */
/* Schema                                                               */
/* ------------------------------------------------------------------ */

const schema = z.object({
  tone_of_voice: z.string().max(2000).optional(),
  audience: z.string().max(2000).optional(),
  key_messages: z.string().max(2000).optional(),
  dos: z.string().max(2000).optional(),
  donts: z.string().max(2000).optional(),
  banned_words: z.array(z.string().min(1).max(64)),
  language: z.array(z.enum(['ES', 'EN'])).min(1, 'Select at least one language'),
  copy_examples: z.string().max(4000).optional(),
  ctas: z.string().max(2000).optional(),
})

type FormValues = z.infer<typeof schema>

/* ------------------------------------------------------------------ */
/* Props                                                                */
/* ------------------------------------------------------------------ */

type Props = {
  profile: Tables<'brand_profiles'> | null | undefined
  saveAction: (formData: FormData) => Promise<void>
  /** Reads the brand's website and proposes a profile. Omit to hide the importer. */
  importAction?: (url: string) => Promise<ImportResult>
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function BrandProfileForm({ profile, saveAction, importAction }: Props) {
  const [isPending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<{
    pages: string[]
    confidence: string
    notes: string
  } | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tone_of_voice: profile?.tone_of_voice ?? '',
      audience: profile?.audience ?? '',
      key_messages: profile?.key_messages ?? '',
      dos: profile?.dos ?? '',
      donts: profile?.donts ?? '',
      banned_words: profile?.banned_words ?? [],
      language: (profile?.language as ('ES' | 'EN')[]) ?? ['ES'],
      copy_examples: profile?.copy_examples ?? '',
      ctas: profile?.ctas ?? '',
    },
  })

  const bannedWords = watch('banned_words')
  const languages = watch('language')

  // Submit handler — builds FormData for Server Action
  const onSubmit = (values: FormValues) => {
    const fd = new FormData()
    fd.append('tone_of_voice', values.tone_of_voice ?? '')
    fd.append('audience', values.audience ?? '')
    fd.append('key_messages', values.key_messages ?? '')
    fd.append('dos', values.dos ?? '')
    fd.append('donts', values.donts ?? '')
    fd.append('banned_words', JSON.stringify(values.banned_words))
    fd.append('language', JSON.stringify(values.language))
    fd.append('copy_examples', values.copy_examples ?? '')
    fd.append('ctas', values.ctas ?? '')

    startTransition(async () => {
      await saveAction(fd)
      setSavedAt(new Date())
    })
  }

  // Tag input handlers
  function addTag(word: string) {
    const trimmed = word.trim()
    if (!trimmed) return
    if (bannedWords.includes(trimmed)) return
    setValue('banned_words', [...bannedWords, trimmed], { shouldDirty: true })
    setTagInput('')
  }

  function removeTag(word: string) {
    setValue(
      'banned_words',
      bannedWords.filter((w) => w !== word),
      { shouldDirty: true }
    )
  }

  // Language toggle
  function toggleLanguage(lang: 'ES' | 'EN') {
    const current = languages
    if (current.includes(lang)) {
      if (current.length === 1) return // keep at least one
      setValue(
        'language',
        current.filter((l) => l !== lang),
        { shouldDirty: true }
      )
    } else {
      setValue('language', [...current, lang], { shouldDirty: true })
    }
  }

  /**
   * Reads the brand's site and fills the form with the proposal.
   *
   * Nothing is persisted here — the fields are marked dirty so the editor has
   * to review and press Save. Silently overwriting a curated brand voice with
   * a machine guess would be worse than an extra click.
   */
  async function handleImport() {
    if (!importAction || !siteUrl.trim()) return

    setIsImporting(true)
    setImportError(null)
    setImportSummary(null)

    try {
      const result = await importAction(siteUrl.trim())

      if (result.error || !result.profile) {
        setImportError(result.error ?? 'Could not read that site.')
        return
      }

      const p = result.profile
      const opts = { shouldDirty: true } as const
      setValue('tone_of_voice', p.toneOfVoice, opts)
      setValue('audience', p.audience, opts)
      setValue('key_messages', p.keyMessages, opts)
      setValue('dos', p.dos, opts)
      setValue('donts', p.donts, opts)
      setValue('copy_examples', p.copyExamples, opts)
      setValue('ctas', p.ctas, opts)
      setValue('banned_words', p.bannedWords, opts)
      setValue(
        'language',
        p.language.map((l) => l.toUpperCase() as 'ES' | 'EN'),
        opts,
      )

      setImportSummary({
        pages: result.pagesFetched ?? [],
        confidence: p.confidence,
        notes: p.notes,
      })
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Could not read that site.')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* Toolbar */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-heading-s font-fragment text-text">
            Brand context
          </h2>
          <p className="text-small text-text-muted mt-0.5">
            This information guides the model in every content generation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Auto-save indicator */}
          {isPending ? (
            <span className="flex items-center gap-1.5 text-caption text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </span>
          ) : savedAt && !isDirty ? (
            <span className="flex items-center gap-1.5 text-caption text-[var(--status-published-text)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved
            </span>
          ) : null}

          <button
            type="submit"
            disabled={isPending || !isDirty}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-small font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Save className="h-4 w-4" strokeWidth={2} />
            Save
          </button>
        </div>
      </div>

      {importAction && (
        <div className="mb-6 rounded-xl border border-card-border bg-card-bg p-5 shadow-card">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h3 className="text-small font-medium text-text">
              Import from the brand&apos;s website
            </h3>
          </div>
          <p className="mt-1 text-caption text-text-muted">
            Reads the homepage plus a few obvious pages (about, services,
            products) and drafts the fields below. Nothing is saved until you
            review it and press Save.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="url"
                inputMode="url"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleImport()
                  }
                }}
                placeholder="https://www.brand.com"
                disabled={isImporting}
                aria-label="Brand website URL"
                className="w-full rounded-lg border border-input-border bg-input-bg py-2.5 pl-9 pr-3 text-small text-input-text placeholder:text-input-placeholder transition-colors focus:border-input-border-focus focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={isImporting || !siteUrl.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-btn-primary-bg px-4 py-2.5 text-small font-medium text-btn-primary-text transition-colors hover:bg-btn-primary-hover-bg disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isImporting ? 'Reading the site…' : 'Read site'}
            </button>
          </div>

          {importError && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-[var(--status-review-text)]/30 bg-[var(--status-review-bg)] px-3 py-2 text-caption text-[var(--status-review-text)]"
            >
              {importError}
            </p>
          )}

          {importSummary && (
            <div className="mt-3 rounded-lg border border-border bg-surface px-3 py-2.5">
              <p className="text-caption text-text">
                Filled in from {importSummary.pages.length} page
                {importSummary.pages.length === 1 ? '' : 's'} ·{' '}
                <span
                  className={
                    importSummary.confidence === 'low'
                      ? 'text-[var(--status-review-text)]'
                      : 'text-text-muted'
                  }
                >
                  {importSummary.confidence} confidence
                </span>
              </p>
              {importSummary.notes && (
                <p className="mt-1 text-caption text-text-muted">
                  {importSummary.notes}
                </p>
              )}
              <p className="mt-1.5 text-caption text-text-muted">
                Review every field before saving — anything the site did not
                state clearly was left short on purpose.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-6">
        {/* Tone of Voice */}
        <FormSection
          label="Tone of voice"
          description="Describe how the brand sounds: formal, approachable, technical, inspiring…"
        >
          <Textarea
            {...register('tone_of_voice')}
            placeholder="E.g.: Approachable but professional. Direct, no fluff. Avoids corporate jargon."
            rows={4}
            error={errors.tone_of_voice?.message}
          />
        </FormSection>

        {/* Target audience */}
        <FormSection
          label="Target audience"
          description="Who does the brand speak to? Describe demographic profile, interests, pain points."
        >
          <Textarea
            {...register('audience')}
            placeholder="E.g.: Marketing directors at B2B companies in Latin America, ages 30–50."
            rows={4}
            error={errors.audience?.message}
          />
        </FormSection>

        {/* Key messages */}
        <FormSection
          label="Key messages"
          description="The core ideas the brand must always communicate."
        >
          <Textarea
            {...register('key_messages')}
            placeholder="E.g.: We are the fastest solution. Backed by real data. Built for agile teams."
            rows={4}
            error={errors.key_messages?.message}
          />
        </FormSection>

        {/* Do's & Don'ts */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormSection
            label="Do's"
            description="What content should always do."
          >
            <Textarea
              {...register('dos')}
              placeholder="E.g.: Use concrete examples. Lead with data. Address the reader informally."
              rows={5}
              error={errors.dos?.message}
            />
          </FormSection>
          <FormSection
            label="Don'ts"
            description="What content should never do."
          >
            <Textarea
              {...register('donts')}
              placeholder="E.g.: Don't use technical jargon without explanation. Don't promise exact results."
              rows={5}
              error={errors.donts?.message}
            />
          </FormSection>
        </div>

        {/* Banned words */}
        <FormSection
          label="Banned words"
          description="Words or phrases the model must never use."
        >
          <div className="rounded-lg border border-input-border bg-input-bg p-3 focus-within:border-input-border-focus transition-colors">
            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-2">
              {bannedWords.map((word) => (
                <span
                  key={word}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--tag-bg)] px-2.5 py-0.5 text-small font-medium text-[var(--tag-text)]"
                >
                  {word}
                  <button
                    type="button"
                    onClick={() => removeTag(word)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-[var(--accent)] hover:text-accent-fg transition-colors"
                    aria-label={`Remove "${word}"`}
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
            {/* Input */}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addTag(tagInput)
                }
                if (e.key === 'Backspace' && !tagInput && bannedWords.length > 0) {
                  removeTag(bannedWords[bannedWords.length - 1])
                }
              }}
              onBlur={() => addTag(tagInput)}
              placeholder={
                bannedWords.length === 0
                  ? 'Type a word and press Enter or comma'
                  : 'Add another…'
              }
              className="w-full bg-transparent text-small text-input-text placeholder:text-input-placeholder outline-none"
            />
          </div>
          {errors.banned_words && (
            <p className="mt-1 text-caption text-[var(--status-review-text)]">
              {errors.banned_words.message}
            </p>
          )}
        </FormSection>

        {/* Languages */}
        <FormSection
          label="Languages"
          description="Languages in which content is generated for this brand."
        >
          <div className="flex gap-3">
            {(['ES', 'EN'] as const).map((lang) => {
              const active = languages.includes(lang)
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLanguage(lang)}
                  className={[
                    'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-small font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'border-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-accent-text'
                      : 'border-border bg-surface text-text-muted hover:text-text hover:border-text-muted',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'h-3.5 w-3.5 rounded-full border-2 transition-colors',
                      active ? 'border-accent bg-accent' : 'border-border bg-transparent',
                    ].join(' ')}
                  />
                  {lang === 'ES' ? 'Spanish' : 'English'}
                </button>
              )
            })}
          </div>
          {errors.language && (
            <p className="mt-1 text-caption text-[var(--status-review-text)]">
              {errors.language.message}
            </p>
          )}
        </FormSection>

        {/* Copy examples */}
        <FormSection
          label="Copy examples"
          description="Text snippets that illustrate the brand's style. The model will use them as reference."
        >
          <Textarea
            {...register('copy_examples')}
            placeholder="Paste examples of headlines, paragraphs, or posts that represent the brand's style well."
            rows={6}
            error={errors.copy_examples?.message}
          />
        </FormSection>

        {/* CTAs */}
        <FormSection
          label="Typical CTAs"
          description="Calls to action the brand uses regularly."
        >
          <Textarea
            {...register('ctas')}
            placeholder="E.g.: Request a demo. Download the free guide. Get started today."
            rows={3}
            error={errors.ctas?.message}
          />
        </FormSection>
      </div>

      {/* Bottom save */}
      <div className="mt-8 flex justify-end border-t border-border pt-6">
        <button
          type="submit"
          disabled={isPending || !isDirty}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-small font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" strokeWidth={2} />
          )}
          Save changes
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Helper sub-components                                                */
/* ------------------------------------------------------------------ */

function FormSection({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-5 shadow-card">
      <label className="block text-small font-medium text-text mb-0.5">
        {label}
      </label>
      {description && (
        <p className="text-caption text-text-muted mb-3">{description}</p>
      )}
      {children}
    </div>
  )
}

import React from 'react'

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }
>(({ error, className, ...props }, ref) => (
  <div>
    <textarea
      ref={ref}
      className={[
        'w-full resize-y rounded-lg border bg-input-bg px-3 py-2.5 text-small text-input-text placeholder:text-input-placeholder transition-colors duration-150 focus:outline-none focus:border-input-border-focus',
        error ? 'border-[var(--status-review-text)]' : 'border-input-border',
        className ?? '',
      ].join(' ')}
      {...props}
    />
    {error && (
      <p className="mt-1 text-caption text-[var(--status-review-text)]">{error}</p>
    )}
  </div>
))
Textarea.displayName = 'Textarea'
