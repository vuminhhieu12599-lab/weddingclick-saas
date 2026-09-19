import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only `service_role` Supabase client factory (Task 026 Phase 2,
 * docs/DECISIONS.md D11, docs/SECURITY.md §6).
 *
 * This is the ONLY module in the codebase that may reference the
 * `SUPABASE_SERVICE_ROLE_KEY` environment variable — see
 * lib/server/access-links/__tests__/token-resolution-static-security-review.test.ts.
 * It is deliberately isolated from lib/server/supabase/staff-client.ts (the
 * anon-key + caller-JWT client used for the normal staff/RLS path) and must
 * be imported only by the narrow resolution repository that needs to bypass
 * RLS after independent, server-side token validation
 * (lib/server/supabase/access-link-resolution-repository.ts). The repo's
 * `server-only` package is not installed (CLAUDE.md §24 — no new dependency
 * for this), so that boundary is enforced by the static import-boundary
 * test rather than a build-time guard import.
 *
 * Never falls back to the anon key. Never exposes the key through a thrown
 * error, a log, or a returned object. Reads the environment lazily (inside
 * the function body, not at module load) so importing this module — or
 * running typecheck/lint/build for routes that don't call it — never
 * requires a real `SUPABASE_SERVICE_ROLE_KEY` to be present.
 */
export function createServiceRoleSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server-role environment configuration is missing");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
