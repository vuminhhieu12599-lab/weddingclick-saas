import type { AccessLinkInventoryGateway } from "../access-links/access-link-inventory-gateway";
import type { AccessLinkInventoryItem } from "../access-links/access-link-inventory-types";
import { listAccessLinks } from "../access-links/list-access-links";
import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";

/**
 * Pure handler backing `GET /api/v2/internal/projects/[id]/access-links`
 * (Launch Hardening 02 / P0-1). Same staff boundary as the frozen Task 026
 * issue/rotate/revoke handlers (lib/server/routes/access-links.ts, unchanged):
 * STAFF and ADMIN alike, auth resolved before any input validation. The
 * response is `no-store` and never carries token material.
 */
export interface ApiResult<TBody> {
  status: 200 | 400 | 401 | 403 | 404 | 500;
  body: TBody | { error: string };
  headers: Record<string, string>;
}

const NO_STORE_HEADERS: Readonly<Record<string, string>> = { "Cache-Control": "no-store" };

function errorResult(error: unknown): ApiResult<never> {
  if (error instanceof StaffAuthError) {
    if (error.kind === "UNAUTHENTICATED") {
      return { status: 401, body: { error: error.message }, headers: { ...NO_STORE_HEADERS } };
    }
    if (error.kind === "FORBIDDEN") {
      return { status: 403, body: { error: error.message }, headers: { ...NO_STORE_HEADERS } };
    }
  } else if (error instanceof ApiError && error.kind !== "INTERNAL") {
    const status = apiErrorStatus(error.kind);
    if (status === 400 || status === 404) {
      return { status, body: { error: error.message }, headers: { ...NO_STORE_HEADERS } };
    }
  } else if (!(error instanceof ApiError)) {
    console.error("[handleListAccessLinksRequest] Unexpected error");
  }
  return { status: 500, body: { error: "Internal server error" }, headers: { ...NO_STORE_HEADERS } };
}

/** GET /api/v2/internal/projects/[id]/access-links */
export async function handleListAccessLinksRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  inventoryGateway: AccessLinkInventoryGateway<TClient>,
): Promise<ApiResult<{ data: AccessLinkInventoryItem[] }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return {
      status: 401,
      body: { error: "Missing or malformed Authorization header" },
      headers: { ...NO_STORE_HEADERS },
    };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const data = await listAccessLinks(projectId, staff, inventoryGateway);
    return { status: 200, body: { data }, headers: { ...NO_STORE_HEADERS } };
  } catch (error) {
    return errorResult(error);
  }
}
