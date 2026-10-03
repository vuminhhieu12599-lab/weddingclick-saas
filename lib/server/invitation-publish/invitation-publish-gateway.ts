import type { PublishInvitationParams, PublishedInvitationVersion, PublishedVersionSummary } from "./invitation-publish-types";

/**
 * Task 031 publish persistence seam. Always called with a staff-scoped
 * client: the only write is the audited `publish_invitation` RPC (migration
 * 0038); reads are DIRECT RLS SELECTs (`is_staff()`). No INSERT/UPDATE/
 * DELETE of `invitation_versions`, no Snapshot/media input and no
 * `service_role` path here.
 */
export interface InvitationPublishGateway<TClient> {
  publishInvitation(client: TClient, params: PublishInvitationParams): Promise<PublishedInvitationVersion>;

  /** PUBLISHED versions by exact id within one Project (payload excluded). */
  listPublishedVersionsByIds(client: TClient, projectId: string, versionIds: readonly string[]): Promise<PublishedVersionSummary[]>;
}
