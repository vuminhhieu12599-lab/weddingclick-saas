import type {
  CustomerReviewAccessContext,
  CustomerReviewRecord,
  SubmitReviewFeedbackParams,
  SubmittedReviewFeedback,
} from "./customer-review-types";

/**
 * Task 030B customer REVIEW persistence seam (Path B). Called only AFTER
 * `resolveAccessLink` validated the raw REVIEW token; receives ids only.
 * Exactly two capabilities, both service_role-only SECURITY DEFINER RPCs
 * (migration 0037) that re-validate the access-link context themselves:
 * no table access, no generic `.rpc()` passthrough.
 */
export interface CustomerReviewGateway {
  getCustomerReview(context: CustomerReviewAccessContext): Promise<CustomerReviewRecord>;
  submitReviewFeedback(params: SubmitReviewFeedbackParams): Promise<SubmittedReviewFeedback>;
}

/**
 * CUSTOMER REVIEW MEDIA SIGNING ONLY. Signs exactly the given pinned
 * storage references (already restricted to one validated REVIEW version's
 * `invitation_version_media` rows) and returns media id → short-lived
 * runtime URL. URLs are never persisted. Missing ids mean "could not sign".
 */
export type CustomerReviewMediaSigner = (media: readonly { id: string; storagePath: string }[]) => Promise<ReadonlyMap<string, string>>;
