import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import type { GuestLinkGateway, IssuedGuestLink } from "../guest-links/guest-link-types";
import { issueGuestLink } from "../guest-links/issue-guest-link";

/**
 * Framework-agnostic handler for POST
 * /api/v2/internal/projects/[id]/guests/[guestId]/access-link (Task 033B1) —
 * the staff SUPPORT/back-office path: `requireStaff`, then the shared
 * actor-neutral `issueGuestLink` with the staff-scoped client. Not the
 * customer flow (future Customer Portal Guest Tool). Mirrors
 * lib/server/routes/access-links.ts: auth before validation, every
 * response `no-store` (the success body carries the raw-token path once),
 * fixed messages, and nothing about the request or token is logged.
 */
export interface GuestLinkApiResult {
  status: 200 | 400 | 401 | 403 | 404 | 409 | 410 | 422 | 500;
  body: { data: IssuedGuestLink } | { error: string };
  headers: Record<string, string>;
}

const NO_STORE_HEADERS: Readonly<Record<string, string>> = { "Cache-Control": "no-store" };

function result(status: GuestLinkApiResult["status"], body: GuestLinkApiResult["body"]): GuestLinkApiResult {
  return { status, body, headers: { ...NO_STORE_HEADERS } };
}

export async function handleIssueGuestLinkRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  guestId: string,
  readBody: () => Promise<unknown>,
  authGateway: StaffAuthGateway<TClient>,
  guestLinkGateway: GuestLinkGateway<TClient>,
): Promise<GuestLinkApiResult> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return result(401, { error: "Missing or malformed Authorization header" });
  }

  try {
    const staff = await requireStaff(token, authGateway);
    let body: unknown;
    try {
      body = await readBody();
    } catch {
      return result(400, { error: "Request body must be { action }" });
    }
    const issued = await issueGuestLink(projectId, guestId, body, staff.supabase, guestLinkGateway);
    return result(200, { data: issued });
  } catch (error) {
    if (error instanceof StaffAuthError) {
      if (error.kind === "UNAUTHENTICATED") return result(401, { error: error.message });
      if (error.kind === "FORBIDDEN") return result(403, { error: error.message });
      return result(500, { error: "Internal server error" });
    }
    if (error instanceof ApiError && error.kind !== "INTERNAL") {
      return result(apiErrorStatus(error.kind), { error: error.message });
    }
    console.error("[handleIssueGuestLinkRequest] Unexpected error");
    return result(500, { error: "Internal server error" });
  }
}
