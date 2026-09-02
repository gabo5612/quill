import { NextResponse } from 'next/server'
import { getEnvReport } from '@/lib/env'
import { configuredProviders, isEmbeddingConfigured } from '@/lib/ai/providers'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health — configuration and connectivity probe.
 *
 * Public (see isPublicPath in proxy.ts) so it can be checked before anyone can
 * sign in, which is exactly when it is most useful. It reports only whether a
 * variable is set, never its value.
 *
 * 200 means the app is usable. Features listed under `degraded` are switched
 * off but do not fail the check.
 */
export async function GET() {
  const env = getEnvReport()

  let database: { reachable: boolean; error?: string } = { reachable: false }
  try {
    const supabase = await getSupabaseServerClient()
    const { error } = await supabase.from('ai_models').select('model_id').limit(1)
    database = error ? { reachable: false, error: error.message } : { reachable: true }
  } catch (error) {
    database = {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const ok = env.ok && database.reachable

  return NextResponse.json(
    {
      ok,
      database,
      env: {
        ok: env.ok,
        missingRequired: env.missingRequired.map(v => ({ name: v.name, requiredFor: v.requiredFor })),
        missingOptional: env.missingOptional.map(v => v.name),
      },
      // Present but switched off — the app still works.
      degraded: env.degraded.map(v => ({ name: v.name, disables: v.requiredFor })),
      features: {
        aiProviders: configuredProviders(),
        documentSearch: isEmbeddingConfigured(),
      },
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
