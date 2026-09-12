import { supabase } from "../supabase";

/**
 * Resolves the current staff member's Supabase Auth access token for use as
 * a Bearer credential against the trusted V2 internal API boundary.
 *
 * This only reads the local Auth session (`supabase.auth.getSession()`) —
 * it never queries a Supabase table directly. All V2 project/customer data
 * must still come from `/api/v2/internal/**` (CLAUDE.md §3 / this task's
 * security boundary).
 */
export async function getStaffAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
