import type { InvitationViewModel } from "../../invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../invitation-rendering/renderer-selection";
import type { SnapshotPayloadIssue } from "../../invitation-rendering/snapshot-payload-types";
import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import {
  buildReviewVersionPreview,
  type ReviewVersionPreviewDependencies,
} from "../invitation-review/build-review-version-preview";
import { createReviewVersion, type CreateReviewVersionDependencies } from "../invitation-review/create-review-version";
import { getProjectReviewState, type ProjectReviewStateDependencies } from "../invitation-review/get-project-review-state";
import type { CreatedReviewVersion, ProjectReviewState, ReviewVersionSummary } from "../invitation-review/invitation-review-types";

/**
 * Pure, framework-agnostic handlers for the Task 030 staff review
 * endpoints (Path A: Bearer → requireStaff → staff-scoped client → RLS).
 * Mirrors lib/server/routes/invitation-preview.ts: no-store on every
 * response, fixed generic 500 for unexpected failures, never raw DB detail.
 */
export interface ReviewApiResult<TBody> {
  status: 200 | 201 | 400 | 401 | 403 | 404 | 409 | 422 | 500;
  body: TBody | { error: string } | { error: string; issues: SnapshotPayloadIssue[] };
  headers?: Record<string, string>;
}

export interface ReviewVersionPreviewBody {
  status: "READY";
  version: ReviewVersionSummary;
  rendererKey: string;
  viewModel: InvitationViewModel;
  sections: RendererEffectiveSections;
}

const NO_STORE_HEADERS: Readonly<Record<string, string>> = { "Cache-Control": "no-store" };

function withNoStore<T>(result: ReviewApiResult<T>): ReviewApiResult<T> {
  return { ...result, headers: { ...NO_STORE_HEADERS, ...result.headers } };
}

function toErrorResult(error: unknown, logLabel: string): ReviewApiResult<never> {
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
    const status = apiErrorStatus(error.kind);
    if (status === 410 || status === 500) {
      return { status: 500, body: { error: "Internal server error" } };
    }
    return { status, body: { error: error.message } };
  }
  // DB, loader, invariant and renderer failures: fixed label, no detail.
  console.error(logLabel);
  return { status: 500, body: { error: "Internal server error" } };
}

function missingToken(): ReviewApiResult<never> {
  return withNoStore<never>({ status: 401, body: { error: "Missing or malformed Authorization header" } });
}

/** GET /api/v2/internal/projects/[id]/review */
export async function handleGetProjectReviewStateRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  deps: ProjectReviewStateDependencies<TClient>,
): Promise<ReviewApiResult<{ data: ProjectReviewState }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return missingToken();
  }
  try {
    const staff = await requireStaff(token, authGateway);
    const data = await getProjectReviewState(projectId, staff, deps);
    return withNoStore({ status: 200, body: { data } });
  } catch (error) {
    return withNoStore(toErrorResult(error, "[handleGetProjectReviewStateRequest] Unexpected error"));
  }
}

/**
 * POST /api/v2/internal/projects/[id]/review/versions — body
 * `{ variant, expectedCurrentReviewVersionId }` only. 201 on creation;
 * BLOCKED canonical data is 422 with the frozen builder issues and
 * nothing written. The body is read only after staff auth succeeds.
 */
export async function handleCreateReviewVersionRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  readBody: () => Promise<unknown>,
  authGateway: StaffAuthGateway<TClient>,
  deps: CreateReviewVersionDependencies<TClient>,
): Promise<ReviewApiResult<{ data: CreatedReviewVersion }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return missingToken();
  }
  try {
    const staff = await requireStaff(token, authGateway);
    let body: unknown;
    try {
      body = await readBody();
    } catch {
      throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
    }
    const result = await createReviewVersion(projectId, body, staff, deps);
    if (result.status === "BLOCKED") {
      return withNoStore<{ data: CreatedReviewVersion }>({
        status: 422,
        body: { error: "Canonical invitation data is not ready for review", issues: result.issues },
      });
    }
    return withNoStore({ status: 201, body: { data: result.version } });
  } catch (error) {
    return withNoStore(toErrorResult(error, "[handleCreateReviewVersionRequest] Unexpected error"));
  }
}

/** GET /api/v2/internal/projects/[id]/review/versions/[versionId]/preview */
export async function handleGetReviewVersionPreviewRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  versionId: string,
  authGateway: StaffAuthGateway<TClient>,
  deps: ReviewVersionPreviewDependencies<TClient>,
): Promise<ReviewApiResult<{ data: ReviewVersionPreviewBody }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return missingToken();
  }
  try {
    const staff = await requireStaff(token, authGateway);
    const preview = await buildReviewVersionPreview(projectId, versionId, staff, deps);
    return withNoStore({ status: 200, body: { data: { status: "READY", ...preview } } });
  } catch (error) {
    return withNoStore(toErrorResult(error, "[handleGetReviewVersionPreviewRequest] Unexpected error"));
  }
}
