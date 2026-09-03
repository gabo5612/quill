/**
 * Environment contract for the app.
 *
 * Deliberately not validated at import time: a missing key should fail the one
 * feature that needs it with a clear message, not take the whole deployment
 * down at boot. Use `getEnvReport()` (surfaced at /api/health) to see what is
 * configured.
 */

export type EnvSeverity =
  /** Nothing works without it. */
  | 'required'
  /** The app runs; one feature is switched off. */
  | 'degrades'
  /** Nice to have. */
  | 'optional'

export interface EnvRequirement {
  name: string
  severity: EnvSeverity
  /** What stops working when this is missing. */
  requiredFor: string
}

export const ENV_CONTRACT: EnvRequirement[] = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    severity: 'required',
    requiredFor: 'Everything — database and auth',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    severity: 'required',
    requiredFor: 'Everything — database and auth',
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    severity: 'required',
    requiredFor: 'Background jobs, audit log, admin role changes',
  },
  {
    name: 'ANTHROPIC_API_KEY',
    severity: 'degrades',
    requiredFor: 'Claude models and brand profile inference',
  },
  {
    name: 'INNGEST_EVENT_KEY',
    severity: 'required',
    requiredFor: 'Enqueuing generation and ingestion jobs',
  },
  {
    name: 'INNGEST_SIGNING_KEY',
    severity: 'required',
    requiredFor: 'Inngest calling back into /api/inngest',
  },
  {
    // Embeddings are OpenAI-only, so this gates document search — but Claude
    // can still draft from the brand profile without it.
    name: 'OPENAI_API_KEY',
    severity: 'degrades',
    requiredFor: 'Document search (RAG), document ingestion, and the GPT model options',
  },
  {
    name: 'NEXT_PUBLIC_APP_URL',
    severity: 'optional',
    requiredFor: 'Forcing a specific origin; otherwise derived from request headers',
  },
]

function isSet(name: string): boolean {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0
}

export interface EnvReport {
  /** True when nothing `required` is missing. Degraded features do not fail this. */
  ok: boolean
  missingRequired: EnvRequirement[]
  degraded: EnvRequirement[]
  missingOptional: EnvRequirement[]
  /** True when neither AI provider is configured — nothing can generate. */
  noAiProvider: boolean
}

export function getEnvReport(): EnvReport {
  const missing = ENV_CONTRACT.filter(v => !isSet(v.name))
  const noAiProvider = !isSet('ANTHROPIC_API_KEY') && !isSet('OPENAI_API_KEY')
  return {
    ok: !missing.some(v => v.severity === 'required') && !noAiProvider,
    missingRequired: missing.filter(v => v.severity === 'required'),
    degraded: missing.filter(v => v.severity === 'degrades'),
    missingOptional: missing.filter(v => v.severity === 'optional'),
    noAiProvider,
  }
}

/** Throws with an actionable message when a server-only key is missing. */
export function requireServerEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    const requirement = ENV_CONTRACT.find(v => v.name === name)
    throw new Error(
      `Missing environment variable ${name}.` +
        (requirement ? ` Required for: ${requirement.requiredFor}.` : ''),
    )
  }
  return value
}
