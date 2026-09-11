import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import { createProject } from "../projects/create-project";
import { getProjectById } from "../projects/get-project";
import { listProjects, type ListProjectsQuery } from "../projects/list-projects";
import type { ProjectGateway } from "../projects/project-gateway";
import type { CreatedProjectRef, ProjectSummary } from "../projects/project-types";

/**
 * Pure, framework-agnostic handlers backing the Project HTTP endpoints
 * (Task 005 reads, Task 005B create) — mirrors lib/server/routes/customers.ts.
 *
 * The create handler reuses the same requireStaff boundary as the read
 * handlers and never uses buildProjectCreationPlan() as persistence input —
 * see lib/server/projects/create-project.ts.
 */
export interface ApiResult<TBody> {
  status: 200 | 201 | 400 | 401 | 403 | 404 | 409 | 500;
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

export async function handleGetProjectRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  projectGateway: ProjectGateway<TClient>,
): Promise<ApiResult<ProjectSummary>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const project = await getProjectById(projectId, staff, projectGateway);
    return { status: 200, body: project };
  } catch (error) {
    return toErrorResult(error, "[handleGetProjectRequest] Unexpected error");
  }
}

export async function handleCreateProjectRequest<TClient>(
  authorizationHeader: string | null,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  projectGateway: ProjectGateway<TClient>,
): Promise<ApiResult<CreatedProjectRef>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const created = await createProject(rawBody, staff, projectGateway);
    return { status: 201, body: created };
  } catch (error) {
    return toErrorResult(error, "[handleCreateProjectRequest] Unexpected error");
  }
}

export async function handleListProjectsRequest<TClient>(
  authorizationHeader: string | null,
  query: ListProjectsQuery,
  authGateway: StaffAuthGateway<TClient>,
  projectGateway: ProjectGateway<TClient>,
): Promise<ApiResult<ProjectSummary[]>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const projects = await listProjects(query, staff, projectGateway);
    return { status: 200, body: projects };
  } catch (error) {
    return toErrorResult(error, "[handleListProjectsRequest] Unexpected error");
  }
}
