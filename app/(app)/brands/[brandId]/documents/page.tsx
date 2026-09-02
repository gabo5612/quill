import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { isEmbeddingConfigured } from '@/lib/ai/providers'
import { logAudit } from '@/lib/audit/log'
import { inngest } from '@/lib/inngest/client'
import { EVENTS } from '@/lib/inngest/events'
import { DocumentUpload } from '@/components/brand/document-upload'
import { DocumentList } from '@/components/brand/document-list'

async function getBrandWithDocuments(brandId: string) {
  const supabase = await getSupabaseServerClient()

  const [{ data: brand }, { data: documents }] = await Promise.all([
    supabase.from('brands').select('id, name, slug').eq('id', brandId).maybeSingle(),
    supabase.from('brand_documents').select('*').eq('brand_id', brandId).order('created_at', { ascending: false }),
  ])

  return { brand, documents: documents ?? [] }
}

// Server Action: upload document
/** Extension → canonical MIME type. The ingestion parser dispatches on this. */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown',
  txt: 'text/plain',
}

async function uploadDocument(brandId: string, formData: FormData) {
  'use server'

  const ctx = await requirePermission('brand.read', brandId)

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) {
    throw new Error('No file received')
  }

  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const mimeType = MIME_BY_EXTENSION[ext]
  if (!mimeType) {
    throw new Error('File type not allowed. Use PDF, DOCX, MD, or TXT.')
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('File exceeds the 20 MB limit.')
  }

  const supabase = await getSupabaseServerClient()

  // Sanitize the object key: storage paths reject most punctuation and the
  // original name is attacker-controlled.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120)
  const storagePath = `brands/${brandId}/docs/${Date.now()}-${safeName}`

  const bytes = await file.arrayBuffer()
  const { error: storageError } = await supabase.storage
    .from('brand-documents')
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false })

  if (storageError) {
    throw new Error(`Error uploading the file: ${storageError.message}`)
  }

  // file_type stores the MIME type, not "PDF" — lib/ingestion/parse.ts
  // dispatches on it and an uppercase extension matched no branch, so every
  // ingestion failed with "Unsupported file type".
  const { data: doc, error: dbError } = await supabase
    .from('brand_documents')
    .insert({
      brand_id: brandId,
      name: file.name,
      storage_path: storagePath,
      file_type: mimeType,
      ingestion_status: 'pending',
    })
    .select('id')
    .single()

  if (dbError || !doc) {
    // Don't leave an orphaned object behind if the row insert failed.
    await supabase.storage.from('brand-documents').remove([storagePath])
    throw new Error(`Error registering the document: ${dbError?.message}`)
  }

  await logAudit({
    actorId: ctx.userId,
    action: 'document.uploaded',
    resourceType: 'brand_document',
    resourceId: doc.id,
    brandId,
    metadata: { name: file.name, size: file.size },
  })

  await inngest.send({
    name: EVENTS.INGEST_BRAND_DOCS,
    data: { brandId, documentIds: [doc.id], triggeredBy: ctx.userId },
  })

  revalidatePath(`/brands/${brandId}/documents`)
}

// Server Action: delete document
async function deleteDocument(brandId: string, documentId: string) {
  'use server'

  const ctx = await requirePermission('brand.read', brandId)
  const supabase = await getSupabaseServerClient()

  const { data: doc } = await supabase
    .from('brand_documents')
    .select('storage_path')
    .eq('id', documentId)
    .eq('brand_id', brandId)
    .maybeSingle()

  if (doc?.storage_path) {
    await supabase.storage.from('brand-documents').remove([doc.storage_path])
  }

  await supabase
    .from('brand_documents')
    .delete()
    .eq('id', documentId)
    .eq('brand_id', brandId)

  await logAudit({
    actorId: ctx.userId,
    action: 'document.deleted',
    resourceType: 'brand_document',
    resourceId: documentId,
    brandId,
  })

  revalidatePath(`/brands/${brandId}/documents`)
}

type Props = {
  params: Promise<{ brandId: string }>
}

export default async function BrandDocumentsPage({ params }: Props) {
  const { brandId } = await params
  await requirePermission('brand.read', brandId)
  const { brand, documents } = await getBrandWithDocuments(brandId)

  if (!brand) notFound()

  const uploadAction = uploadDocument.bind(null, brandId)
  const deleteAction = deleteDocument.bind(null, brandId)

  return (
    <div className="-mx-4 -my-6 lg:-mx-8 lg:-my-8">
      {/* Studio header */}
      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 pt-6">
          <p className="text-caption text-text-muted">Brand Studio</p>
          <h1 className="mt-0.5 text-heading-l font-fragment text-text">
            {brand.name}
          </h1>

          {/* Tabs */}
          <div className="mt-4 flex gap-1">
            <TabLink href={`/brands/${brandId}/context`}>Context</TabLink>
            <TabLink href={`/brands/${brandId}/documents`} active>
              Documents
            </TabLink>
            <TabLink href={`/brands/${brandId}/profile`}>Profile</TabLink>
            <TabLink href={`/brands/${brandId}/settings`}>Settings</TabLink>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        {/* Upload area */}
        <DocumentUpload uploadAction={uploadAction} indexingEnabled={isEmbeddingConfigured()} />

        {/* Documents list */}
        {documents.length > 0 && (
          <DocumentList
            documents={documents}
            deleteAction={deleteAction}
            brandId={brandId}
          />
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tab nav link                                                         */
/* ------------------------------------------------------------------ */

function TabLink({
  href,
  active,
  children,
}: {
  href: string
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={[
        'relative px-4 py-2 text-small font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-md',
        active
          ? 'text-text border-b-2 border-accent -mb-px bg-transparent'
          : 'text-text-muted hover:text-text',
      ].join(' ')}
    >
      {children}
    </Link>
  )
}
