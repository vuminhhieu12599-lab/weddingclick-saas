import { parseBearerToken } from "../auth/bearer-token";
import { CustomerReviewConflictError, type CustomerReviewConflictReason } from "../customer-review/customer-review-rpc-error-codes";
import type { SubmittedReviewFeedback } from "../customer-review/customer-review-types";
import {
  submitCustomerReviewFeedback,
  type SubmitCustomerReviewFeedbackDependencies,
} from "../customer-review/submit-customer-review-feedback";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import { RateLimitGuardError } from "../rate-limit/rate-limit-error";

/**
 * Framework-agnostic handler for the Task 030B customer REVIEW feedback
 * endpoint (Path B — `Authorization: Bearer <raw REVIEW token>`, never a
 * Supabase session). Mirrors lib/server/routes/intake.ts: no-store on
 * every response, fixed generic 500, never raw DB/token detail. A 409
 * carries a stable `reason` for the customer UI. 429 / 503 come from the
 * Task 035A post-resolution per-link guard.
 */
export interface CustomerReviewApiResult<TBody> {
  status: 201 | 400 | 401 | 404 | 409 | 410 | 429 | 500 | 503;
  body: TBody | { error: string } | { error: string; reason: CustomerReviewConflictReason };
  headers: Record<string, string>;
}

const NO_STORE_HEADERS: Readonly<Record<string, string>> = { "Cache-Control": "no-store" };

type SubmitFeedbackResult = CustomerReviewApiResult<{ data: SubmittedReviewFeedback }>;

function result(status: SubmitFeedbackResult["status"], body: SubmitFeedbackResult["body"]): SubmitFeedbackResult {
  return { status, body, headers: { ...NO_STORE_HEADERS } };
}

export async function handleSubmitReviewFeedbackRequest(
  authorizationHeader: string | null,
  readBody: () => Promise<unknown>,
  deps: SubmitCustomerReviewFeedbackDependencies,
): Promise<SubmitFeedbackResult> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return result(401, { error: "Missing or malformed Authorization header" });
  }
  try {
    const data = await submitCustomerReviewFeedback(token, readBody, deps);
    return result(201, { data });
  } catch (error) {
    if (error instanceof RateLimitGuardError) {
      return result(error.status, { error: error.message });
    }
    if (error instanceof CustomerReviewConflictError) {
      return result(409, { error: error.message, reason: error.reason });
    }
    if (error instanceof ApiError) {
      const status = apiErrorStatus(error.kind);
      if (status === 400 || status === 404 || status === 410) {
        return result(status, { error: error.message });
      }
    }
    console.error("[handleSubmitReviewFeedbackRequest] Unexpected error");
    return result(500, { error: "Internal server error" });
  }
}
