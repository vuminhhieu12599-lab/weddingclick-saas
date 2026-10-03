import type { InvitationVariant, PaymentStatus, ProjectStatus } from "../../domain";
import type { ReviewApprovalState } from "../invitation-review/invitation-review-types";

/**
 * Stable reason for a publish CONFLICT (409 + `reason`), so the Xuất bản tab
 * can show the right blocker without parsing message text. Also used as the
 * read model's per-variant blocker.
 */
export type PublishBlockerReason =
  | "LIFECYCLE_NOT_READY"
  | "PAYMENT_NOT_READY"
  | "PROJECT_CLOSED"
  | "NOT_APPROVED"
  | "STALE_REVIEW"
  | "STALE_PUBLISHED_VERSION"
  | "ALREADY_PUBLISHED";

/** The complete browser command: which variant plus two compare-and-set tokens. Nothing authoritative. */
export interface PublishInvitationCommand {
  variant: InvitationVariant;
  /** The approved current REVIEW version the staff member saw. */
  expectedCurrentReviewVersionId: string;
  /** The current publication the staff member saw (`null` = never published). */
  expectedPublishedVersionId: string | null;
}

export interface PublishInvitationParams extends PublishInvitationCommand {
  projectId: string;
}

/** One PUBLISHED `invitation_versions` row created by `publish_invitation` (migration 0038). */
export interface PublishedInvitationVersion {
  id: string;
  invitationId: string;
  projectId: string;
  variant: InvitationVariant;
  versionNumber: number;
  sourceReviewVersionId: string;
  templateVersionId: string;
  rendererKeySnapshot: string;
  publishedAt: string;
  previousPublishedVersionId: string | null;
  /** The Project's persisted status after this publish (PUBLISHED only when every required variant is published). */
  projectStatus: ProjectStatus;
}

/** One PUBLISHED `invitation_versions` row without its payload. */
export interface PublishedVersionSummary {
  id: string;
  invitationId: string;
  projectId: string;
  versionNumber: number;
  sourceReviewVersionId: string;
  templateVersionId: string;
  rendererKeySnapshot: string;
  publishedAt: string;
}

export interface RequiredVariantPublishState {
  variant: InvitationVariant;
  invitationId: string | null;
  currentReview: { id: string; versionNumber: number; createdAt: string; approvalState: ReviewApprovalState } | null;
  publishedVersion: (PublishedVersionSummary & { sourceReviewVersionNumber: number | null }) | null;
  /** The current publication is sourced from the current review version. */
  upToDate: boolean;
  /** Mirrors 0038's preconditions; the RPC remains the authority. */
  canPublish: boolean;
  /** First failing precondition, `null` when publishable. */
  blocker: PublishBlockerReason | "NO_REVIEW" | "REVISION_REQUESTED" | null;
}

export interface ProjectPublishState {
  projectId: string;
  projectStatus: ProjectStatus;
  paymentStatus: PaymentStatus;
  packageCode: string;
  /** `null` when the package code has no canonical variant policy (fail closed). */
  requiredVariants: InvitationVariant[] | null;
  /** Project-level blocker (lifecycle/payment/closed), `null` when the Project is READY_TO_PUBLISH and PAID. */
  projectBlocker: Extract<PublishBlockerReason, "LIFECYCLE_NOT_READY" | "PAYMENT_NOT_READY" | "PROJECT_CLOSED"> | null;
  variants: RequiredVariantPublishState[];
  /** Every required variant's publication is sourced from its current review. */
  allRequiredVariantsPublished: boolean;
}
