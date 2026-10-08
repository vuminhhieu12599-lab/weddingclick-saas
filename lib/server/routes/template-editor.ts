import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway, type StaffContext } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import { listTemplateMediaSlots } from "../template-media/list-template-media-slots";
import { setTemplateMediaSlot, type SetTemplateMediaSlotDependencies } from "../template-media/set-template-media-slot";
import type { TemplateMediaSlotGateway } from "../template-media/template-media-slot-gateway";
import type { TemplateMediaSlotItem } from "../template-media/template-media-slot-types";
import type { EditorReadiness } from "../template-editor/editor-readiness";
import { loadEditorReadiness, type EditorReadinessDependencies } from "../template-editor/load-editor-readiness";
import { listPhotoLibrary, type PhotoLibraryDependencies, type PhotoLibraryItem } from "../template-editor/photo-library";

/**
 * TE-05A — pure, framework-agnostic handlers for the Staff template-first
 * editor: template media slots (GET/PUT), the Project photo library (GET)
 * and editor readiness (GET). Bearer Staff auth first; a PUT body is read
 * only after auth succeeds. Every response is no-store. ApiErrors map by
 * kind; anything else is a generic 500 (no SQL/Postgres detail).
 */
export interface TemplateEditorApiResult<TBody> {
  status: 200 | 400 | 401 | 403 | 404 | 409 | 410 | 422 | 500;
  body: TBody | { error: string };
  headers: Record<string, string>;
}

const NO_STORE_HEADERS: Readonly<Record<string, string>> = { "Cache-Control": "no-store" };

function respond<T>(status: TemplateEditorApiResult<T>["status"], body: T): TemplateEditorApiResult<T> {
  return { status, body, headers: { ...NO_STORE_HEADERS } };
}

function respondError<T>(status: TemplateEditorApiResult<T>["status"], error: string): TemplateEditorApiResult<T> {
  return { status, body: { error }, headers: { ...NO_STORE_HEADERS } };
}

function toErrorResult<T>(error: unknown, logLabel: string): TemplateEditorApiResult<T> {
  if (error instanceof StaffAuthError) {
    if (error.kind === "UNAUTHENTICATED") return respondError(401, error.message);
    if (error.kind === "FORBIDDEN") return respondError(403, error.message);
    return respondError(500, "Internal server error");
  }
  if (error instanceof ApiError && error.kind !== "INTERNAL") {
    return respondError(apiErrorStatus(error.kind), error.message);
  }
  console.error(logLabel);
  return respondError(500, "Internal server error");
}

async function runStaff<TClient, TBody>(
  authorizationHeader: string | null,
  authGateway: StaffAuthGateway<TClient>,
  logLabel: string,
  run: (staff: StaffContext<TClient>) => Promise<TBody>,
): Promise<TemplateEditorApiResult<TBody>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) return respondError(401, "Missing or malformed Authorization header");
  try {
    const staff = await requireStaff(token, authGateway);
    return respond(200, await run(staff));
  } catch (error) {
    return toErrorResult<TBody>(error, logLabel);
  }
}

/** GET /api/v2/internal/projects/[id]/template-media-slots?templateVersionId=<uuid> */
export function handleListTemplateMediaSlotsRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  templateVersionId: string | null,
  authGateway: StaffAuthGateway<TClient>,
  slots: TemplateMediaSlotGateway<TClient>,
): Promise<TemplateEditorApiResult<{ data: TemplateMediaSlotItem[] }>> {
  return runStaff(authorizationHeader, authGateway, "[handleListTemplateMediaSlotsRequest] Unexpected error", async (staff) => {
    if (templateVersionId === null) {
      throw new ApiError("BAD_REQUEST", "templateVersionId query parameter is required");
    }
    return { data: await listTemplateMediaSlots(projectId, templateVersionId, staff, slots) };
  });
}

/** PUT /api/v2/internal/projects/[id]/template-media-slots — body `{ templateVersionId, slotKey, projectMediaIds }`. */
export function handleSetTemplateMediaSlotRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  readBody: () => Promise<unknown>,
  authGateway: StaffAuthGateway<TClient>,
  deps: SetTemplateMediaSlotDependencies<TClient>,
): Promise<TemplateEditorApiResult<{ data: TemplateMediaSlotItem[] }>> {
  return runStaff(authorizationHeader, authGateway, "[handleSetTemplateMediaSlotRequest] Unexpected error", async (staff) => {
    let body: unknown;
    try {
      body = await readBody();
    } catch {
      throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
    }
    return { data: await setTemplateMediaSlot(projectId, body, staff, deps) };
  });
}

/** GET /api/v2/internal/projects/[id]/photo-library */
export function handleListPhotoLibraryRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  deps: PhotoLibraryDependencies<TClient>,
): Promise<TemplateEditorApiResult<{ data: PhotoLibraryItem[] }>> {
  return runStaff(authorizationHeader, authGateway, "[handleListPhotoLibraryRequest] Unexpected error", async (staff) => ({
    data: await listPhotoLibrary(projectId, staff, deps),
  }));
}

/** GET /api/v2/internal/projects/[id]/editor-readiness */
export function handleEditorReadinessRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  deps: EditorReadinessDependencies<TClient>,
): Promise<TemplateEditorApiResult<{ data: EditorReadiness }>> {
  return runStaff(authorizationHeader, authGateway, "[handleEditorReadinessRequest] Unexpected error", async (staff) => ({
    data: await loadEditorReadiness(projectId, staff, deps),
  }));
}
