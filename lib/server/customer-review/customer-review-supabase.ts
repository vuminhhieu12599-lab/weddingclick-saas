import { PRODUCTION_COMPATIBILITY_REGISTRY } from "../../../templates/core/production-renderer-manifests";
import { getServiceRoleAccessLinkResolutionRepository } from "../supabase/access-link-resolution-repository";
import { createServiceRoleCustomerReviewMediaSigner } from "../supabase/customer-review-media-signer";
import { getServiceRoleCustomerReviewGateway } from "../supabase/customer-review-repository";
import type { LoadCustomerReviewDependencies } from "./load-customer-review";
import type { SubmitCustomerReviewFeedbackDependencies } from "./submit-customer-review-feedback";

/**
 * Production wiring for the Task 030B customer REVIEW use cases (Path B).
 * Built per request (no module-scope client or secret). The three
 * service_role-backed pieces stay separate: Task 026 token resolution, the
 * two 0037 RPCs, and CUSTOMER REVIEW MEDIA SIGNING ONLY.
 */
export function createCustomerReviewPageDependencies(): LoadCustomerReviewDependencies {
  return {
    resolution: getServiceRoleAccessLinkResolutionRepository(),
    reviews: getServiceRoleCustomerReviewGateway(),
    signMedia: createServiceRoleCustomerReviewMediaSigner(),
    rendererRegistry: PRODUCTION_COMPATIBILITY_REGISTRY.compatibility,
  };
}

export function createCustomerReviewFeedbackDependencies(): SubmitCustomerReviewFeedbackDependencies {
  return {
    resolution: getServiceRoleAccessLinkResolutionRepository(),
    reviews: getServiceRoleCustomerReviewGateway(),
  };
}
