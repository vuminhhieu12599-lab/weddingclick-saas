import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway, type StaffContext } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import {
  createProjectTask,
  deleteProjectTask,
  listAssignableStaff,
  listProjectTasks,
  updateProjectTask,
} from "../project-tasks/manage-project-tasks";
import type { AssignableStaffRecord, ProjectTaskRecord } from "../project-tasks/project-task-types";
import type { ProjectTasksGateway } from "../project-tasks/project-tasks-gateway";

/**
 * Pure, framework-agnostic handlers backing the staff Project Tasks
 * endpoints (Task 034A) — mirrors lib/server/routes/project-timeline.ts.
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

/** GET /api/v2/internal/projects/[id]/tasks */
export function handleListProjectTasksRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  gateway: ProjectTasksGateway<TClient>,
): Promise<ApiResult<{ data: ProjectTaskRecord[] }>> {
  return runStaffRequest(authorizationHeader, authGateway, 200, "[handleListProjectTasksRequest] Unexpected error", async (staff) => ({
    data: await listProjectTasks(projectId, staff, gateway),
  }));
}

/** GET /api/v2/internal/projects/[id]/tasks/assignees */
export function handleListTaskAssigneesRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  gateway: ProjectTasksGateway<TClient>,
): Promise<ApiResult<{ data: AssignableStaffRecord[] }>> {
  return runStaffRequest(authorizationHeader, authGateway, 200, "[handleListTaskAssigneesRequest] Unexpected error", async (staff) => ({
    data: await listAssignableStaff(projectId, staff, gateway),
  }));
}

/** POST /api/v2/internal/projects/[id]/tasks */
export function handleCreateProjectTaskRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  gateway: ProjectTasksGateway<TClient>,
): Promise<ApiResult<{ data: ProjectTaskRecord }>> {
  return runStaffRequest(authorizationHeader, authGateway, 201, "[handleCreateProjectTaskRequest] Unexpected error", async (staff) => ({
    data: await createProjectTask(projectId, rawBody, staff, gateway),
  }));
}

/** PATCH /api/v2/internal/projects/[id]/tasks/[taskId] */
export function handleUpdateProjectTaskRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  taskId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  gateway: ProjectTasksGateway<TClient>,
): Promise<ApiResult<{ data: ProjectTaskRecord }>> {
  return runStaffRequest(authorizationHeader, authGateway, 200, "[handleUpdateProjectTaskRequest] Unexpected error", async (staff) => ({
    data: await updateProjectTask(projectId, taskId, rawBody, staff, gateway),
  }));
}

/** DELETE /api/v2/internal/projects/[id]/tasks/[taskId] */
export function handleDeleteProjectTaskRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  taskId: string,
  authGateway: StaffAuthGateway<TClient>,
  gateway: ProjectTasksGateway<TClient>,
): Promise<ApiResult<{ deleted: true }>> {
  return runStaffRequest(authorizationHeader, authGateway, 200, "[handleDeleteProjectTaskRequest] Unexpected error", (staff) =>
    deleteProjectTask(projectId, taskId, staff, gateway),
  );
}
