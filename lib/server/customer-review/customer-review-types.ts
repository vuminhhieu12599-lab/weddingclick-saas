import type { InvitationVariant, ProjectStatus, ReviewFeedbackType, ReviewVersionState } from "../../domain";
import type { InvitationViewModel } from "../../invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../invitation-rendering/renderer-selection";

/**
 * Validated REVIEW access-link context (Task 026 resolver output). Only ids
 * — never the raw token, its hash or hint — ever reach the gateway.
 */
export interface CustomerReviewAccessContext {
  projectId: string;
  accessLinkId: string;
}

/**
 * A `project_media` storage reference pinned to one REVIEW version through
 * `invitation_version_media` (returned only by `get_customer_review`).
 * Server-only: never sent to the browser, templates or the ViewModel.
 */
export interface PinnedReviewMedia {
  id: string;
  storageBucket: string;
  storagePath: string;
  width: number | null;
  height: number | null;
}

/** Customer-visible feedback on a current review version (no staff/link metadata). */
export interface CustomerReviewFeedbackItem {
  id: string;
  feedbackType: ReviewFeedbackType;
  message: string | null;
  createdAt: string;
}

/** One required variant's CURRENT REVIEW version, exactly as persisted. */
export interface CustomerReviewVersionRecord {
  id: string;
  invitationId: string;
  versionNumber: number;
  templateVersionId: string;
  rendererKey: string;
  createdAt: string;
  /** Persisted, immutable Snapshot Payload v1 (unparsed). */
  payload: unknown;
  media: PinnedReviewMedia[];
  feedback: CustomerReviewFeedbackItem[];
}

/** `get_customer_review` result (migration 0037), shape-checked by the repository. */
export interface CustomerReviewRecord {
  projectId: string;
  projectStatus: ProjectStatus;
  hasVariantPolicy: boolean;
  feedbackOpen: boolean;
  variants: { variant: InvitationVariant; review: CustomerReviewVersionRecord | null }[];
}

/** Renderer-ready customer view of one required variant. Contains runtime URLs only inside `viewModel`. */
export interface CustomerReviewVariantView {
  variant: InvitationVariant;
  review: {
    id: string;
    versionNumber: number;
    createdAt: string;
    state: ReviewVersionState;
    feedback: CustomerReviewFeedbackItem[];
    rendererKey: string;
    viewModel: InvitationViewModel;
    sections: RendererEffectiveSections;
  } | null;
}

export interface CustomerReviewView {
  projectStatus: ProjectStatus;
  hasVariantPolicy: boolean;
  feedbackOpen: boolean;
  variants: CustomerReviewVariantView[];
}

export interface SubmitReviewFeedbackParams extends CustomerReviewAccessContext {
  invitationVersionId: string;
  feedbackType: ReviewFeedbackType;
  message: string | null;
}

export interface SubmittedReviewFeedback {
  id: string;
  invitationVersionId: string;
  feedbackType: ReviewFeedbackType;
  createdAt: string;
  projectStatus: ProjectStatus;
}
