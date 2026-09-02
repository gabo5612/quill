import { embedMany } from 'ai'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { embeddingModel, embeddingProviderOptions } from '@/lib/rag/retrieve'
import type { TextChunk } from './chunk'

export async function embedAndStore(
  brandId: string,
  documentId: string,
  chunks: TextChunk[],
  source: 'doc' | 'profile' = 'doc'
): Promise<void> {
  if (chunks.length === 0) return

  const admin = getSupabaseAdminClient()

  // Embed in batches of 100 — the OpenAI embeddings endpoint caps inputs per
  // request, and this keeps a single failure from losing the whole document.
  const batchSize = 100
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const { embeddings } = await embedMany({
      model: embeddingModel(),
      values: batch.map(c => c.content),
      providerOptions: embeddingProviderOptions,
    })

    const rows = batch.map((chunk, j) => ({
      brand_id: brandId,
      document_id: documentId,
      content: chunk.content,
      // pgvector accepts the JSON array form over PostgREST.
      embedding: embeddings[j] as unknown as string,
      source,
      metadata: { chunkIndex: chunk.chunkIndex },
    }))

    const { error } = await admin.from('document_chunks').insert(rows)
    if (error) throw new Error(`Failed to store chunks: ${error.message}`)
  }
}
