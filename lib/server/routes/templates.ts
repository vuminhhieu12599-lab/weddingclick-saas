import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { listTemplates } from "../templates/list-templates";
import type { TemplatesGateway } from "../templates/templates-gateway";
import type { TemplateCatalogEntry } from "../templates/templates-types";
import type { TemplateEditorManifestV1 } from "../../../templates/core/editor-manifest";

/**
 * Pure, framework-agnostic handler backing the Template Catalog HTTP
 * endpoint (Task 028) — mirrors lib/server/routes/project-design.ts's
 * shared no-store/error-mapping conventions.
 */
export interface ApiResult<TBody> {
  status: 200 | 401 | 403 | 500;
  body: TBody | { error: string };
  headers?: Record<string, string>;
}

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
    // This read-only catalog path never throws a non-INTERNAL ApiError
    // (requireStaff throws StaffAuthError, listTemplates throws only plain
    // Error) — any ApiError reaching here is itself unexpected.
    console.error(logLabel);
    return { status: 500, body: { error: "Internal server error" } };
  }

  console.error(logLabel);
  return { status: 500, body: { error: "Internal server error" } };
}

/** GET /api/v2/internal/templates */
export async function handleListTemplatesRequest<TClient>(
  authorizationHeader: string | null,
  authGateway: StaffAuthGateway<TClient>,
  templatesGateway: TemplatesGateway<TClient>,
  lookupEditorManifest: (rendererKey: string) => TemplateEditorManifestV1 | undefined,
): Promise<ApiResult<{ data: TemplateCatalogEntry[] }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return withNoStore<{ data: TemplateCatalogEntry[] }>({
      status: 401,
      body: { error: "Missing or malformed Authorization header" },
    });
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const data = await listTemplates(staff, templatesGateway, lookupEditorManifest);
    return withNoStore({ status: 200, body: { data } });
  } catch (error) {
    return withNoStore(toErrorResult(error, "[handleListTemplatesRequest] Unexpected error"));
  }
}
