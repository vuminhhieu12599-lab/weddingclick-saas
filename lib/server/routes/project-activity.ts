import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import { listProjectActivity } from "../project-activity/list-project-activity";
import type { ProjectActivityGateway } from "../project-activity/project-activity-gateway";
import type { ProjectActivityPage } from "../project-activity/project-activity-types";

/**
 * Pure, framework-agnostic handler backing the staff Project Activity
 * endpoint (Task 034B) — mirrors lib/server/routes/project-tasks.ts.
 */

export interface ApiResult<TBody> {
  status: 200 | 400 | 401 | 403 | 404 | 409 | 410 | 422 | 500;
  body: TBody | { error: string };
}

/** GET /api/v2/internal/projects/[id]/activity?cursor= */
export async function handleListProjectActivityRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawCursor: string | null,
  authGateway: StaffAuthGateway<TClient>,
  gateway: ProjectActivityGateway<TClient>,
): Promise<ApiResult<{ data: ProjectActivityPage }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }
  try {
    const staff = await requireStaff(token, authGateway);
    return { status: 200, body: { data: await listProjectActivity(projectId, rawCursor, staff, gateway) } };
  } catch (error) {
    if (error instanceof StaffAuthError) {
      if (error.kind === "UNAUTHENTICATED") return { status: 401, body: { error: error.message } };
      if (error.kind === "FORBIDDEN") return { status: 403, body: { error: error.message } };
      return { status: 500, body: { error: "Internal server error" } };
    }
    if (error instanceof ApiError && error.kind !== "INTERNAL") {
      return { status: apiErrorStatus(error.kind), body: { error: error.message } };
    }
    console.error("[handleListProjectActivityRequest] Unexpected error");
    return { status: 500, body: { error: "Internal server error" } };
  }
}
