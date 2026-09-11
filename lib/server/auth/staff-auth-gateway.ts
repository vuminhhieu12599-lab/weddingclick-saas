import {
  isAuthApiError,
  isAuthSessionMissingError,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { createStaffSupabaseClient } from "../supabase/staff-client";
import type { StaffAuthGateway } from "./staff-context";

/**
 * Production StaffAuthGateway (Task 004): the only place in this boundary
 * that touches real @supabase/supabase-js calls.
 *
 * getAuthenticatedUserId — calls `auth.getUser(accessToken)`, which asks
 * Supabase Auth's server to validate the token; never decodes the JWT
 * locally and never trusts client-supplied user id/role.
 *
 * `@supabase/auth-js`'s `getUser(jwt)` almost never *rejects* — internally
 * it wraps the HTTP call and resolves `{ data: { user: null }, error }` for
 * essentially every failure mode, both "Auth server explicitly rejected
 * this credential" (bad_jwt, session_not_found, user_banned, ... surfaced
 * as `AuthApiError`/`AuthSessionMissingError`) and everything else — rate
 * limiting (`AuthApiError` with `status: 429`), Auth service outages (5xx,
 * surfaced as `AuthRetryableFetchError`), and unparseable/network failures
 * (`AuthUnknownError`, `status: undefined`). Treating every non-null
 * `error` — or every 4xx status — as "unauthenticated" would misreport
 * rate limiting and infrastructure trouble as invalid credentials. This
 * function instead classifies on the error's stable structured type/status
 * (see `isCredentialRejection` below) — never on `error.message`, which is
 * free-form upstream text — and only a confirmed credential/session
 * rejection resolves to `null` (-> requireStaff's UNAUTHENTICATED/401
 * path). Everything else is re-thrown as a fixed, safe Error so it reaches
 * requireStaff's INTERNAL/500 path instead.
 *
 * getActiveStaffProfile — reads `public.profiles` through the same client,
 * i.e. under the caller's own JWT, so the existing `profiles_select_staff`
 * RLS policy (USING is_staff()) is what actually authorizes the read. A
 * user with no profile row, or an inactive one, is filtered out by RLS
 * before it ever reaches this function — both cases surface here as
 * `data: null`, which this gateway reports as `null` (no active profile),
 * not as an error.
 */

/**
 * HTTP statuses that, on a real GoTrue `AuthApiError` (i.e. an actual JSON
 * error response from the Auth server, not a rate limit or an outage), mean
 * "this credential/session was rejected."
 *
 * 401 is GoTrue's standard "invalid/expired JWT" response. 403 is included
 * because `@supabase/auth-js` itself treats `AuthApiError` with status 401
 * *or* 403 as "invalid or expired JWT" — see
 * `node_modules/@supabase/auth-js/src/GoTrueClient.ts`, `_signOut()`:
 * `// ignore 401s since an invalid or expired JWT should sign out the
 * current session` guards a check on `error.status === 404 || ... === 401
 * || ... === 403`. That is the installed package's own maintainers
 * documenting 401/403 as credential-rejection statuses; this module does
 * not add 404 to the set because that specific exclusion is about the
 * admin sign-out-by-session-id endpoint ("user might not exist anymore"),
 * not about `auth.getUser`, and no equivalent evidence supports treating a
 * generic 404 from `getUser` as a credential rejection here.
 *
 * 429 (rate limiting) and every other 4xx are deliberately excluded: they
 * are not evidence the presented token/session is invalid.
 */
const CREDENTIAL_REJECTION_STATUSES: ReadonlySet<number> = new Set([401, 403]);

function isCredentialRejection(error: unknown): boolean {
  // AuthSessionMissingError: @supabase/auth-js's dedicated "no valid
  // session" class (see auth-js `errors.ts`) — always status 400 by
  // construction, but plain status 400 is not itself a reliable auth
  // signal (ordinary validation errors also use 400), so this case is
  // identified by its distinct, stable error type rather than by status.
  if (isAuthSessionMissingError(error)) {
    return true;
  }

  // AuthApiError: a real GoTrue HTTP error response, with the real
  // upstream status attached. Only the explicit statuses above count as
  // credential rejection.
  return isAuthApiError(error) && CREDENTIAL_REJECTION_STATUSES.has(error.status);
}

export const supabaseStaffAuthGateway: StaffAuthGateway<SupabaseClient> = {
  createClient: createStaffSupabaseClient,

  async getAuthenticatedUserId(client, accessToken) {
    const { data, error } = await client.auth.getUser(accessToken);

    if (!error) {
      return data.user ? data.user.id : null;
    }

    if (isCredentialRejection(error)) {
      return null;
    }

    // Everything else — rate limiting (429), Auth infrastructure failure
    // (5xx, network, malformed response, ...), or any other unclassified
    // 4xx — is never collapsed into "unauthenticated," and never surfaces
    // error.message (free-form upstream text) here or to any caller.
    // requireStaff's INTERNAL path logs only a fixed safe label.
    throw new Error("Auth infrastructure failure");
  },

  async getActiveStaffProfile(client, userId) {
    const { data, error } = await client
      .from("profiles")
      .select("role, display_name")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query staff profile");
    }

    if (!data) {
      return null;
    }

    const row = data as { role: string; display_name: string };

    return { role: row.role, displayName: row.display_name };
  },
};
