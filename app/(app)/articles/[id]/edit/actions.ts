'use server'

import { revalidatePath } from 'next/cache'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/auth/require-permission'
import { logAudit } from '@/lib/audit/log'
import { prosemirrorToHtml } from '@/lib/content/html-serializer'
import { prosemirrorToMarkdown } from '@/lib/content/markdown-serializer'
import type { PMDocument } from '@/lib/content/article-schema'

/**
 * A ProseMirror doc with no text in it. Tiptap represents "empty" as a single
 * empty paragraph, not as an empty content array, so a length check alone
 * would miss it.
 */
function isEffectivelyEmpty(doc: unknown): boolean {
  const content = (doc as { content?: unknown[] } | null)?.content
  if (!Array.isArray(content) || content.length === 0) return true

  const hasText = (nodes: unknown[]): boolean =>
    nodes.some(n => {
      const node = n as { type?: string; text?: string; content?: unknown[] }
      if (node.type === 'text' && node.text?.trim()) return true
      if (node.type === 'image') return true
      return Array.isArray(node.content) ? hasText(node.content) : false
    })

  return !hasText(content)
}

interface SaveArticleBodyInput {
  articleId: string
  bodyProsemirror: Record<string, unknown>
  titleTag: string | null
  metaDescription: string | null
  slug: string | null
}

export async function saveArticleBody(
  input: SaveArticleBodyInput
): Promise<{ error?: string }> {
  const supabase = await getSupabaseServerClient()

  // Resolve the article's brand first so the permission check is brand-scoped.
  const { data: article } = await supabase
    .from('articles')
    .select('brand_id')
    .eq('id', input.articleId)
    .maybeSingle()

  if (!article) return { error: 'Article not found' }

  const ctx = await checkPermission('content.edit', article.brand_id)
  if (!ctx) return { error: 'You do not have permission to edit this article.' }

  // Refuse to blank an article that has content.
  //
  // A tab left open during generation holds an empty editor. When the pipeline
  // writes the draft underneath it, that stale tab's autosave would otherwise
  // overwrite a finished article with an empty document — which is exactly
  // what happened in testing: 8,270 characters replaced by one empty node.
  //
  // The client no longer sends that save, but this is the layer that actually
  // owns the data, so the guarantee belongs here too.
  if (isEffectivelyEmpty(input.bodyProsemirror)) {
    const { data: existing } = await supabase
      .from('article_body')
      .select('body_prosemirror')
      .eq('article_id', input.articleId)
      .maybeSingle()

    if (existing && !isEffectivelyEmpty(existing.body_prosemirror as Record<string, unknown>)) {
      return {
        error:
          'This tab is out of date — the article now has content that is not shown here. ' +
          'Reload the page to see it. Nothing was overwritten.',
      }
    }
  }

  // The HTML and Markdown renditions are derived, not authored. Storing the
  // ProseMirror doc alone would leave them frozen at whatever the generation
  // pipeline produced, so every export and preview after the first manual edit
  // would serve stale content.
  const doc = input.bodyProsemirror as unknown as PMDocument

  const { error } = await supabase
    .from('article_body')
    .upsert({
      article_id: input.articleId,
      body_prosemirror: input.bodyProsemirror,
      body_html: prosemirrorToHtml(doc),
      body_markdown: prosemirrorToMarkdown(doc),
      title_tag: input.titleTag,
      meta_description: input.metaDescription,
      slug: input.slug,
      updated_at: new Date().toISOString(),
    })

  if (error) return { error: error.message }

  await logAudit({
    actorId: ctx.userId,
    action: 'article.updated',
    resourceType: 'article',
    resourceId: input.articleId,
    brandId: article.brand_id,
  })

  revalidatePath(`/articles/${input.articleId}/edit`)

  return {}
}
