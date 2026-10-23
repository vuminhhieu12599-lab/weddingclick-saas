import type {
  ConfirmReviewApprovalParams,
  CreateReviewVersionParams,
  CreatedReviewVersion,
  ProjectInvitationRecord,
  ReviewFeedbackSummary,
  ReviewVersionSummary,
  ReviewVersionWithPayload,
  StaffConfirmedApproval,
} from "./invitation-review-types";

/**
 * Task 030 review persistence seam. Always called with a staff-scoped
 * client: reads are DIRECT RLS SELECTs (`is_staff()`), and the only writes
 * are the audited `create_review_version` (migration 0036) and
 * `staff_confirm_review_approval` (migration 0053, TE-06) RPCs. There is no
 * UPDATE/DELETE of `invitation_versions`, no PUBLISHED write and no
 * `service_role` path here.
 */
export interface InvitationReviewGateway<TClient> {
  createReviewVersion(client: TClient, params: CreateReviewVersionParams): Promise<CreatedReviewVersion>;

  /**
   * TE-06: records the customer's approval of one exact CURRENT REVIEW
   * version on their behalf, as STAFF evidence (migration 0053).
   */
  confirmReviewApproval(client: TClient, params: ConfirmReviewApprovalParams): Promise<StaffConfirmedApproval>;

  listProjectInvitations(client: TClient, projectId: string): Promise<ProjectInvitationRecord[]>;

  /** REVIEW versions by exact id within one Project (payload excluded). */
  listReviewVersionsByIds(client: TClient, projectId: string, versionIds: readonly string[]): Promise<ReviewVersionSummary[]>;

  /** Feedback rows for exactly these versions within one Project. */
  listFeedbackForVersions(client: TClient, projectId: string, versionIds: readonly string[]): Promise<ReviewFeedbackSummary[]>;

  /** One REVIEW version of this Project with its persisted payload, or `null` when not visible/not REVIEW. */
  getReviewVersionWithPayload(client: TClient, projectId: string, versionId: string): Promise<ReviewVersionWithPayload | null>;
}
