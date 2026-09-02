import { createBrowserClient } from '@supabase/ssr'
import { Database } from './types'

// Singleton instance — safe to call many times in client components
let client: ReturnType<typeof createBrowserClient<Database, 'app'>> | null = null

export function getSupabaseBrowserClient() {
  if (client) return client

  client = createBrowserClient<Database, 'app'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'app' } },
  )

  return client
}
