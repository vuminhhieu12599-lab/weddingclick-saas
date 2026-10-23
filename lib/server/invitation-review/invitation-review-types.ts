import type {
  ApprovalChannel,
  InvitationVariant,
  ProjectStatus,
  ReviewFeedbackActorType,
  ReviewFeedbackType,
  ReviewOutcomeStatus,
  ReviewVersionState,
} from "../../domain";

/** One `project_invitations` row (Task 030 read model; columns of migration 0012). */
export interface ProjectInvitationRecord {
  id: string;
  projectId: string;
  variant: InvitationVariant;
  currentReviewVersionId: string | null;
  publishedVersionId: string | null;
}

/** One REVIEW `invitation_versions` row without its payload. */
export interface ReviewVersionSummary {
  id: string;
  invitationId: string;
  projectId: string;
  versionNumber: number;
  templateVersionId: string;
  rendererKeySnapshot: string;
  createdAt: string;
}

/** A REVIEW version together with its persisted, immutable Snapshot payload (unparsed JSON). */
export interface ReviewVersionWithPayload extends ReviewVersionSummary {
  variant: InvitationVariant;
  payload: unknown;
}

/** One append-only `review_feedback` row (migration 0016), as staff read it under RLS. */
export interface ReviewFeedbackSummary {
  id: string;
  invitationVersionId: string;
  feedbackType: ReviewFeedbackType;
  /** Customer text (COMMENT / REVISION_REQUEST required, APPROVAL optional); never staff metadata. */
  message: string | null;
  createdAt: string;
  /** TE-06 (0053): who recorded it. Every pre-0053 row is `CUSTOMER`. */
  actorType: ReviewFeedbackActorType;
  /** TE-06 (0053): how the customer confirmed; non-null only on a STAFF approval. */
  approvalChannel: ApprovalChannel | null;
  /**
   * TE-06 (0053): internal staff note, STAFF rows only. Staff-only by
   * construction — `get_customer_review` never selects this column, so it
   * cannot reach the customer REVIEW surface (TE-03A item 5).
   */
  staffNote: string | null;
}

/**
 * TE-06 — the complete browser command for approval on behalf: which REVIEW
 * version, the compare-and-set token, the mandatory confirmation channel and
 * an optional internal note. Nothing authoritative: the actor is `auth.uid()`
 * inside `staff_confirm_review_approval`, never sent by the browser.
 */
export interface ConfirmReviewApprovalCommand {
  invitationVersionId: string;
  /** The current REVIEW version the staff member saw; a mismatch is a 409. */
  expectedCurrentReviewVersionId: string;
  channel: ApprovalChannel;
  /** Trimmed; blank becomes `null`. Max 2000 chars. */
  note: string | null;
}

export interface ConfirmReviewApprovalParams extends ConfirmReviewApprovalCommand {
  projectId: string;
}

/** The STAFF `APPROVAL` row created by `staff_confirm_review_approval` (migration 0053). */
export interface StaffConfirmedApproval {
  id: string;
  projectId: string;
  invitationVersionId: string;
  variant: InvitationVariant;
  approvalChannel: ApprovalChannel;
  createdAt: string;
  /** The Project's persisted status after the same-transaction outcome recompute. */
  projectStatus: ProjectStatus;
}

/** Server-derived parameters of `create_review_version` (never browser input except the CAS token). */
export interface CreateReviewVersionParams {
  projectId: string;
  variant: InvitationVariant;
  expectedCurrentReviewVersionId: string | null;
  templateVersionId: string;
  rendererKey: string;
  payload: unknown;
  mediaIds: readonly string[];
}

export interface CreatedReviewVersion {
  id: string;
  invitationId: string;
  projectId: string;
  variant: InvitationVariant;
  versionNumber: number;
  templateVersionId: string;
  rendererKeySnapshot: string;
  createdAt: string;
}

/**
 * Review state of one current REVIEW version, from its own feedback rows
 * (lib/domain/review-outcome.ts): REVISION_REQUESTED when a revision
 * request exists (the version still requires replacement — it outranks an
 * APPROVAL on the same version), else APPROVED when an APPROVAL row exists,
 * else AWAITING_FEEDBACK.
 */
export type ReviewApprovalState = ReviewVersionState;

export interface RequiredVariantReviewState {
  variant: InvitationVariant;
  /** `null` until the first review version creates the invitation row. */
  invitationId: string | null;
  currentReview:
    | (ReviewVersionSummary & {
        approvalState: ReviewApprovalState;
        feedbackCount: number;
        /** Feedback on exactly this current version, oldest first. */
        feedback: ReviewFeedbackSummary[];
      })
    | null;
  /** True only when the CURRENT review version itself is APPROVED (and has no revision request). */
  approved: boolean;
  /** True when the CURRENT review version carries a revision request. */
  revisionRequested: boolean;
}

export interface ProjectReviewState {
  projectId: string;
  /** The Project's actual, persisted status (set only by the trusted RPCs). */
  projectStatus: ProjectStatus;
  packageCode: string;
  /** `null` when the package code has no canonical variant policy (fail closed). */
  requiredVariants: InvitationVariant[] | null;
  variants: RequiredVariantReviewState[];
  /** Every required variant is approved on its current review version. Never true when the policy is unknown. */
  allRequiredVariantsApproved: boolean;
  /**
   * Owner precedence over the required variants' CURRENT reviews
   * (REVISION_REQUIRED > APPROVED > CUSTOMER_REVIEW); `null` without a
   * variant policy or before any review exists.
   */
  reviewOutcome: ReviewOutcomeStatus | null;
}
