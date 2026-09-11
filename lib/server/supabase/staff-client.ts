import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Staff-scoped Supabase client factory (Task 004).
 *
 * Server-only: import this only from Route Handlers / Server Actions /
 * other lib/server modules, never from a Client Component.
 *
 * Uses the existing public Supabase URL + anon/publishable key (same
 * credentials lib/supabase.ts already uses for V1) and attaches the
 * presented staff access token as the Authorization header on every
 * PostgREST/Auth request this client makes. This means:
 *
 * - `client.auth.getUser(accessToken)` validates the token against
 *   Supabase Auth's own servers rather than a local JWT decode.
 * - `client.from(...)` database requests execute as that authenticated
 *   user (auth.uid() resolves to them), so V2 RLS policies remain the real
 *   enforcement — this client deliberately never uses service_role.
 *
 * Session persistence/refresh is disabled: this client exists for the
 * lifetime of one server request and is never meant to manage its own
 * auth session (the browser-held Supabase session is the source of truth
 * for the token itself).
 */
export function createStaffSupabaseClient(accessToken: string): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment configuration is missing");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
