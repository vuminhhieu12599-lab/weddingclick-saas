import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import { createUploadIntent } from "../media/create-upload-intent";
import { deleteProjectMedia } from "../media/delete-project-media";
import { finalizeMedia } from "../media/finalize-media";
import { listProjectMedia } from "../media/list-project-media";
import type { MediaGateway } from "../media/media-gateway";
import type {
  DeleteProjectMediaResult,
  FinalizeMediaResult,
  ProjectMediaRecord,
  UpdateProjectMediaResult,
  UploadIntentResult,
} from "../media/media-types";
import { updateProjectMedia } from "../media/update-project-media";

/**
 * Pure, framework-agnostic handlers backing the Project Media upload
 * endpoints (Task 024 Phase 2) — mirrors lib/server/routes/project-events.ts.
 * Both handlers only ever parse a small JSON body; neither reads or
 * proxies a file body (Task 024 Phase 2 §0 — Next.js handles JSON only).
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

/** POST /api/v2/internal/projects/[id]/media/upload-intent */
export async function handleCreateMediaUploadIntentRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  mediaGateway: MediaGateway<TClient>,
): Promise<ApiResult<UploadIntentResult>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await createUploadIntent(projectId, rawBody, staff, mediaGateway);
    return { status: 200, body: result };
  } catch (error) {
    return toErrorResult(error, "[handleCreateMediaUploadIntentRequest] Unexpected error");
  }
}

/** POST /api/v2/internal/projects/[id]/media/finalize */
export async function handleFinalizeMediaRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  mediaGateway: MediaGateway<TClient>,
): Promise<ApiResult<FinalizeMediaResult>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await finalizeMedia(projectId, rawBody, staff, mediaGateway);
    return { status: 201, body: result };
  } catch (error) {
    return toErrorResult(error, "[handleFinalizeMediaRequest] Unexpected error");
  }
}

/** GET /api/v2/internal/projects/[id]/media (Task 024 Phase 3). */
export async function handleListProjectMediaRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  mediaGateway: MediaGateway<TClient>,
): Promise<ApiResult<{ data: ProjectMediaRecord[] }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const data = await listProjectMedia(projectId, staff, mediaGateway);
    return { status: 200, body: { data } };
  } catch (error) {
    return toErrorResult(error, "[handleListProjectMediaRequest] Unexpected error");
  }
}

/** PATCH /api/v2/internal/projects/[id]/media/[mediaId] (Task 024 Phase 3). */
export async function handleUpdateProjectMediaRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  mediaId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  mediaGateway: MediaGateway<TClient>,
): Promise<ApiResult<UpdateProjectMediaResult>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await updateProjectMedia(projectId, mediaId, rawBody, staff, mediaGateway);
    return { status: 200, body: result };
  } catch (error) {
    return toErrorResult(error, "[handleUpdateProjectMediaRequest] Unexpected error");
  }
}

/** DELETE /api/v2/internal/projects/[id]/media/[mediaId] (Task 024 Phase 3). */
export async function handleDeleteProjectMediaRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  mediaId: string,
  authGateway: StaffAuthGateway<TClient>,
  mediaGateway: MediaGateway<TClient>,
): Promise<ApiResult<DeleteProjectMediaResult>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await deleteProjectMedia(projectId, mediaId, staff, mediaGateway);
    return { status: 200, body: result };
  } catch (error) {
    return toErrorResult(error, "[handleDeleteProjectMediaRequest] Unexpected error");
  }
}
