import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway, type StaffContext } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import {
  createProjectTimelineItem,
  deleteProjectTimelineItem,
  listProjectTimeline,
  updateProjectTimelineItem,
} from "../project-timeline/manage-project-timeline";
import type { ProjectTimelineGateway } from "../project-timeline/project-timeline-gateway";
import type { ProjectTimelineItemRecord } from "../project-timeline/project-timeline-types";
import type { ProjectTimelineWriteGateway } from "../project-timeline/project-timeline-write-gateway";

/**
 * Pure, framework-agnostic handlers backing the staff Timeline endpoints
 * (Media + Optional Content Editor) — mirrors lib/server/routes/project-events.ts.
 */

export interface ApiResult<TBody> {
  status: 200 | 201 | 400 | 401 | 403 | 404 | 409 | 410 | 422 | 500;
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

/** Bearer parse + requireStaff, then the use case; errors map to the frozen error model. */
async function runStaffRequest<TClient, TBody>(
  authorizationHeader: string | null,
  authGateway: StaffAuthGateway<TClient>,
  successStatus: 200 | 201,
  logLabel: string,
  run: (staff: StaffContext<TClient>) => Promise<TBody>,
): Promise<ApiResult<TBody>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }
  try {
    const staff = await requireStaff(token, authGateway);
    return { status: successStatus, body: await run(staff) };
  } catch (error) {
    return toErrorResult(error, logLabel);
  }
}

/** GET /api/v2/internal/projects/[id]/timeline */
export function handleListProjectTimelineRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  writeGateway: ProjectTimelineWriteGateway<TClient>,
  readGateway: ProjectTimelineGateway<TClient>,
): Promise<ApiResult<{ data: ProjectTimelineItemRecord[] }>> {
  return runStaffRequest(authorizationHeader, authGateway, 200, "[handleListProjectTimelineRequest] Unexpected error", async (staff) => ({
    data: await listProjectTimeline(projectId, staff, writeGateway, readGateway),
  }));
}

/** POST /api/v2/internal/projects/[id]/timeline */
export function handleCreateProjectTimelineItemRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  gateway: ProjectTimelineWriteGateway<TClient>,
): Promise<ApiResult<{ data: ProjectTimelineItemRecord }>> {
  return runStaffRequest(authorizationHeader, authGateway, 201, "[handleCreateProjectTimelineItemRequest] Unexpected error", async (staff) => ({
    data: await createProjectTimelineItem(projectId, rawBody, staff, gateway),
  }));
}

/** PATCH /api/v2/internal/projects/[id]/timeline/[itemId] */
export function handleUpdateProjectTimelineItemRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  itemId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  gateway: ProjectTimelineWriteGateway<TClient>,
): Promise<ApiResult<{ data: ProjectTimelineItemRecord }>> {
  return runStaffRequest(authorizationHeader, authGateway, 200, "[handleUpdateProjectTimelineItemRequest] Unexpected error", async (staff) => ({
    data: await updateProjectTimelineItem(projectId, itemId, rawBody, staff, gateway),
  }));
}

/** DELETE /api/v2/internal/projects/[id]/timeline/[itemId] */
export function handleDeleteProjectTimelineItemRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  itemId: string,
  authGateway: StaffAuthGateway<TClient>,
  gateway: ProjectTimelineWriteGateway<TClient>,
): Promise<ApiResult<{ deleted: true }>> {
  return runStaffRequest(authorizationHeader, authGateway, 200, "[handleDeleteProjectTimelineItemRequest] Unexpected error", (staff) =>
    deleteProjectTimelineItem(projectId, itemId, staff, gateway),
  );
}
