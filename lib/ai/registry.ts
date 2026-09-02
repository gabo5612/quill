import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { isProviderConfigured } from './providers'

export type ModelProvider = 'anthropic' | 'openai'

export interface ModelDef {
  provider: ModelProvider
  modelId: string
  label: string
  capabilities: string[]
  isFlagship: boolean
}

/**
 * Server-side allowlist. app.ai_models is the source of truth the UI reads
 * from; this array mirrors it so background jobs can validate a model without
 * a round trip, and so a DB outage can't widen what we're willing to call.
 *
 * Keep the two in sync — supabase/migrations/0006 reseeds app.ai_models with
 * exactly these rows.
 */
export const DEFAULT_MODELS: ModelDef[] = [
  { provider: 'anthropic', modelId: 'claude-opus-5',              label: 'Claude Opus 5',   capabilities: ['text', 'vision'], isFlagship: true },
  { provider: 'anthropic', modelId: 'claude-sonnet-5',            label: 'Claude Sonnet 5', capabilities: ['text', 'vision'], isFlagship: false },
  { provider: 'anthropic', modelId: 'claude-haiku-4-5',           label: 'Claude Haiku 4.5', capabilities: ['text'],          isFlagship: false },
  { provider: 'openai',    modelId: 'gpt-4o',                     label: 'GPT-4o',          capabilities: ['text', 'vision'], isFlagship: false },
  { provider: 'openai',    modelId: 'gpt-4o-mini',                label: 'GPT-4o Mini',     capabilities: ['text'],           isFlagship: false },
]

/**
 * Image generation is OpenAI-only — Anthropic has no image model. Article
 * illustration is therefore switched off entirely when OPENAI_API_KEY is
 * absent, independently of which provider writes the text.
 */
export const IMAGE_MODEL_ID = 'gpt-image-1.5'

/** USD per generated image at IMAGE_SIZE. */
export const IMAGE_COST_USD = 0.04
export const IMAGE_SIZE = '1536x1024' as const

/**
 * Cheaper model used for the QA and SEO passes, where the drafting model's
 * capability isn't needed.
 */
export const BALANCED_MODEL: Record<ModelProvider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
}

/**
 * Models whose provider actually has an API key in this deployment. The UI and
 * the create-article action both use this, so a model that would fail at call
 * time is never offered in the first place.
 */
export function getAvailableModels(): ModelDef[] {
  return DEFAULT_MODELS.filter(m => isProviderConfigured(m.provider))
}

export function getLanguageModel(provider: ModelProvider, modelId: string) {
  if (!isModelAllowed(provider, modelId)) {
    throw new Error(`Model not allowed: ${provider}/${modelId}`)
  }
  if (!isProviderConfigured(provider)) {
    throw new Error(
      `Provider ${provider} is not configured — set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'}.`,
    )
  }
  switch (provider) {
    case 'anthropic': return anthropic(modelId)
    case 'openai': return openai(modelId)
    default: throw new Error(`Unknown provider: ${provider}`)
  }
}

export function getFlagshipModelId(provider: ModelProvider): string {
  const m = DEFAULT_MODELS.find(m => m.provider === provider && m.isFlagship)
    ?? DEFAULT_MODELS.find(m => m.provider === provider)
  if (!m) throw new Error(`No model registered for ${provider}`)
  return m.modelId
}

export function getBalancedModelId(provider: ModelProvider): string {
  return BALANCED_MODEL[provider]
}

/** True when the model exists in the allowlist *and* its provider has a key. */
export function isModelUsable(provider: string, modelId: string): boolean {
  return (
    isModelAllowed(provider, modelId) &&
    isProviderConfigured(provider as ModelProvider)
  )
}

export function isModelAllowed(provider: string, modelId: string): boolean {
  return DEFAULT_MODELS.some(m => m.provider === provider && m.modelId === modelId)
}
