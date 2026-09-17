import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import { createProjectEvent } from "../project-events/create-project-event";
import { deleteProjectEvent } from "../project-events/delete-project-event";
import { listProjectEventsByProjectId } from "../project-events/list-project-events";
import type { ProjectEventsGateway } from "../project-events/project-events-gateway";
import type {
  CreateProjectEventResult,
  ProjectEventRecord,
  UpdateProjectEventResult,
} from "../project-events/project-events-types";
import { updateProjectEvent } from "../project-events/update-project-event";

/**
 * Pure, framework-agnostic handlers backing the Project Events HTTP
 * endpoints (Task 023) — mirrors lib/server/routes/wedding-details.ts.
 */
export interface ApiResult<TBody> {
  status: 200 | 201 | 400 | 401 | 403 | 404 | 409 | 422 | 500;
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

/** GET /api/v2/internal/projects/[id]/events */
export async function handleListProjectEventsRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  eventsGateway: ProjectEventsGateway<TClient>,
): Promise<ApiResult<{ data: ProjectEventRecord[] }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const data = await listProjectEventsByProjectId(projectId, staff, eventsGateway);
    return { status: 200, body: { data } };
  } catch (error) {
    return toErrorResult(error, "[handleListProjectEventsRequest] Unexpected error");
  }
}

/** POST /api/v2/internal/projects/[id]/events */
export async function handleCreateProjectEventRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  eventsGateway: ProjectEventsGateway<TClient>,
): Promise<ApiResult<CreateProjectEventResult>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await createProjectEvent(projectId, rawBody, staff, eventsGateway);
    return { status: 201, body: result };
  } catch (error) {
    return toErrorResult(error, "[handleCreateProjectEventRequest] Unexpected error");
  }
}

/** PUT /api/v2/internal/projects/[id]/events/[eventId] */
export async function handleUpdateProjectEventRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  eventId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  eventsGateway: ProjectEventsGateway<TClient>,
): Promise<ApiResult<UpdateProjectEventResult>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await updateProjectEvent(
      projectId,
      eventId,
      rawBody,
      staff,
      eventsGateway,
    );
    return { status: 200, body: result };
  } catch (error) {
    return toErrorResult(error, "[handleUpdateProjectEventRequest] Unexpected error");
  }
}

/** DELETE /api/v2/internal/projects/[id]/events/[eventId] */
export async function handleDeleteProjectEventRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  eventId: string,
  authGateway: StaffAuthGateway<TClient>,
  eventsGateway: ProjectEventsGateway<TClient>,
): Promise<ApiResult<{ deleted: true }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    await deleteProjectEvent(projectId, eventId, staff, eventsGateway);
    return { status: 200, body: { deleted: true } };
  } catch (error) {
    return toErrorResult(error, "[handleDeleteProjectEventRequest] Unexpected error");
  }
}
