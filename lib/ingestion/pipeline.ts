import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { EMBEDDINGS_UNAVAILABLE_MESSAGE, isEmbeddingConfigured } from '@/lib/ai/providers'
import { parseDocument } from './parse'
import { chunkText } from './chunk'
import { embedAndStore } from './embed'

export async function runIngestionPipeline(
  brandId: string,
  documentId: string
): Promise<void> {
  const admin = getSupabaseAdminClient()

  // Nothing here works without embeddings, and a half-ingested document is
  // worse than an untouched one — bail before mutating any state.
  if (!isEmbeddingConfigured()) {
    await admin.from('brand_documents')
      .update({ ingestion_status: 'error' })
      .eq('id', documentId)
    throw new Error(EMBEDDINGS_UNAVAILABLE_MESSAGE)
  }

  await admin.from('brand_documents')
    .update({ ingestion_status: 'processing' })
    .eq('id', documentId)

  try {
    const { data: doc } = await admin.from('brand_documents')
      .select('storage_path, file_type, name').eq('id', documentId).single()
    if (!doc) throw new Error('Document not found')

    const { data: fileData } = await admin.storage
      .from('brand-documents').download(doc.storage_path)
    if (!fileData) throw new Error('Could not download file')

    const buffer = Buffer.from(await fileData.arrayBuffer())
    const text = await parseDocument(buffer, doc.file_type)
    const chunks = chunkText(text)

    // Delete existing chunks for this document
    await admin.from('document_chunks').delete().eq('document_id', documentId)

    await embedAndStore(brandId, documentId, chunks, 'doc')

    await admin.from('brand_documents')
      .update({ ingestion_status: 'done' }).eq('id', documentId)
  } catch (error) {
    await admin.from('brand_documents')
      .update({ ingestion_status: 'error' }).eq('id', documentId)
    throw error
  }
}
