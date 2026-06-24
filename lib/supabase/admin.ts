import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Bypasses RLS — only use server-side in
 * route handlers / server actions. Never expose to the browser.
 *
 * Used for:
 *   - Storage uploads (lib/documents/*) where we've already done app-layer
 *     permission checks and need to write to a private bucket
 *   - Future: any operation that must bypass RLS on auth.users (e.g. the
 *     invitations service in lib/invitations/accept-service.ts, which
 *     currently constructs its own service client inline)
 *
 * Reuses a single instance via module-level caching; @supabase/supabase-js
 * is light enough that this is mostly about avoiding the env-var lookup
 * overhead on hot paths.
 */

let cached: SupabaseClient | null = null

export function createServiceClient(): SupabaseClient {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Supabase service client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  cached = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  return cached
}
