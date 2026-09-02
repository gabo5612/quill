import { inngest } from '../client'
import { generateOutline, draftSection, proofreadArticle, generateSeo } from '@/lib/ai/pipeline'
import { planArticleImages, renderArticleImages } from '@/lib/ai/steps/images'
import { recordGeneration } from '@/lib/ai/cost'
import { IMAGE_COST_USD, IMAGE_MODEL_ID } from '@/lib/ai/registry'
import { isProviderConfigured } from '@/lib/ai/providers'
import { retrieveBrandContext } from '@/lib/rag/context-bundle'
import { assembleDocument } from '@/lib/content/article-schema'
import { insertImages, type PlacedImage } from '@/lib/content/insert-images'
import { prosemirrorToHtml, prosemirrorToMarkdown } from '@/lib/content'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit/log'
import { buildJsonLd } from '@/lib/ai/schemas'
import type { GenerationBrief } from '@/lib/ai/schemas'
import type { AttemptDiagnostic } from '@/lib/ai/call'

type GenerateArticleEvent = {
  data: GenerationBrief & { triggeredBy: string }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Inngest's step API is
   generically typed; the concrete signature depends on the function's event
   schema, which isn't wired into the client. */
type Step = any

export const generateArticle = inngest.createFunction(
  {
    id: 'generate-article',
    name: 'Generate Article',
    concurrency: { limit: 3 },
    retries: 2,
    triggers: [{ event: 'article/generate' as const }],
    onFailure: async ({ event }: { event: { data: { event: GenerateArticleEvent; error: { message: string } } } }) => {
      // Terminal failure after all retries. Its job is to make sure the
      // generation screen stops spinning: the status endpoint reads the most
      // recent generations row, so there has to be one marked `error`.
      //
      // The traced steps already write a row naming the step that broke and
      // what the model returned. This only fills the gap when the failure
      // happened somewhere untraced — persisting, assembling — where
      // otherwise nothing would be recorded and the screen would spin forever.
      const brief = event.data.event.data
      const admin = getSupabaseAdminClient()

      const { data: alreadyRecorded } = await admin
        .from('generations')
        .select('id')
        .eq('article_id', brief.articleId)
        .eq('status', 'error')
        .limit(1)
        .maybeSingle()

      if (!alreadyRecorded) {
        await recordGeneration({
          articleId: brief.articleId,
          brandId: brief.brandId,
          provider: brief.provider,
          modelId: brief.modelId,
          step: 'outline',
          status: 'error',
          error: event.data.error.message,
          payload: { kind: 'failure', step: 'pipeline', errorType: 'UntracedFailure' },
        })
      }

      await admin.from('articles').update({ status: 'draft' }).eq('id', brief.articleId)
    },
  },
  async ({ event, step }: { event: GenerateArticleEvent; step: Step }) => {
    const brief = event.data
    const admin = getSupabaseAdminClient()

    /**
     * Records what a step tried before it died, then lets the error through.
     *
     * This runs *inside* `step.run`, not around it: Inngest serialises errors
     * as they cross the step boundary and the attempt history rides on a
     * custom property, which does not survive the trip.
     *
     * Without this the only trace of a failed run was a single row attributed
     * to `outline` no matter what actually broke, and the model's real
     * response was never written down anywhere reachable from the app — the
     * one thing that makes a schema failure diagnosable. Each Inngest retry
     * adds its own row on purpose: seeing the same error three times is
     * itself the diagnosis.
     */
    const trace = async <T>(stepName: 'outline' | 'draft' | 'images' | 'qa' | 'seo', fn: () => Promise<T>): Promise<T> => {
      const started = Date.now()
      try {
        return await fn()
      } catch (error) {
        const diagnostics = (error as { diagnostics?: AttemptDiagnostic[] }).diagnostics
        await recordGeneration({
          articleId: brief.articleId,
          brandId: brief.brandId,
          provider: brief.provider,
          modelId: brief.modelId,
          step: stepName,
          status: 'error',
          durationMs: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
          payload: {
            kind: 'failure',
            step: stepName,
            errorType: error instanceof Error ? error.name : typeof error,
            ...(diagnostics ? { attempts: diagnostics } : {}),
          },
        }).catch(() => {
          // Never let the diagnostic write mask the failure it is describing.
        })
        throw error
      }
    }

    // Step 1 — brand context (profile + RAG chunks)
    const brandContext = await step.run('retrieve-brand-context', async () => {
      const query = `${brief.objective} ${brief.keywords.join(' ')}`
      const result = await retrieveBrandContext(brief.brandId, query)

      // The trace needs to answer "what did the model actually know?" — which
      // profile fields were filled in, whether document search ran, and which
      // passages it pulled.
      await recordGeneration({
        articleId: brief.articleId,
        brandId: brief.brandId,
        provider: brief.provider,
        modelId: brief.modelId,
        step: 'outline',
        payload: {
          kind: 'brand-context',
          query,
          profileFields: result.profile
            ? Object.entries({
                toneOfVoice: result.profile.toneOfVoice,
                audience: result.profile.audience,
                keyMessages: result.profile.keyMessages,
                dos: result.profile.dos,
                donts: result.profile.donts,
                copyExamples: result.profile.copyExamples,
                ctas: result.profile.ctas,
              }).filter(([, v]) => Boolean(v)).map(([k]) => k)
            : [],
          bannedWords: result.profile?.bannedWords ?? [],
          documentSearchUsed: result.documentSearchUsed,
          documentSearchNote: result.documentSearchNote ?? null,
          chunks: result.chunks.slice(0, 8).map(c => ({
            source: c.source,
            excerpt: c.content.slice(0, 400),
          })),
          contextChars: result.assembled.length,
        },
      })

      return result
    })

    const briefWithContext: GenerationBrief = { ...brief, brandContext: brandContext.assembled }

    // Step 2 — outline
    const outline: Awaited<ReturnType<typeof generateOutline>> = await step.run('generate-outline', () => trace('outline', async () => {
      const started = Date.now()
      const result = await generateOutline(briefWithContext)
      await recordGeneration({
        articleId: brief.articleId,
        brandId: brief.brandId,
        provider: brief.provider,
        modelId: brief.modelId,
        step: 'outline',
        usage: result.usage,
        durationMs: Date.now() - started,
        payload: {
          kind: 'outline',
          title: result.title,
          estimatedTotalWords: result.estimatedTotalWords,
          plannedImages: result.imageCount,
          sections: result.sections.map(sec => ({
            heading: sec.heading,
            keyPoints: sec.keyPoints,
            estimatedWords: sec.estimatedWords,
          })),
        },
      })
      return result
    }))

    // Step 3 — draft each section (one Inngest step per LLM call so retries
    // resume from the last completed section rather than re-drafting all of them)
    const sections: Awaited<ReturnType<typeof draftSection>>[] = []
    for (let i = 0; i < outline.sections.length; i++) {
      const section: Awaited<ReturnType<typeof draftSection>> = await step.run(`draft-section-${i}`, () => trace('draft', async () => {
        const started = Date.now()
        const result = await draftSection(briefWithContext, outline, i)
        await recordGeneration({
          articleId: brief.articleId,
          brandId: brief.brandId,
          provider: brief.provider,
          modelId: brief.modelId,
          step: 'draft',
          usage: result.usage,
          durationMs: Date.now() - started,
          payload: {
            kind: 'section',
            index: i,
            heading: outline.sections[i]?.heading ?? `Section ${i + 1}`,
            targetWords: outline.sections[i]?.estimatedWords ?? null,
            markdownChars: result.markdown.length,
          },
        })
        return result
      }))
      sections.push(section)
    }

    // Step 4 — assemble a single-H1 ProseMirror document
    const baseDocument = await step.run('assemble-document', async () => {
      return assembleDocument(outline.title, sections)
    })

    // Step 5 — illustrations.
    //
    // Image generation is OpenAI-only, so this is skipped entirely when that
    // key is absent; the article is simply published without images.
    //
    // Planning, rendering and uploading all happen inside one step on purpose:
    // the raw PNG bytes would otherwise be serialised into Inngest's step
    // state. Only the resulting URLs cross the step boundary.
    const placedImages: PlacedImage[] = await step.run('generate-images', () => trace('images', async () => {
      if (!isProviderConfigured('openai') || outline.imageCount < 1) return []

      const started = Date.now()

      const plan = await planArticleImages(briefWithContext, outline, outline.imageCount)
      await recordGeneration({
        articleId: brief.articleId,
        brandId: brief.brandId,
        provider: brief.provider,
        modelId: brief.modelId,
        step: 'images',
        usage: plan.usage,
        durationMs: Date.now() - started,
        payload: {
          kind: 'image-plan',
          planned: plan.images.map(img => ({
            sectionIndex: img.sectionIndex,
            altText: img.altText,
            prompt: img.prompt,
          })),
        },
      })

      if (plan.images.length === 0) return []

      const { images, failed } = await renderArticleImages(plan.images)

      const uploaded: PlacedImage[] = []
      for (const [i, image] of images.entries()) {
        const extension = image.mediaType === 'image/jpeg' ? 'jpg' : 'png'
        const path = `articles/${brief.articleId}/${i}-${Date.now()}.${extension}`

        const { error } = await admin.storage
          .from('article-images')
          .upload(path, Buffer.from(image.base64, 'base64'), {
            contentType: image.mediaType,
            upsert: true,
          })

        if (error) {
          console.error(`[images] upload failed for ${path}:`, error.message)
          continue
        }

        const { data } = admin.storage.from('article-images').getPublicUrl(path)
        uploaded.push({
          sectionIndex: image.sectionIndex,
          altText: image.altText,
          src: data.publicUrl,
        })
      }

      await recordGeneration({
        articleId: brief.articleId,
        brandId: brief.brandId,
        provider: 'openai',
        modelId: IMAGE_MODEL_ID,
        step: 'images',
        // Billed per image, not per token.
        costUsdOverride: uploaded.length * IMAGE_COST_USD,
        durationMs: Date.now() - started,
        status: failed > 0 && uploaded.length === 0 ? 'error' : 'success',
        error: failed > 0 ? `${failed} image(s) failed to render` : undefined,
        payload: {
          kind: 'image-render',
          rendered: uploaded.length,
          failed,
          images: uploaded,
        },
      })

      return uploaded
    }))

    const document = insertImages(baseDocument, placedImages)

    const fullText = await step.run('extract-text', async () => {
      return prosemirrorToMarkdown(document)
    })

    // Step 6 — QA
    const qaResult: Awaited<ReturnType<typeof proofreadArticle>> = await step.run('proofread', () => trace('qa', async () => {
      const started = Date.now()
      const result = await proofreadArticle(
        briefWithContext,
        fullText,
        brandContext.profile?.bannedWords ?? [],
      )
      await recordGeneration({
        articleId: brief.articleId,
        brandId: brief.brandId,
        provider: brief.provider,
        modelId: result.modelId,
        step: 'qa',
        usage: result.usage,
        durationMs: Date.now() - started,
        payload: {
          kind: 'qa',
          overallScore: result.overallScore,
          passesQA: result.passesQA,
          bannedWordsChecked: brandContext.profile?.bannedWords ?? [],
          issues: result.issues,
        },
      })
      return result
    }))

    // Step 7 — SEO metadata
    const seoResult: Awaited<ReturnType<typeof generateSeo>> = await step.run('generate-seo', () => trace('seo', async () => {
      const started = Date.now()
      const result = await generateSeo(briefWithContext, outline.title, fullText.slice(0, 500))
      await recordGeneration({
        articleId: brief.articleId,
        brandId: brief.brandId,
        provider: brief.provider,
        modelId: result.modelId,
        step: 'seo',
        usage: result.usage,
        durationMs: Date.now() - started,
        payload: {
          kind: 'seo',
          titleTag: result.titleTag,
          metaDescription: result.metaDescription,
          slug: result.slug,
          internalLinkSuggestions: result.internalLinkSuggestions ?? [],
        },
      })
      return result
    }))

    // Step 8 — persist
    await step.run('persist-results', async () => {
      const markdown = prosemirrorToMarkdown(document)

      const { data: brand } = await admin
        .from('brands')
        .select('name')
        .eq('id', brief.brandId)
        .maybeSingle()

      const { error: bodyError } = await admin.from('article_body').upsert({
        article_id: brief.articleId,
        body_prosemirror: document as unknown as Record<string, unknown>,
        body_html: prosemirrorToHtml(document),
        body_markdown: markdown,
        title_tag: seoResult.titleTag,
        meta_description: seoResult.metaDescription,
        slug: seoResult.slug,
        jsonld: buildJsonLd({
          seo: seoResult,
          language: brief.language,
          wordCount: markdown.split(/\s+/).filter(Boolean).length,
          brandName: brand?.name ?? 'the brand',
          publishedAt: new Date(),
        }),
      })

      if (bodyError) throw new Error(`Failed to persist article body: ${bodyError.message}`)

      // Generated drafts always land in review — never auto-approved.
      await admin.from('articles')
        .update({ status: 'in_review', title: outline.title })
        .eq('id', brief.articleId)

      await logAudit({
        actorId: brief.triggeredBy,
        action: 'article.generated',
        resourceType: 'article',
        resourceId: brief.articleId,
        brandId: brief.brandId,
        metadata: {
          model: brief.modelId,
          provider: brief.provider,
          qaScore: qaResult.overallScore,
          sectionCount: outline.sections.length,
          imageCount: placedImages.length,
        },
      })
    })

    return {
      success: true,
      articleId: brief.articleId,
      qaScore: qaResult.overallScore,
      images: placedImages.length,
    }
  }
)
