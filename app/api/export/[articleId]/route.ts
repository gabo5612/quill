import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit/log'
import { exportToHtml } from '@/lib/export/html'
import { exportToMarkdown } from '@/lib/export/markdown'
import type { PMDocument } from '@/lib/content/article-schema'

/** Strips path separators so `slug` can never escape the filename. */
function safeFilename(value: string | null, fallback: string): string {
  const base = (value ?? '').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+|-+$/g, '')
  return base || fallback
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ articleId: string }> }
) {
  const { articleId } = await params
  const format = request.nextUrl.searchParams.get('format') ?? 'html'

  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS on article_body walks up to articles → can_read_brand, so an
  // unauthorized article simply returns no row.
  const { data: body } = await supabase
    .from('article_body')
    .select('body_prosemirror, title_tag, meta_description, slug, jsonld')
    .eq('article_id', articleId)
    .maybeSingle()

  if (!body) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: article } = await supabase
    .from('articles')
    .select('brand_id')
    .eq('id', articleId)
    .maybeSingle()

  const doc = body.body_prosemirror as unknown as PMDocument
  const filename = safeFilename(body.slug, articleId)

  const meta = {
    titleTag: body.title_tag ?? undefined,
    metaDescription: body.meta_description ?? undefined,
    slug: body.slug ?? undefined,
    jsonld: (body.jsonld as Record<string, unknown> | null) ?? undefined,
  }

  if (format !== 'html' && format !== 'markdown') {
    return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
  }

  await logAudit({
    actorId: user.id,
    action: 'article.exported',
    resourceType: 'article',
    resourceId: articleId,
    brandId: article?.brand_id ?? undefined,
    metadata: { format },
  })

  if (format === 'html') {
    return new NextResponse(exportToHtml(doc, meta), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.html"`,
      },
    })
  }

  return new NextResponse(exportToMarkdown(doc, meta), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.md"`,
    },
  })
}
