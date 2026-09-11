import { STAFF_ROLES, type StaffRole } from "../../domain";
import { StaffAuthError } from "./staff-auth-error";

/**
 * Small seam (Task 004) that decouples requireStaff/requireAdmin from the
 * real @supabase/supabase-js client shape, so this module can be unit
 * tested with a plain fake and no network access.
 *
 * `getAuthenticatedUserId` must validate the presented access token against
 * Supabase Auth's own user-validation mechanism (never a local JWT decode).
 * It must return null **only** for an actual credential rejection — Supabase
 * Auth explicitly reporting the token as invalid/expired/unauthorized, or a
 * successful response carrying no user. It must **throw** for any
 * unexpected Auth infrastructure failure (5xx, network failure, malformed
 * response, or anything else that is not a real credential rejection) so
 * that failure propagates to requireStaff's INTERNAL path and ultimately an
 * HTTP 500 — it must never be silently reported as "unauthenticated."
 *
 * `getActiveStaffProfile` must resolve authorization by querying
 * `public.profiles` **using a client scoped to the caller's own JWT**, so
 * the database's existing `is_staff()`/`is_active` RLS logic is the actual
 * source of truth (docs/SECURITY.md §5.1). It must return null both when no
 * profile row exists and when the row exists but is not active/visible
 * under RLS — the caller does not need to (and must not) re-implement that
 * distinction, since RLS already collapses both cases to "no row returned."
 */
export interface StaffAuthGateway<TClient> {
  createClient(accessToken: string): TClient;
  getAuthenticatedUserId(
    client: TClient,
    accessToken: string,
  ): Promise<string | null>;
  getActiveStaffProfile(
    client: TClient,
    userId: string,
  ): Promise<{ role: string; displayName: string } | null>;
}

/**
 * Trusted context established for one request after requireStaff succeeds.
 *
 * Deliberately does not expose the raw access token — only the identity,
 * role, and a client already scoped to carry the staff member's own JWT on
 * every further database request, so downstream domain queries remain
 * subject to RLS instead of falling back to a broader credential.
 */
export interface StaffContext<TClient> {
  userId: string;
  role: StaffRole;
  displayName: string;
  supabase: TClient;
}

function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

/**
 * Converts any unexpected failure from the gateway into a safe INTERNAL
 * StaffAuthError.
 *
 * Security-boundary logging rule: `eventLabel` must be a fixed, static
 * string literal supplied by the call site — never `error.message`, never
 * any other property of the caught value. An upstream Auth/DB error can
 * carry request details, connection strings, internal hostnames, or other
 * infrastructure detail; none of that may ever reach the log or the
 * StaffAuthError returned to callers.
 */
function toInternalError(error: unknown, eventLabel: string): StaffAuthError {
  if (error instanceof StaffAuthError) {
    return error;
  }

  console.error(eventLabel);

  return new StaffAuthError("INTERNAL", eventLabel);
}

/**
 * Validates the presented Supabase access token, then authorizes the
 * resulting identity against active WeddingClick staff state.
 *
 * Rejects (throws StaffAuthError) for: missing token, invalid/expired
 * token, authenticated-but-no-active-profile, and any unexpected
 * Auth/DB failure — see StaffAuthErrorKind for the resulting HTTP mapping.
 */
export async function requireStaff<TClient>(
  accessToken: string,
  gateway: StaffAuthGateway<TClient>,
): Promise<StaffContext<TClient>> {
  if (accessToken.trim().length === 0) {
    throw new StaffAuthError("UNAUTHENTICATED", "Missing access token");
  }

  const client = gateway.createClient(accessToken);

  let userId: string | null;
  try {
    userId = await gateway.getAuthenticatedUserId(client, accessToken);
  } catch (error) {
    throw toInternalError(error, "[requireStaff] Failed to validate access token");
  }

  if (!userId) {
    throw new StaffAuthError(
      "UNAUTHENTICATED",
      "Invalid or expired access token",
    );
  }

  let profile: { role: string; displayName: string } | null;
  try {
    profile = await gateway.getActiveStaffProfile(client, userId);
  } catch (error) {
    throw toInternalError(error, "[requireStaff] Failed to resolve staff profile");
  }

  if (!profile) {
    throw new StaffAuthError(
      "FORBIDDEN",
      "No active WeddingClick staff profile",
    );
  }

  if (!isStaffRole(profile.role)) {
    // Should be unreachable — profiles.role has a DB CHECK constraint — but
    // never trust upstream data shape blindly in server auth code.
    throw new StaffAuthError(
      "INTERNAL",
      "Staff profile has an unrecognized role",
    );
  }

  return {
    userId,
    role: profile.role,
    displayName: profile.displayName,
    supabase: client,
  };
}

/**
 * Reusable authorization layer for ADMIN-only operations, built on top of
 * requireStaff. Role comes only from the already-verified StaffContext —
 * never from request input.
 */
export async function requireAdmin<TClient>(
  accessToken: string,
  gateway: StaffAuthGateway<TClient>,
): Promise<StaffContext<TClient>> {
  const context = await requireStaff(accessToken, gateway);

  if (context.role !== "ADMIN") {
    throw new StaffAuthError("FORBIDDEN", "Admin role required");
  }

  return context;
}
