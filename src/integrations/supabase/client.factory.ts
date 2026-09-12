import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "../../config/env.js";

/**
 * Base unauthenticated Supabase client used for general/anonymous operations if needed.
 */
export function createBaseSupabaseClient(): SupabaseClient {
  const config = getConfig();
  return createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Request-scoped Supabase client that propagates the caller's JWT in the Authorization header.
 * This guarantees that all RPCs and RLS policies evaluate against the caller's identity via `auth.uid()`.
 * Each request gets a freshly configured client; instances are not cached or shared across requests.
 */
export function createUserScopedSupabaseClient(jwt: string): SupabaseClient {
  const config = getConfig();
  return createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });
}
