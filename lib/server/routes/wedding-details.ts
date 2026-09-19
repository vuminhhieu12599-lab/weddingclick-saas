import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import { getWeddingDetailsByProjectId } from "../wedding-details/get-wedding-details";
import { saveWeddingDetails } from "../wedding-details/save-wedding-details";
import type { WeddingDetailsGateway } from "../wedding-details/wedding-details-gateway";
import type {
  SaveWeddingDetailsResult,
  WeddingDetailsRecord,
} from "../wedding-details/wedding-details-types";

/**
 * Pure, framework-agnostic handlers backing the Wedding Details HTTP
 * endpoints (Task 022) — mirrors lib/server/routes/projects.ts.
 */
export interface ApiResult<TBody> {
  status: 200 | 400 | 401 | 403 | 404 | 409 | 410 | 422 | 500;
  body: TBody | { error: string };
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

/** GET /api/v2/internal/projects/[id]/wedding-details */
export async function handleGetWeddingDetailsRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  weddingDetailsGateway: WeddingDetailsGateway<TClient>,
): Promise<ApiResult<{ data: WeddingDetailsRecord | null }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const data = await getWeddingDetailsByProjectId(projectId, staff, weddingDetailsGateway);
    return { status: 200, body: { data } };
  } catch (error) {
    return toErrorResult(error, "[handleGetWeddingDetailsRequest] Unexpected error");
  }
}

/** PUT /api/v2/internal/projects/[id]/wedding-details */
export async function handleSaveWeddingDetailsRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  weddingDetailsGateway: WeddingDetailsGateway<TClient>,
): Promise<ApiResult<SaveWeddingDetailsResult>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await saveWeddingDetails(
      projectId,
      rawBody,
      staff,
      weddingDetailsGateway,
    );
    return { status: 200, body: result };
  } catch (error) {
    return toErrorResult(error, "[handleSaveWeddingDetailsRequest] Unexpected error");
  }
}
