import { REVIEW_FEEDBACK_TYPES, type ReviewFeedbackType } from "../../domain";
import { resolveAccessLink } from "../access-links/resolve-access-link";
import { ApiError } from "../errors/api-error";
import type { AccessLinkResolutionRepository } from "../supabase/access-link-resolution-repository";
import { isValidUuid } from "../validation/uuid";
import type { CustomerReviewGateway } from "./customer-review-gateway";
import type { SubmittedReviewFeedback } from "./customer-review-types";

export interface SubmitCustomerReviewFeedbackDependencies {
  resolution: AccessLinkResolutionRepository;
  reviews: Pick<CustomerReviewGateway, "submitReviewFeedback">;
  now?: () => Date;
}

const ALLOWED_KEYS = new Set(["invitationVersionId", "feedbackType", "message"]);
export const REVIEW_FEEDBACK_MESSAGE_MAX_LENGTH = 2000;

/** Strict client-input validation (usability + trust boundary); the RPC re-validates everything. */
export function parseReviewFeedbackBody(body: unknown): { invitationVersionId: string; feedbackType: ReviewFeedbackType; message: string | null } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_KEYS.has(key))) {
    throw new ApiError("BAD_REQUEST", "Request body contains an unknown field");
  }
  const { invitationVersionId, feedbackType, message } = record;
  if (typeof invitationVersionId !== "string" || !isValidUuid(invitationVersionId)) {
    throw new ApiError("BAD_REQUEST", "invitationVersionId must be a valid UUID");
  }
  if (typeof feedbackType !== "string" || !(REVIEW_FEEDBACK_TYPES as readonly string[]).includes(feedbackType)) {
    throw new ApiError("BAD_REQUEST", "feedbackType is not recognized");
  }
  if (message !== undefined && message !== null && typeof message !== "string") {
    throw new ApiError("BAD_REQUEST", "message must be a string");
  }
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (trimmed.length > REVIEW_FEEDBACK_MESSAGE_MAX_LENGTH) {
    throw new ApiError("BAD_REQUEST", "message must be 2000 characters or fewer");
  }
  if (trimmed === "" && feedbackType !== "APPROVAL") {
    throw new ApiError("BAD_REQUEST", "message is required for this feedback type");
  }
  return { invitationVersionId, feedbackType: feedbackType as ReviewFeedbackType, message: trimmed === "" ? null : trimmed };
}

/**
 * Customer REVIEW feedback (Task 030B, Path B). Order: token resolution
 * (Task 026 resolver) → body read/validation → ONE atomic service_role RPC
 * (`submit_review_feedback`, migration 0037) that re-validates the link,
 * binds to the exact CURRENT review, appends feedback and sets the Project
 * review status in the same transaction. The browser never sends a status,
 * project id or access-link id; success is returned only after the RPC
 * confirmed persistence.
 */
export async function submitCustomerReviewFeedback(
  rawToken: string,
  readBody: () => Promise<unknown>,
  deps: SubmitCustomerReviewFeedbackDependencies,
): Promise<SubmittedReviewFeedback> {
  const context = await resolveAccessLink({ rawToken, expectedLinkType: "REVIEW" }, deps.resolution, deps.now);

  let body: unknown;
  try {
    body = await readBody();
  } catch {
    throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
  }
  const input = parseReviewFeedbackBody(body);

  const result = await deps.reviews.submitReviewFeedback({
    projectId: context.projectId,
    accessLinkId: context.accessLinkId,
    ...input,
  });
  if (result.invitationVersionId !== input.invitationVersionId || result.feedbackType !== input.feedbackType) {
    throw new Error("Submitted review feedback does not match the request");
  }
  return result;
}
