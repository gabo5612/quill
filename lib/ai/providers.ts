import type { ModelProvider } from './registry'

/**
 * Which AI providers are usable in this deployment.
 *
 * The two providers are not interchangeable:
 *
 * - **Anthropic** can draft, proofread, and write SEO metadata, but offers no
 *   embeddings model.
 * - **OpenAI** is the only source of embeddings, so document search (RAG) and
 *   document ingestion require it even when every article is written by Claude.
 *
 * Running without an OpenAI key is therefore a supported, degraded mode:
 * generation still works from the brand profile, but uploaded documents cannot
 * be indexed or retrieved.
 */

function hasKey(name: string): boolean {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0
}

export function isProviderConfigured(provider: ModelProvider): boolean {
  switch (provider) {
    case 'anthropic': return hasKey('ANTHROPIC_API_KEY')
    case 'openai': return hasKey('OPENAI_API_KEY')
    default: return false
  }
}

/** Embeddings — and therefore RAG and document ingestion — are OpenAI-only. */
export function isEmbeddingConfigured(): boolean {
  return isProviderConfigured('openai')
}

export function configuredProviders(): ModelProvider[] {
  return (['anthropic', 'openai'] as const).filter(isProviderConfigured)
}

export const EMBEDDINGS_UNAVAILABLE_MESSAGE =
  'Document search is unavailable: OPENAI_API_KEY is not configured. ' +
  'Embeddings are OpenAI-only, so uploaded documents cannot be indexed. ' +
  'Article generation still works from the brand profile.'
