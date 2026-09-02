import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { GenerationStatusClient } from './generation-status-client'

interface Props {
  params: Promise<{ id: string }>
}

export default async function GenerationPage({ params }: Props) {
  const { id } = await params

  const supabase = await getSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: article } = await supabase
    .from('articles')
    .select('id, status, objective, keywords, model_id, model_provider, brand_id')
    .eq('id', id)
    .maybeSingle()

  if (!article) redirect('/articles')

  // If already done, go straight to editor
  if (article.status !== 'draft') {
    redirect(`/articles/${id}/edit`)
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <div className="w-full max-w-lg">
        <GenerationStatusClient articleId={id} objective={article.objective ?? ''} />
      </div>
    </div>
  )
}
