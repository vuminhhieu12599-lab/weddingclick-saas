import type { AccessLinkResolutionRepository } from "../supabase/access-link-resolution-repository";
import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import { applyIntakeSubmission } from "../intake/apply-intake-submission";
import { getIntakeSubmissionById } from "../intake/get-intake-submission";
import type { IntakeStaffGateway } from "../intake/intake-staff-gateway";
import type { IntakeSubmitGateway } from "../intake/intake-submit-gateway";
import type {
  ApplyIntakeSubmissionResult,
  IntakeSubmissionRecord,
  RejectIntakeSubmissionResult,
} from "../intake/intake-types";
import { listIntakeSubmissionsByProjectId } from "../intake/list-intake-submissions";
import { rejectIntakeSubmission } from "../intake/reject-intake-submission";
import { submitIntakeSubmission } from "../intake/submit-intake-submission";
import { RateLimitGuardError } from "../rate-limit/rate-limit-error";

/**
 * Pure, framework-agnostic handlers backing the Intake Workflow HTTP
 * endpoints (Task 027 Phase 2) — mirrors lib/server/routes/access-links.ts
 * (Task 026 Phase 3) for the shared no-store/error-mapping conventions.
 */
export interface ApiResult<TBody> {
  status: 200 | 201 | 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500 | 503;
  body: TBody | { error: string };
  headers?: Record<string, string>;
}

/**
 * Frozen Task 027 Phase 2 contract (§2.3/§3/§4/§5/§12): every response from
 * every Task 027 route — success or error — carries this header.
 */
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

interface SubmitIntakeResponseData {
  id: string;
  projectId: string;
  status: string;
  createdAt: string;
}

/**
 * POST /api/v2/public/intake-submissions. Authentication transport is a
 * `Bearer <raw INTAKE token>` — NOT Supabase Auth. A missing header, wrong
 * scheme, or empty bearer credential is UNAUTHENTICATED/401, resolved here
 * before the frozen Task-026 resolver is ever invoked (frozen §2.1 —
 * distinct from every resolver-level failure, which is NOT_FOUND/404 or
 * REVOKED_TOKEN|EXPIRED_TOKEN/410).
 *
 * `readBody` is a lazy callback (never an already-read value — Task 027
 * Phase 2 Independent Review Patch 1, Finding A) so the request body is
 * never touched for any of the auth/resolver failure paths above, and is
 * only ever invoked once token resolution has already succeeded (see
 * submitIntakeSubmission's own ordering guarantee).
 *
 * Task 035A: a post-resolution per-INTAKE-link guard refusal maps to 429
 * (limited) or 503 (limiter store unavailable, fail-closed); nothing is
 * submitted in either case.
 */
export async function handleSubmitIntakeRequest(
  authorizationHeader: string | null,
  readBody: () => Promise<unknown>,
  resolutionRepository: AccessLinkResolutionRepository,
  submitGateway: IntakeSubmitGateway,
): Promise<ApiResult<SubmitIntakeResponseData>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return withNoStore<SubmitIntakeResponseData>({
      status: 401,
      body: { error: "Missing or malformed Authorization header" },
    });
  }

  try {
    const result = await submitIntakeSubmission(
      token,
      readBody,
      resolutionRepository,
      submitGateway,
    );

    return withNoStore({
      status: 201,
      body: {
        id: result.id,
        projectId: result.projectId,
        status: result.status,
        createdAt: result.submittedAt,
      },
    });
  } catch (error) {
    if (error instanceof RateLimitGuardError) {
      return withNoStore<SubmitIntakeResponseData>({ status: error.status, body: { error: error.message } });
    }
    return withNoStore(toErrorResult(error, "[handleSubmitIntakeRequest] Unexpected error"));
  }
}

/** GET /api/v2/internal/projects/[id]/intake-submissions */
export async function handleListIntakeSubmissionsRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  authGateway: StaffAuthGateway<TClient>,
  intakeGateway: IntakeStaffGateway<TClient>,
): Promise<ApiResult<{ data: IntakeSubmissionRecord[] }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return withNoStore<{ data: IntakeSubmissionRecord[] }>({
      status: 401,
      body: { error: "Missing or malformed Authorization header" },
    });
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const data = await listIntakeSubmissionsByProjectId(projectId, staff, intakeGateway);
    return withNoStore({ status: 200, body: { data } });
  } catch (error) {
    return withNoStore(
      toErrorResult(error, "[handleListIntakeSubmissionsRequest] Unexpected error"),
    );
  }
}

/** GET /api/v2/internal/projects/[id]/intake-submissions/[submissionId] */
export async function handleGetIntakeSubmissionRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  submissionId: string,
  authGateway: StaffAuthGateway<TClient>,
  intakeGateway: IntakeStaffGateway<TClient>,
): Promise<ApiResult<{ data: IntakeSubmissionRecord }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return withNoStore<{ data: IntakeSubmissionRecord }>({
      status: 401,
      body: { error: "Missing or malformed Authorization header" },
    });
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const data = await getIntakeSubmissionById(projectId, submissionId, staff, intakeGateway);
    return withNoStore({ status: 200, body: { data } });
  } catch (error) {
    return withNoStore(toErrorResult(error, "[handleGetIntakeSubmissionRequest] Unexpected error"));
  }
}

/**
 * POST /api/v2/internal/projects/[id]/intake-submissions/[submissionId]/apply.
 * Frozen no-body contract (§4): this handler never reads a request body.
 */
export async function handleApplyIntakeSubmissionRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  submissionId: string,
  authGateway: StaffAuthGateway<TClient>,
  intakeGateway: IntakeStaffGateway<TClient>,
): Promise<ApiResult<ApplyIntakeSubmissionResult>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return withNoStore<ApplyIntakeSubmissionResult>({
      status: 401,
      body: { error: "Missing or malformed Authorization header" },
    });
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const result = await applyIntakeSubmission(projectId, submissionId, staff, intakeGateway);
    return withNoStore({ status: 200, body: result });
  } catch (error) {
    return withNoStore(
      toErrorResult(error, "[handleApplyIntakeSubmissionRequest] Unexpected error"),
    );
  }
}

/**
 * POST /api/v2/internal/projects/[id]/intake-submissions/[submissionId]/reject.
 *
 * `readBody` is a lazy callback (Task 027 Phase 2 Independent Review Patch
 * 1, Finding A): the frozen order is transport -> requireStaff -> body
 * parse/validation -> reject RPC, so the request body must never be read
 * for a missing/wrong-scheme/empty-bearer transport failure or for an
 * authenticated-but-non-staff caller — only after `requireStaff` succeeds.
 */
export async function handleRejectIntakeSubmissionRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  submissionId: string,
  readBody: () => Promise<unknown>,
  authGateway: StaffAuthGateway<TClient>,
  intakeGateway: IntakeStaffGateway<TClient>,
): Promise<ApiResult<RejectIntakeSubmissionResult>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return withNoStore<RejectIntakeSubmissionResult>({
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

    const result = await rejectIntakeSubmission(
      projectId,
      submissionId,
      rawBody,
      staff,
      intakeGateway,
    );
    return withNoStore({ status: 200, body: result });
  } catch (error) {
    return withNoStore(
      toErrorResult(error, "[handleRejectIntakeSubmissionRequest] Unexpected error"),
    );
  }
}
