import type {
  CreateReviewVersionParams,
  CreatedReviewVersion,
  ProjectInvitationRecord,
  ReviewFeedbackSummary,
  ReviewVersionSummary,
  ReviewVersionWithPayload,
} from "./invitation-review-types";

/**
 * Task 030 review persistence seam. Always called with a staff-scoped
 * client: reads are DIRECT RLS SELECTs (`is_staff()`), and the only write
 * is the audited `create_review_version` RPC (migration 0036). There is no
 * UPDATE/DELETE of `invitation_versions`, no PUBLISHED write and no
 * `service_role` path here.
 */
export interface InvitationReviewGateway<TClient> {
  createReviewVersion(client: TClient, params: CreateReviewVersionParams): Promise<CreatedReviewVersion>;

  listProjectInvitations(client: TClient, projectId: string): Promise<ProjectInvitationRecord[]>;

  /** REVIEW versions by exact id within one Project (payload excluded). */
  listReviewVersionsByIds(client: TClient, projectId: string, versionIds: readonly string[]): Promise<ReviewVersionSummary[]>;

  /** Feedback rows for exactly these versions within one Project. */
  listFeedbackForVersions(client: TClient, projectId: string, versionIds: readonly string[]): Promise<ReviewFeedbackSummary[]>;

  /** One REVIEW version of this Project with its persisted payload, or `null` when not visible/not REVIEW. */
  getReviewVersionWithPayload(client: TClient, projectId: string, versionId: string): Promise<ReviewVersionWithPayload | null>;
}
