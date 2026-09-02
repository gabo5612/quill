import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { Database } from './types'

/**
 * Creates a Supabase client that can both read and write cookies inside
 * Next.js middleware. Returns the (potentially updated) response so the
 * caller can forward refreshed session cookies to the browser.
 *
 * Usage in middleware.ts:
 *   const { supabase, response } = createSupabaseMiddlewareClient(request)
 *   await supabase.auth.getUser()   // refreshes session if needed
 *   return response
 */
export function createSupabaseMiddlewareClient(request: NextRequest) {
  // Start with a response that forwards all incoming headers
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database, 'app'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'app' },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write cookies onto the request so subsequent middleware can read them
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          // Rebuild the response so the updated cookies reach the browser
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  return { supabase, response }
}
