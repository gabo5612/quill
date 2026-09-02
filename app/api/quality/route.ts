import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { scoreArticle } from '@/lib/content/quality'
import type { PMDocument } from '@/lib/content/article-schema'

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let payload: { document?: unknown; keywords?: unknown; meta?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const doc = payload.document as PMDocument | undefined
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content)) {
    return NextResponse.json({ error: 'Invalid document' }, { status: 400 })
  }

  const keywords = Array.isArray(payload.keywords)
    ? (payload.keywords as unknown[]).filter((k): k is string => typeof k === 'string')
    : []

  const meta = (payload.meta ?? {}) as { slug?: string; metaDescription?: string }

  return NextResponse.json(scoreArticle(doc, keywords, meta))
}
