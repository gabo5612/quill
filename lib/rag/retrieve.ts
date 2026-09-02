import { openai } from '@ai-sdk/openai'
import { embed } from 'ai'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * app.document_chunks.embedding is halfvec(1536) and app.match_brand_chunks
 * takes halfvec(1536), so embeddings must be 1536-dimensional.
 * text-embedding-3-large defaults to 3072 — requesting 1536 keeps the larger
 * model's quality at the dimension the schema expects.
 *
 * Ingestion and retrieval MUST use the same model and dimension, or cosine
 * distance is meaningless. Both import from here for that reason.
 */
export const EMBEDDING_MODEL = 'text-embedding-3-large'
export const EMBEDDING_DIMENSIONS = 1536

export const embeddingProviderOptions = {
  openai: { dimensions: EMBEDDING_DIMENSIONS },
} as const

export function embeddingModel() {
  return openai.embedding(EMBEDDING_MODEL)
}

export async function embedQuery(query: string): Promise<number[]> {
  const result = await embed({
    model: embeddingModel(),
    value: query,
    providerOptions: embeddingProviderOptions,
  })
  return result.embedding
}

export interface ChunkResult {
  id: string
  content: string
  source: 'doc' | 'profile'
  similarity: number
}

export async function retrieveChunks(
  brandId: string,
  query: string,
  topK = 8
): Promise<ChunkResult[]> {
  const embedding = await embedQuery(query)
  const admin = getSupabaseAdminClient()

  const { data, error } = await admin.rpc('match_brand_chunks', {
    p_brand_id: brandId,
    p_embedding: embedding,
    p_top_k: topK,
  })

  if (error) throw new Error(`RAG retrieval failed: ${error.message}`)
  return (data ?? []) as unknown as ChunkResult[]
}
