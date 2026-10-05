import { parseBearerToken } from "../auth/bearer-token";
import type { CustomerPortalGuestRow, PortalGuestConflictReason, PortalIssuedGuestLink } from "../customer-portal/portal-guest-types";
import {
  createPortalGuest,
  issuePortalGuestLink,
  PortalGuestConflictError,
  revokePortalGuest,
  updatePortalGuest,
  type PortalGuestToolDependencies,
} from "../customer-portal/portal-guest-tool";
import { ApiError, apiErrorStatus } from "../errors/api-error";

/**
 * Framework-agnostic handlers for the Task 033E-A Portal Guest Tool
 * (`Authorization: Bearer <raw PORTAL token>`, never a Supabase session;
 * the Project comes only from the resolved token). Mirrors
 * lib/server/routes/customer-review.ts: no-store on every response, fixed
 * generic 500, never raw DB/token detail, fixed-string logging only. A 409
 * carries a stable `reason` for the customer UI. A 422 (Task 033E-B) means
 * the guest's invitation side is not issuable (unresolved or unpublished).
 */
export interface PortalGuestApiResult {
  status: 200 | 201 | 400 | 401 | 403 | 404 | 409 | 410 | 422 | 500;
  body:
    | { data: CustomerPortalGuestRow | PortalIssuedGuestLink }
    | { error: string }
    | { error: string; reason: PortalGuestConflictReason };
  headers: Record<string, string>;
}

const NO_STORE_HEADERS: Readonly<Record<string, string>> = { "Cache-Control": "no-store" };

function result(status: PortalGuestApiResult["status"], body: PortalGuestApiResult["body"]): PortalGuestApiResult {
  return { status, body, headers: { ...NO_STORE_HEADERS } };
}

async function handle(
  authorizationHeader: string | null,
  successStatus: 200 | 201,
  run: (token: string) => Promise<CustomerPortalGuestRow | PortalIssuedGuestLink>,
): Promise<PortalGuestApiResult> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return result(401, { error: "Missing or malformed Authorization header" });
  }
  try {
    return result(successStatus, { data: await run(token) });
  } catch (error) {
    if (error instanceof PortalGuestConflictError) {
      return result(409, { error: error.message, reason: error.reason });
    }
    if (error instanceof ApiError) {
      const status = apiErrorStatus(error.kind);
      if (status === 400 || status === 403 || status === 404 || status === 410 || status === 422) {
        return result(status, { error: error.message });
      }
    }
    console.error("[handlePortalGuestRequest] Unexpected error");
    return result(500, { error: "Internal server error" });
  }
}

export function handleCreatePortalGuestRequest(
  authorizationHeader: string | null,
  readBody: () => Promise<unknown>,
  deps: PortalGuestToolDependencies,
): Promise<PortalGuestApiResult> {
  return handle(authorizationHeader, 201, (token) => createPortalGuest(token, readBody, deps));
}

export function handleUpdatePortalGuestRequest(
  authorizationHeader: string | null,
  guestId: string,
  readBody: () => Promise<unknown>,
  deps: PortalGuestToolDependencies,
): Promise<PortalGuestApiResult> {
  return handle(authorizationHeader, 200, (token) => updatePortalGuest(token, guestId, readBody, deps));
}

export function handleRevokePortalGuestRequest(
  authorizationHeader: string | null,
  guestId: string,
  deps: PortalGuestToolDependencies,
): Promise<PortalGuestApiResult> {
  return handle(authorizationHeader, 200, (token) => revokePortalGuest(token, guestId, deps));
}

/** Task 033E-B — the success body carries the raw-token path once (`no-store`). */
export function handleIssuePortalGuestLinkRequest(
  authorizationHeader: string | null,
  guestId: string,
  readBody: () => Promise<unknown>,
  deps: PortalGuestToolDependencies,
): Promise<PortalGuestApiResult> {
  return handle(authorizationHeader, 200, (token) => issuePortalGuestLink(token, guestId, readBody, deps));
}
