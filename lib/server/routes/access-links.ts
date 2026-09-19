import type { AccessLinkType } from "../../domain";
import type { AccessLinkStaffGateway } from "../access-links/access-link-staff-gateway";
import { issueAccessLink } from "../access-links/issue-access-link";
import { revokeAccessLink } from "../access-links/revoke-access-link";
import { rotateAccessLink } from "../access-links/rotate-access-link";
import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";

/**
 * Pure, framework-agnostic handlers backing the Staff Access-Link HTTP
 * endpoints (Task 026 Phase 3) — mirrors lib/server/routes/project-lifecycle.ts
 * and lib/server/routes/project-events.ts.
 *
 * All three require an active STAFF/ADMIN caller via the same requireStaff
 * boundary; there is no ADMIN-only branch. Auth (401/403) is always
 * resolved before any body-shape or UUID validation, matching every
 * existing route in this codebase.
 */
export interface ApiResult<TBody> {
  status: 200 | 201 | 400 | 401 | 403 | 404 | 409 | 410 | 422 | 500;
  body: TBody | { error: string };
  headers?: Record<string, string>;
}

/**
 * Frozen Phase 3 contract: every issue/rotate response — success or error —
 * carries this header, so a raw token can never end up in a cache under any
 * branch (revoke never returns a token, so it is not required there).
 */
const NO_STORE_HEADERS: Readonly<Record<string, string>> = { "Cache-Control": "no-store" };

function withNoStore<T>(result: ApiResult<T>): ApiResult<T> {
  return { ...result, headers: { ...NO_STORE_HEADERS, ...result.headers } };
}

function toErrorResult(error: unknown, logLabel: string): ApiResult<never> {
  if (error instanceof StaffAuthError) {
    if (error.kind === "UNAUTHENTICATED") {
      return { status: 401, body: { error: error.message } };
    }
    if (error.kind === "FORBIDDEN") {
      return { status: 403, body: { error: error.message } };
    }
    return { status: 500, body: { error: "Internal server error" } };
  }

  if (error instanceof ApiError) {
    if (error.kind === "INTERNAL") {
      return { status: 500, body: { error: "Internal server error" } };
    }
    return { status: apiErrorStatus(error.kind), body: { error: error.message } };
  }

  console.error(logLabel);
  return { status: 500, body: { error: "Internal server error" } };
}

interface IssuedAccessLinkResponseData {
  id: string;
  projectId: string;
  linkType: AccessLinkType;
  token: string;
  expiresAt: string | null;
  createdAt: string;
}

interface RevokedAccessLinkResponseData {
  id: string;
  projectId: string;
  linkType: AccessLinkType;
  revokedAt: string;
}

/** POST /api/v2/internal/projects/[id]/access-links */
export async function handleIssueAccessLinkRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  accessLinkGateway: AccessLinkStaffGateway<TClient>,
): Promise<ApiResult<{ data: IssuedAccessLinkResponseData }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return withNoStore<{ data: IssuedAccessLinkResponseData }>({
      status: 401,
      body: { error: "Missing or malformed Authorization header" },
    });
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await issueAccessLink(projectId, rawBody, staff, accessLinkGateway);

    return withNoStore({
      status: 201,
      body: {
        data: {
          id: result.record.id,
          projectId: result.record.projectId,
          linkType: result.record.linkType,
          token: result.token,
          expiresAt: result.record.expiresAt,
          createdAt: result.record.createdAt,
        },
      },
    });
  } catch (error) {
    return withNoStore(toErrorResult(error, "[handleIssueAccessLinkRequest] Unexpected error"));
  }
}

/**
 * POST /api/v2/internal/projects/[id]/access-links/[linkId]/rotate. Frozen
 * contract (docs/DECISIONS.md D14/P3-D5): no request body — this endpoint
 * never reads one at all. Every mutation input is server-generated.
 */
export async function handleRotateAccessLinkRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  linkId: string,
  authGateway: StaffAuthGateway<TClient>,
  accessLinkGateway: AccessLinkStaffGateway<TClient>,
): Promise<ApiResult<{ data: IssuedAccessLinkResponseData }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return withNoStore<{ data: IssuedAccessLinkResponseData }>({
      status: 401,
      body: { error: "Missing or malformed Authorization header" },
    });
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await rotateAccessLink(projectId, linkId, staff, accessLinkGateway);

    return withNoStore({
      status: 200,
      body: {
        data: {
          id: result.record.id,
          projectId: result.record.projectId,
          linkType: result.record.linkType,
          token: result.token,
          expiresAt: result.record.expiresAt,
          createdAt: result.record.createdAt,
        },
      },
    });
  } catch (error) {
    return withNoStore(toErrorResult(error, "[handleRotateAccessLinkRequest] Unexpected error"));
  }
}

/**
 * POST /api/v2/internal/projects/[id]/access-links/[linkId]/revoke. Frozen
 * contract (docs/DECISIONS.md D14/P3-D5): no request body — this endpoint
 * never reads one at all.
 */
export async function handleRevokeAccessLinkRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  linkId: string,
  authGateway: StaffAuthGateway<TClient>,
  accessLinkGateway: AccessLinkStaffGateway<TClient>,
): Promise<ApiResult<{ data: RevokedAccessLinkResponseData }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await revokeAccessLink(projectId, linkId, staff, accessLinkGateway);

    return {
      status: 200,
      body: {
        data: {
          id: result.id,
          projectId: result.projectId,
          linkType: result.linkType,
          revokedAt: result.revokedAt,
        },
      },
    };
  } catch (error) {
    return toErrorResult(error, "[handleRevokeAccessLinkRequest] Unexpected error");
  }
}
