import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import { getProjectPublishState, type ProjectPublishStateDependencies } from "../invitation-publish/get-project-publish-state";
import type { ProjectPublishState, PublishBlockerReason, PublishedInvitationVersion } from "../invitation-publish/invitation-publish-types";
import { publishInvitation, type PublishInvitationDependencies } from "../invitation-publish/publish-invitation";
import { PublishConflictError } from "../invitation-publish/publish-rpc-error-codes";

/**
 * Pure, framework-agnostic handlers for the Task 031 staff publish
 * endpoints (Path A: Bearer → requireStaff → staff-scoped client → RLS).
 * Mirrors lib/server/routes/invitation-review.ts: no-store on every
 * response, fixed generic 500, never raw DB detail. A publish 409 carries
 * a stable `reason`.
 */
export interface PublishApiResult<TBody> {
  status: 200 | 201 | 400 | 401 | 403 | 404 | 409 | 422 | 500;
  body: TBody | { error: string } | { error: string; reason: PublishBlockerReason };
  headers: Record<string, string>;
}

const NO_STORE_HEADERS: Readonly<Record<string, string>> = { "Cache-Control": "no-store" };

function result<TBody>(status: PublishApiResult<TBody>["status"], body: NoInfer<PublishApiResult<TBody>["body"]>): PublishApiResult<TBody> {
  return { status, body, headers: { ...NO_STORE_HEADERS } };
}

function toErrorResult(error: unknown, logLabel: string): PublishApiResult<never> {
  if (error instanceof StaffAuthError) {
    if (error.kind === "UNAUTHENTICATED") {
      return result(401, { error: error.message });
    }
    if (error.kind === "FORBIDDEN") {
      return result(403, { error: error.message });
    }
    return result(500, { error: "Internal server error" });
  }
  if (error instanceof PublishConflictError) {
    return result(409, { error: error.message, reason: error.reason });
  }
  if (error instanceof ApiError) {
    const status = apiErrorStatus(error.kind);
    if (status === 410 || status === 500) {
      return result(500, { error: "Internal server error" });
    }
    return result(status, { error: error.message });
  }
  // DB and integrity failures: fixed label, no detail.
  console.error(logLabel);
  return result(500, { error: "Internal server error" });
}

/** GET /api/v2/internal/projects/[id]/publish */
export async function handleGetProjectPublishStateRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  deps: ProjectPublishStateDependencies<TClient>,
): Promise<PublishApiResult<{ data: ProjectPublishState }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return result(401, { error: "Missing or malformed Authorization header" });
  }
  try {
    const staff = await requireStaff(token, authGateway);
    const data = await getProjectPublishState(projectId, staff, deps);
    return result(200, { data });
  } catch (error) {
    return toErrorResult(error, "[handleGetProjectPublishStateRequest] Unexpected error");
  }
}

/**
 * POST /api/v2/internal/projects/[id]/publish — body `{ variant,
 * expectedCurrentReviewVersionId, expectedPublishedVersionId }` only.
 * 201 only when a PUBLISHED version was actually created. The body is read
 * only after staff auth succeeds.
 */
export async function handlePublishInvitationRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  readBody: () => Promise<unknown>,
  authGateway: StaffAuthGateway<TClient>,
  deps: PublishInvitationDependencies<TClient>,
): Promise<PublishApiResult<{ data: PublishedInvitationVersion }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return result(401, { error: "Missing or malformed Authorization header" });
  }
  try {
    const staff = await requireStaff(token, authGateway);
    let body: unknown;
    try {
      body = await readBody();
    } catch {
      throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
    }
    const data = await publishInvitation(projectId, body, staff, deps);
    return result(201, { data });
  } catch (error) {
    return toErrorResult(error, "[handlePublishInvitationRequest] Unexpected error");
  }
}
