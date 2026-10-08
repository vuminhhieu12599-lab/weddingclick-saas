import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import { getProjectDesignByProjectId } from "../project-design/get-project-design";
import type { ProjectDesignGateway } from "../project-design/project-design-gateway";
import type { ProjectDesignRecord } from "../project-design/project-design-types";
import { saveProjectDesign } from "../project-design/save-project-design";
import type { TemplateEditorManifestV1 } from "../../../templates/core/editor-manifest";

/**
 * Pure, framework-agnostic handlers backing the Project Design HTTP
 * endpoints (Task 028) — mirrors lib/server/routes/intake.ts's shared
 * no-store/lazy-body/error-mapping conventions.
 */
export interface ApiResult<TBody> {
  status: 200 | 400 | 401 | 403 | 404 | 409 | 410 | 422 | 500;
  body: TBody | { error: string };
  headers?: Record<string, string>;
}

/** Task 028 closure §14/T28-D13: every response from every Task 028 route carries this header. */
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

/** GET /api/v2/internal/projects/[id]/design */
export async function handleGetProjectDesignRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  projectDesignGateway: ProjectDesignGateway<TClient>,
): Promise<ApiResult<{ data: ProjectDesignRecord | null }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return withNoStore<{ data: ProjectDesignRecord | null }>({
      status: 401,
      body: { error: "Missing or malformed Authorization header" },
    });
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const data = await getProjectDesignByProjectId(projectId, staff, projectDesignGateway);
    return withNoStore({ status: 200, body: { data } });
  } catch (error) {
    return withNoStore(toErrorResult(error, "[handleGetProjectDesignRequest] Unexpected error"));
  }
}

/**
 * PUT /api/v2/internal/projects/[id]/design.
 *
 * `readBody` is a lazy callback (never an already-read value — Task 028
 * closure §2/§10, mirrors Task 027 Phase 2's Finding A) so the request body
 * is never touched for a missing/wrong-scheme/expired-token transport
 * failure or for an authenticated-but-non-staff caller — only invoked once
 * `requireStaff` has already succeeded.
 */
export async function handleSaveProjectDesignRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  readBody: () => Promise<unknown>,
  authGateway: StaffAuthGateway<TClient>,
  projectDesignGateway: ProjectDesignGateway<TClient>,
  lookupEditorManifest: (rendererKey: string) => TemplateEditorManifestV1 | undefined,
): Promise<ApiResult<{ data: ProjectDesignRecord }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return withNoStore<{ data: ProjectDesignRecord }>({
      status: 401,
      body: { error: "Missing or malformed Authorization header" },
    });
  }

  try {
    const staff = await requireStaff(token, authGateway);

    let rawBody: unknown;
    try {
      rawBody = await readBody();
    } catch {
      throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
    }

    const data = await saveProjectDesign(projectId, rawBody, staff, projectDesignGateway, lookupEditorManifest);
    return withNoStore({ status: 200, body: { data } });
  } catch (error) {
    return withNoStore(toErrorResult(error, "[handleSaveProjectDesignRequest] Unexpected error"));
  }
}
