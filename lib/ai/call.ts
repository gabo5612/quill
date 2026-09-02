import { generateText, Output, APICallError, NoObjectGeneratedError, NoOutputGeneratedError } from 'ai'
import { NonRetriableError } from 'inngest'
import { z } from 'zod'
import { getLanguageModel } from './registry'
import type { ModelProvider } from './registry'

interface CallOptions {
  provider: ModelProvider
  modelId: string
  system?: string
  prompt: string
  maxTokens?: number
}

export interface LLMUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

interface CallResult {
  text: string
  usage: LLMUsage
}

/**
 * What one attempt at a structured call actually did.
 *
 * These are recorded against the article so a failed generation can be
 * diagnosed after the fact from the trace screen, rather than from server
 * logs nobody can reach in production. A run that succeeded on the third try
 * is not the same as one that succeeded on the first, and the difference only
 * shows up here.
 */
export interface AttemptDiagnostic {
  attempt: number
  ok: boolean
  durationMs: number
  finishReason?: string
  errorType?: string
  error?: string
  /** Tail of the raw response — where malformed JSON is actually visible. */
  responseTail?: string
}

/** Thrown when every attempt failed. Carries the full attempt history. */
export class StructuredCallError extends Error {
  readonly diagnostics: AttemptDiagnostic[]
  constructor(message: string, diagnostics: AttemptDiagnostic[], options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'StructuredCallError'
    this.diagnostics = diagnostics
  }
}

function describeError(error: unknown): Pick<AttemptDiagnostic, 'errorType' | 'error' | 'responseTail'> {
  const type = error instanceof Error ? error.name : typeof error
  const message = error instanceof Error ? error.message : String(error)

  // NoObjectGeneratedError carries the text the model actually produced. That
  // string is the single most useful thing for diagnosing a schema failure —
  // it is where a JSON-encoded array or a stray `>` becomes visible.
  const raw = (error as { text?: unknown })?.text
  const cause = (error as { cause?: { message?: string } })?.cause?.message

  return {
    errorType: type,
    error: cause ? `${message} (${cause.slice(0, 300)})` : message,
    ...(typeof raw === 'string' && raw ? { responseTail: raw.slice(-400) } : {}),
  }
}

function toUsage(raw: { inputTokens?: number; outputTokens?: number } | undefined): LLMUsage {
  const inputTokens = raw?.inputTokens ?? 0
  const outputTokens = raw?.outputTokens ?? 0
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }
}

export async function callLLM(opts: CallOptions): Promise<CallResult> {
  const result = await generateText({
    model: getLanguageModel(opts.provider, opts.modelId),
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxTokens ?? 4096,
  })

  return { text: result.text, usage: toUsage(result.usage) }
}

/**
 * Forces Anthropic's native structured outputs.
 *
 * The provider's default `structuredOutputMode` is `auto`, and on these models
 * `auto` was picking a path that fails about half the time: the nested
 * `sections` array came back as a JSON *string* rather than an array, and that
 * string was sometimes malformed (a `>` where a `:` belongs), so validation
 * rejected it and generation died after exhausting its retries.
 *
 * Measured over 10 runs each of the outline schema against Claude Sonnet 5:
 *
 *   auto           5/10
 *   jsonTool       7/10
 *   outputFormat  10/10
 *
 * `outputFormat` is the `output_config.format` request parameter — the API's
 * own structured-output support, rather than a tool-call shim around it.
 */
const ANTHROPIC_NATIVE_STRUCTURED = {
  anthropic: { structuredOutputMode: 'outputFormat' },
} as const

/**
 * A retry budget for the residue.
 *
 * With native structured outputs the schemas here validate on the first
 * attempt essentially always, so this is a safety net rather than the
 * mechanism that makes generation work — which is what it used to be, back
 * when a quarter of all attempts came back unusable.
 *
 * Note that `maxRetries` on the SDK does NOT cover this — it retries transport
 * and API errors, not a response that parsed but failed validation.
 */
const MAX_SCHEMA_ATTEMPTS = 4

/**
 * True when another attempt could plausibly succeed.
 *
 * Only a malformed or non-conforming *response* is worth retrying. An API
 * error is not: an exhausted credit balance, a revoked key or a bad request
 * will fail identically four times and then be reported as
 * "Model failed to produce valid article_outline", which sends whoever reads
 * it looking at the schema instead of the billing page. Those are surfaced
 * immediately, with the API's own wording.
 *
 * Rate limits and server overload are the exception — those are transient, and
 * the SDK's own `maxRetries` has already backed off before we ever see them.
 */
function isWorthRetrying(error: unknown): boolean {
  if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)) return true

  if (APICallError.isInstance(error)) {
    return error.statusCode === 429 || (error.statusCode ?? 0) >= 500
  }

  // An unrecognised failure gets the benefit of the doubt.
  return true
}

/** Nudges the model away from the exact failure mode observed. */
const RETRY_HINT =
  '\n\nIMPORTANT: return the JSON object directly. Every array and nested ' +
  'object must be real JSON, never a string containing JSON.'

export async function callLLMStructured<T>(
  opts: CallOptions & { schema: z.ZodType<T>; schemaName?: string; schemaDescription?: string }
): Promise<{ object: T; usage: LLMUsage; attempts: number; diagnostics: AttemptDiagnostic[] }> {
  const model = getLanguageModel(opts.provider, opts.modelId)

  // Usage accumulates across attempts — a failed attempt still burns tokens,
  // and the cost ledger would understate the real spend if we dropped them.
  let inputTokens = 0
  let outputTokens = 0
  let lastError: unknown
  const diagnostics: AttemptDiagnostic[] = []

  for (let attempt = 1; attempt <= MAX_SCHEMA_ATTEMPTS; attempt++) {
    const startedAt = Date.now()
    try {
      const result = await generateText({
        model,
        system: opts.system,
        // Only add the hint after a failure; on the first attempt it is noise
        // that competes with the actual instructions.
        prompt: attempt === 1 ? opts.prompt : opts.prompt + RETRY_HINT,
        maxOutputTokens: opts.maxTokens ?? 4096,
        ...(opts.provider === 'anthropic'
          ? { providerOptions: ANTHROPIC_NATIVE_STRUCTURED }
          : {}),
        output: Output.object({
          schema: opts.schema,
          name: opts.schemaName,
          description: opts.schemaDescription,
        }),
      })

      const usage = toUsage(result.usage)
      inputTokens += usage.inputTokens
      outputTokens += usage.outputTokens

      if (result.output == null) {
        throw new Error(`no structured output (finish reason: ${result.finishReason})`)
      }

      diagnostics.push({
        attempt, ok: true,
        durationMs: Date.now() - startedAt,
        finishReason: result.finishReason,
      })

      return {
        object: result.output,
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        attempts: attempt,
        diagnostics,
      }
    } catch (error) {
      const described = describeError(error)
      diagnostics.push({ attempt, ok: false, durationMs: Date.now() - startedAt, ...described })

      // Rethrown as non-retriable so Inngest also stops immediately. Without
      // it the step's own retry policy keeps a doomed run alive for minutes
      // while the generation screen just spins.
      if (!isWorthRetrying(error)) {
        const fatal = new NonRetriableError(described.error ?? 'Provider error', { cause: error })
        ;(fatal as NonRetriableError & { diagnostics?: AttemptDiagnostic[] }).diagnostics = diagnostics
        throw fatal
      }

      lastError = error
      // A failed attempt's usage is not reported by the SDK, so it cannot be
      // added here; the accumulated figure is a floor, not an exact total.
      console.warn(
        `[ai] ${opts.schemaName ?? 'structured'} attempt ${attempt}/${MAX_SCHEMA_ATTEMPTS} failed: ` +
        described.error,
      )
    }
  }

  throw new StructuredCallError(
    `Model failed to produce valid ${opts.schemaName ?? 'structured output'} after ` +
    `${MAX_SCHEMA_ATTEMPTS} attempts. Last error: ` +
    (lastError instanceof Error ? lastError.message : String(lastError)),
    diagnostics,
    { cause: lastError },
  )
}
