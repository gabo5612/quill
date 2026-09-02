import { createClient } from '@supabase/supabase-js'
import { requireServerEnv } from '@/lib/env'
import { Database } from './types'

/**
 * Service-role admin client — bypasses Row Level Security.
 *
 * ONLY use this inside Inngest functions and background jobs that run on the
 * server and never touch the browser bundle. The service role key must NEVER
 * be exposed to the client.
 *
 * @param brand_id  Optional — documents the brand scope the caller intends to
 *                  operate within. Does not enforce any restriction; it is
 *                  purely a usage hint and can be used for logging.
 */
export function getSupabaseAdminClient(brand_id?: string) {
  const url = requireServerEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requireServerEnv('SUPABASE_SERVICE_ROLE_KEY')

  // Suppress the browser cookie warning — this client is intentionally
  // used in a server-only context (Inngest / background jobs).
  const client = createClient<Database, 'app'>(url, serviceRoleKey, {
    db: { schema: 'app' },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // Attach brand scope as metadata for observability / audit purposes
  if (brand_id) {
    ;(client as unknown as { _brandScope: string })._brandScope = brand_id
  }

  return client
}
