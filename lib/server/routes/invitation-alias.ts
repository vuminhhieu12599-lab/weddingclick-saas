import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import { assignInvitationPublicAlias, type AssignInvitationAliasDependencies } from "../invitation-alias/assign-invitation-public-alias";
import { InvitationAliasConflictError, InvitationAliasUnderivableError } from "../invitation-alias/invitation-alias-rpc-error-codes";
import type {
  AssignedInvitationAlias,
  InvitationAliasConflictReason,
  InvitationAliasInvariantReason,
} from "../invitation-alias/invitation-alias-types";

/**
 * Pure handler for `POST /api/v2/internal/projects/[id]/public-aliases`
 * (LAUNCH-P0-02; Path A: Bearer → requireStaff → staff-scoped client →
 * 0049 RPC). no-store, fixed generic 500, never raw DB detail. A 409
 * carries `reason` and the attempted `alias`; an underivable default is
 * 422 `reason: "ALIAS_UNDERIVABLE"`.
 */
export interface InvitationAliasApiResult {
  status: 201 | 400 | 401 | 403 | 404 | 409 | 422 | 500;
  body:
    | { data: AssignedInvitationAlias }
    | { error: string }
    | { error: string; reason: InvitationAliasConflictReason; alias: string }
    | { error: string; reason: InvitationAliasInvariantReason };
  headers: Record<string, string>;
}

function result(status: InvitationAliasApiResult["status"], body: InvitationAliasApiResult["body"]): InvitationAliasApiResult {
  return { status, body, headers: { "Cache-Control": "no-store" } };
}

function toErrorResult(error: unknown): InvitationAliasApiResult {
  if (error instanceof StaffAuthError) {
    if (error.kind === "UNAUTHENTICATED") return result(401, { error: error.message });
    if (error.kind === "FORBIDDEN") return result(403, { error: error.message });
    return result(500, { error: "Internal server error" });
  }
  if (error instanceof InvitationAliasConflictError) {
    return result(409, { error: error.message, reason: error.reason, alias: error.alias });
  }
  if (error instanceof InvitationAliasUnderivableError) {
    return result(422, { error: error.message, reason: error.reason });
  }
  if (error instanceof ApiError) {
    const status = apiErrorStatus(error.kind);
    if (status === 400 || status === 403 || status === 404 || status === 409 || status === 422) {
      return result(status, { error: error.message });
    }
    return result(500, { error: "Internal server error" });
  }
  console.error("[handleAssignInvitationAliasRequest] Unexpected error");
  return result(500, { error: "Internal server error" });
}

export async function handleAssignInvitationAliasRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  readBody: () => Promise<unknown>,
  authGateway: StaffAuthGateway<TClient>,
  deps: AssignInvitationAliasDependencies<TClient>,
): Promise<InvitationAliasApiResult> {
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
    const data = await assignInvitationPublicAlias(projectId, body, staff, deps);
    return result(201, { data });
  } catch (error) {
    return toErrorResult(error);
  }
}
