import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway, type StaffContext } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import {
  createProjectDressCodeSwatch,
  deleteProjectDressCodeSwatch,
  getProjectDressCodeForStaff,
  saveProjectDressCode,
  updateProjectDressCodeSwatch,
} from "../project-dress-code/manage-project-dress-code";
import type {
  ProjectDressCodeGateway,
  ProjectDressCodeWithSwatches,
} from "../project-dress-code/project-dress-code-gateway";
import type {
  ProjectDressCodeRecord,
  ProjectDressCodeSwatchRecord,
} from "../project-dress-code/project-dress-code-types";
import type { ProjectDressCodeWriteGateway } from "../project-dress-code/project-dress-code-write-gateway";

/**
 * Pure, framework-agnostic handlers backing the staff Dress Code endpoints
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

/** GET /api/v2/internal/projects/[id]/dress-code */
export function handleGetProjectDressCodeRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  writeGateway: ProjectDressCodeWriteGateway<TClient>,
  readGateway: ProjectDressCodeGateway<TClient>,
): Promise<ApiResult<{ data: ProjectDressCodeWithSwatches | null }>> {
  return runStaffRequest(authorizationHeader, authGateway, 200, "[handleGetProjectDressCodeRequest] Unexpected error", async (staff) => ({
    data: await getProjectDressCodeForStaff(projectId, staff, writeGateway, readGateway),
  }));
}

/** PUT /api/v2/internal/projects/[id]/dress-code */
export function handleSaveProjectDressCodeRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  gateway: ProjectDressCodeWriteGateway<TClient>,
): Promise<ApiResult<{ data: ProjectDressCodeRecord }>> {
  return runStaffRequest(authorizationHeader, authGateway, 200, "[handleSaveProjectDressCodeRequest] Unexpected error", async (staff) => ({
    data: await saveProjectDressCode(projectId, rawBody, staff, gateway),
  }));
}

/** POST /api/v2/internal/projects/[id]/dress-code/swatches */
export function handleCreateDressCodeSwatchRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  gateway: ProjectDressCodeWriteGateway<TClient>,
): Promise<ApiResult<{ data: ProjectDressCodeSwatchRecord }>> {
  return runStaffRequest(authorizationHeader, authGateway, 201, "[handleCreateDressCodeSwatchRequest] Unexpected error", async (staff) => ({
    data: await createProjectDressCodeSwatch(projectId, rawBody, staff, gateway),
  }));
}

/** PATCH /api/v2/internal/projects/[id]/dress-code/swatches/[swatchId] */
export function handleUpdateDressCodeSwatchRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  swatchId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  gateway: ProjectDressCodeWriteGateway<TClient>,
): Promise<ApiResult<{ data: ProjectDressCodeSwatchRecord }>> {
  return runStaffRequest(authorizationHeader, authGateway, 200, "[handleUpdateDressCodeSwatchRequest] Unexpected error", async (staff) => ({
    data: await updateProjectDressCodeSwatch(projectId, swatchId, rawBody, staff, gateway),
  }));
}

/** DELETE /api/v2/internal/projects/[id]/dress-code/swatches/[swatchId] */
export function handleDeleteDressCodeSwatchRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  swatchId: string,
  authGateway: StaffAuthGateway<TClient>,
  gateway: ProjectDressCodeWriteGateway<TClient>,
): Promise<ApiResult<{ deleted: true }>> {
  return runStaffRequest(authorizationHeader, authGateway, 200, "[handleDeleteDressCodeSwatchRequest] Unexpected error", (staff) =>
    deleteProjectDressCodeSwatch(projectId, swatchId, staff, gateway),
  );
}
