import { z } from 'zod'
import { callLLMStructured } from '@/lib/ai/call'
import { getBalancedModelId, getFlagshipModelId } from '@/lib/ai/registry'
import { pickAvailableProvider } from '@/lib/ai/providers'
import { crawlSite, type CrawlResult } from './crawl'

export const InferredProfileSchema = z.object({
  toneOfVoice: z.string().describe("How the brand sounds. Formal or casual, warm or clinical, who it addresses and how."),
  audience: z.string().describe('Who the brand speaks to: role, sector, region, what they are trying to solve.'),
  keyMessages: z.string().describe('The two or three claims the site keeps returning to.'),
  dos: z.string().describe('Concrete things the copy consistently does. One per line.'),
  donts: z.string().describe('Concrete things the copy consistently avoids. One per line.'),
  copyExamples: z.string().describe('Two to four short verbatim lines from the site that best show the voice.'),
  ctas: z.string().describe('The calls to action actually used on the site, verbatim. One per line.'),
  bannedWords: z.array(z.string()).max(20)
    .describe('Words the brand visibly avoids, or that would clash with its voice. Empty if nothing is clear.'),
  language: z.array(z.enum(['es', 'en'])).min(1)
    .describe('Languages the site publishes in.'),
  confidence: z.enum(['high', 'medium', 'low'])
    .describe("How much of this is grounded in the text rather than inferred. 'low' if the site had little copy."),
  notes: z.string().describe('What you could not determine, and what a human should check. Be specific.'),
})

export type InferredProfile = z.infer<typeof InferredProfileSchema>

export interface InferProfileResult {
  profile: InferredProfile
  crawl: Pick<CrawlResult, 'origin' | 'title' | 'pagesFetched' | 'notes'>
  usage: { inputTokens: number; outputTokens: number }
  modelId: string
}

/**
 * Reads a brand's website and proposes a brand profile from it.
 *
 * The output is a *draft* the editor reviews and edits — the model is told to
 * say what it could not determine rather than inventing it, and the result is
 * never written to the database without the user pressing save.
 */
export async function inferBrandProfileFromSite(
  url: string,
  brandName: string,
): Promise<InferProfileResult> {
  const provider = pickAvailableProvider()
  if (!provider) {
    throw new Error('No AI provider is configured, so the site cannot be analysed.')
  }

  const crawl = await crawlSite(url)

  if (crawl.text.length < 200) {
    throw new Error(
      'That page had almost no readable text. It may be rendered entirely in JavaScript, ' +
      'which this importer cannot see. Try a specific content page such as /about.',
    )
  }

  // Longer sites benefit from the stronger model; short ones don't.
  const modelId = crawl.text.length > 12_000
    ? getFlagshipModelId(provider)
    : getBalancedModelId(provider)

  const { object, usage } = await callLLMStructured({
    provider,
    modelId,
    system: `You are a brand strategist.

You are reading a company's own website to draft a brand profile that writers
will use to generate content in that company's voice.

Ground every field in the text you were given. Where the site does not show
something, say so in \`notes\` and keep the field short rather than inventing a
plausible-sounding answer — a confident invention is worse than an admission,
because a writer will treat it as fact.

Quote \`copyExamples\` and \`ctas\` verbatim from the site. Do not paraphrase them.

Write the profile in the language the site itself uses.`,
    prompt: `Brand: ${brandName}
Site: ${crawl.origin}
Page title: ${crawl.title ?? '(none)'}
Meta description: ${crawl.description ?? '(none)'}
Pages read: ${crawl.pagesFetched.join(', ')}

--- SITE TEXT ---
${crawl.text}
--- END SITE TEXT ---

Draft the brand profile.`,
    schema: InferredProfileSchema,
    schemaName: 'brand_profile',
    maxTokens: 4096,
  })

  return {
    profile: object,
    crawl: {
      origin: crawl.origin,
      title: crawl.title,
      pagesFetched: crawl.pagesFetched,
      notes: crawl.notes,
    },
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    modelId,
  }
}
