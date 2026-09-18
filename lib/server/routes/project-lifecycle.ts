import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import { markProjectPaid } from "../project-lifecycle/mark-project-paid";
import type { ProjectLifecycleGateway } from "../project-lifecycle/project-lifecycle-gateway";
import type {
  MarkPaidResult,
  ReassignStaffResult,
  TransitionStatusResult,
} from "../project-lifecycle/project-lifecycle-types";
import { reassignProjectStaff } from "../project-lifecycle/reassign-project-staff";
import { transitionProjectStatus } from "../project-lifecycle/transition-project-status";

/**
 * Pure, framework-agnostic handlers backing the Project Lifecycle / Payment
 * / Assignment HTTP endpoints (Task 025 Phase 2) — mirrors
 * lib/server/routes/project-events.ts. All three require an active
 * STAFF/ADMIN caller via the same requireStaff boundary; there is no
 * ADMIN-only branch.
 */
export interface ApiResult<TBody> {
  status: 200 | 400 | 401 | 403 | 404 | 409 | 422 | 500;
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

/** PATCH /api/v2/internal/projects/[id]/status */
export async function handleTransitionProjectStatusRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  lifecycleGateway: ProjectLifecycleGateway<TClient>,
): Promise<ApiResult<{ data: TransitionStatusResult }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await transitionProjectStatus(projectId, rawBody, staff, lifecycleGateway);
    return { status: 200, body: { data: result } };
  } catch (error) {
    return toErrorResult(error, "[handleTransitionProjectStatusRequest] Unexpected error");
  }
}

/** PATCH /api/v2/internal/projects/[id]/payment */
export async function handleMarkProjectPaidRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  lifecycleGateway: ProjectLifecycleGateway<TClient>,
): Promise<ApiResult<{ data: MarkPaidResult }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await markProjectPaid(projectId, rawBody, staff, lifecycleGateway);
    return { status: 200, body: { data: result } };
  } catch (error) {
    return toErrorResult(error, "[handleMarkProjectPaidRequest] Unexpected error");
  }
}

/** PATCH /api/v2/internal/projects/[id]/assignment */
export async function handleReassignProjectStaffRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  lifecycleGateway: ProjectLifecycleGateway<TClient>,
): Promise<ApiResult<{ data: ReassignStaffResult }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await reassignProjectStaff(projectId, rawBody, staff, lifecycleGateway);
    return { status: 200, body: { data: result } };
  } catch (error) {
    return toErrorResult(error, "[handleReassignProjectStaffRequest] Unexpected error");
  }
}
