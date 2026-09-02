import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/auth/permissions'
import type { BrandRole, GlobalRole } from '@/lib/auth/permissions'
import { ArticleEditor } from './article-editor'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditArticlePage({ params }: Props) {
  const { id } = await params

  const supabase = await getSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS already scopes `articles` to brands the caller can read, so a missing
  // row means "not found or not yours" — both resolve to the same redirect.
  const [{ data: article }, { data: body }, { data: steps }] = await Promise.all([
    supabase
      .from('articles')
      .select('id, status, objective, keywords, model_id, model_provider, brand_id, author_id')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('article_body')
      .select('body_prosemirror, title_tag, meta_description, slug')
      .eq('article_id', id)
      .maybeSingle(),
    supabase
      .from('generations')
      .select('id')
      .eq('article_id', id)
      .limit(1),
  ])

  if (!article) redirect('/articles')

  const [{ data: profile }, { data: member }] = await Promise.all([
    supabase.from('profiles').select('global_role').eq('id', user.id).single(),
    supabase
      .from('brand_members')
      .select('brand_role')
      .eq('brand_id', article.brand_id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const canEdit = hasPermission(
    (profile as { global_role: GlobalRole } | null)?.global_role ?? 'viewer',
    'content.edit',
    (member as { brand_role: BrandRole } | null)?.brand_role,
  )

  // A draft with no pipeline steps recorded never actually generated. Without
  // this the editor just opens blank and looks like the model produced nothing,
  // which is indistinguishable from a real empty draft.
  const nodeCount = Array.isArray(
    (body?.body_prosemirror as { content?: unknown[] } | null)?.content,
  )
    ? ((body!.body_prosemirror as { content: unknown[] }).content.length)
    : 0

  const generationNeverRan =
    article.status === 'draft' && (steps ?? []).length === 0 && nodeCount <= 1

  return (
    <ArticleEditor
      article={article}
      initialBody={body ?? null}
      canEdit={canEdit}
      generationNeverRan={generationNeverRan}
    />
  )
}
