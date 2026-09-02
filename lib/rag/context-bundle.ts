import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { isEmbeddingConfigured } from '@/lib/ai/providers'
import { retrieveChunks } from './retrieve'

export interface BrandContextBundle {
  profile: {
    toneOfVoice: string | null
    audience: string | null
    keyMessages: string | null
    dos: string | null
    donts: string | null
    bannedWords: string[]
    language: string[]
    copyExamples: string | null
    ctas: string | null
  } | null
  chunks: Array<{ content: string; source: string }>
  /** Ready-to-use context string for the generation prompts. */
  assembled: string
  /** False when document search was skipped or failed — the brand profile is still used. */
  documentSearchUsed: boolean
  documentSearchNote?: string
}

export async function retrieveBrandContext(
  brandId: string,
  query: string
): Promise<BrandContextBundle> {
  const admin = getSupabaseAdminClient()

  const profileResult = await admin
    .from('brand_profiles')
    .select('*')
    .eq('brand_id', brandId)
    .maybeSingle()

  // Embeddings are OpenAI-only. Without that key, fall back to the brand
  // profile alone rather than failing the whole generation — the profile
  // (tone, audience, key messages, do's/don'ts, examples, CTAs) already
  // carries most of the brand voice.
  let chunks: Array<{ content: string; source: string }> = []
  let documentSearchUsed = false
  let documentSearchNote: string | undefined

  if (!isEmbeddingConfigured()) {
    documentSearchNote = 'Skipped: OPENAI_API_KEY is not configured, so brand documents are not indexed.'
  } else {
    try {
      chunks = await retrieveChunks(brandId, query, 8)
      documentSearchUsed = true
    } catch (error) {
      // A retrieval failure should degrade the draft, not kill the job.
      documentSearchNote = error instanceof Error ? error.message : String(error)
      console.error('[rag] retrieval failed, continuing with profile only:', documentSearchNote)
    }
  }

  const profile = profileResult.data
  const parts: string[] = []

  if (profile) {
    if (profile.tone_of_voice) parts.push(`## Tone of Voice\n${profile.tone_of_voice}`)
    if (profile.audience) parts.push(`## Target Audience\n${profile.audience}`)
    if (profile.key_messages) parts.push(`## Key Messages\n${profile.key_messages}`)
    if (profile.dos) parts.push(`## Do's\n${profile.dos}`)
    if (profile.donts) parts.push(`## Don'ts\n${profile.donts}`)
    if (profile.banned_words?.length) parts.push(`## Banned Words\n${profile.banned_words.join(', ')}`)
    if (profile.copy_examples) parts.push(`## Copy Examples\n${profile.copy_examples}`)
    if (profile.ctas) parts.push(`## Typical CTAs\n${profile.ctas}`)
  }

  if (chunks.length) {
    parts.push('## Relevant Brand Documents\n' + chunks.map(c => c.content).join('\n\n---\n\n'))
  }

  return {
    profile: profile ? {
      toneOfVoice: profile.tone_of_voice,
      audience: profile.audience,
      keyMessages: profile.key_messages,
      dos: profile.dos,
      donts: profile.donts,
      bannedWords: profile.banned_words ?? [],
      language: profile.language ?? ['es'],
      copyExamples: profile.copy_examples,
      ctas: profile.ctas,
    } : null,
    chunks,
    assembled: parts.join('\n\n'),
    documentSearchUsed,
    documentSearchNote,
  }
}
