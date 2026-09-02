import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/auth/require-permission'
import { logAudit } from '@/lib/audit/log'

type GenerationStep = 'outline' | 'draft' | 'images' | 'qa' | 'seo' | 'done'

interface GenerationStatusResponse {
  step: GenerationStep
  status: 'generating' | 'done' | 'error'
  error?: string
}

interface Params {
  params: Promise<{ articleId: string }>
}

/**
 * GET /api/articles/[articleId]/status
 * Reports generation progress. The Inngest pipeline writes a row per step to
 * app.generations, and app.article_body once the draft is persisted.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { articleId } = await params
  const supabase = await getSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS restricts these tables to brands the caller can read.
  const { data: article } = await supabase
    .from('articles')
    .select('id, status, brand_id')
    .eq('id', articleId)
    .maybeSingle()

  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: body } = await supabase
    .from('article_body')
    .select('article_id')
    .eq('article_id', articleId)
    .maybeSingle()

  if (body) {
    const response: GenerationStatusResponse = { step: 'done', status: 'done' }
    return NextResponse.json(response)
  }

  const { data: latestGen } = await supabase
    .from('generations')
    .select('status, error, step')
    .eq('article_id', articleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const gen = latestGen as { status: string; error: string | null; step: string | null } | null

  const VALID_STEPS: GenerationStep[] = ['outline', 'draft', 'images', 'qa', 'seo', 'done']
  const step = VALID_STEPS.includes(gen?.step as GenerationStep)
    ? (gen!.step as GenerationStep)
    : 'outline'

  if (gen?.status === 'error') {
    const response: GenerationStatusResponse = {
      step,
      status: 'error',
      error: gen.error ?? 'Generation failed',
    }
    return NextResponse.json(response)
  }

  const response: GenerationStatusResponse = { step, status: 'generating' }
  return NextResponse.json(response)
}

/**
 * PATCH /api/articles/[articleId]/status — move an article through the
 * editorial workflow (draft → in_review → approved → exported).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { articleId } = await params
  const supabase = await getSupabaseServerClient()

  const { data: article } = await supabase
    .from('articles')
    .select('brand_id, status')
    .eq('id', articleId)
    .maybeSingle()

  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ctx = await checkPermission('content.edit', article.brand_id)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let status: unknown
  try {
    ;({ status } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const validStatuses = ['draft', 'in_review', 'approved', 'exported'] as const
  if (!validStatuses.includes(status as typeof validStatuses[number])) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { error } = await supabase
    .from('articles')
    .update({ status: status as typeof validStatuses[number] })
    .eq('id', articleId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit({
    actorId: ctx.userId,
    action: 'article.status_changed',
    resourceType: 'article',
    resourceId: articleId,
    brandId: article.brand_id,
    metadata: { from: article.status, to: status },
  })

  return NextResponse.json({ ok: true, status })
}
