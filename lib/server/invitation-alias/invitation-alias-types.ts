import type { InvitationVariant, PublicAliasVariant } from "../../domain";

/**
 * LAUNCH-P0-02 — friendly public URL of a published SEPARATE invitation
 * (docs/API_CONTRACT.md §39, migration 0049).
 */

/** Stable 409 reason of an alias assignment, so the Xuất bản tab can explain it. */
export type InvitationAliasConflictReason = "ALIAS_TAKEN" | "ALIAS_ALREADY_ASSIGNED" | "NOT_PUBLISHED";

/** 422 reason when no default alias can be derived from the published names. */
export type InvitationAliasInvariantReason = "ALIAS_UNDERIVABLE";

/** Browser command: the variant, plus an optional staff-chosen alias. Without one the server derives the default. */
export interface AssignInvitationAliasCommand {
  variant: PublicAliasVariant;
  alias: string | null;
}

/** One row written by `assign_invitation_public_alias` (0049). */
export interface AssignedInvitationAliasRecord {
  invitationId: string;
  projectId: string;
  variant: InvitationVariant;
  alias: string;
  createdAt: string;
}

export interface AssignedInvitationAlias {
  variant: PublicAliasVariant;
  alias: string;
  /** Relative friendly path `/i/<alias>`. */
  publicPath: string;
}

/** The persisted binding of a variant's CURRENT publication, for deriving the default alias. */
export interface PublishedSnapshotRecord {
  invitationId: string;
  templateVersionId: string;
  rendererKey: string;
  payload: unknown;
}

/** Public link facts of one invitation of the Project (staff read). */
export interface InvitationPublicLinkRecord {
  invitationId: string;
  variant: InvitationVariant;
  publicSlug: string;
  alias: string | null;
}

/**
 * Staff-scoped persistence seam (Path A, RLS). The only write is the 0049
 * RPC; reads are direct RLS SELECTs. No service_role.
 */
export interface InvitationAliasGateway<TClient> {
  assignAlias(client: TClient, params: { projectId: string; variant: PublicAliasVariant; alias: string }): Promise<AssignedInvitationAliasRecord>;

  /** The variant's current PUBLISHED row (payload included); `null` when never published. */
  getPublishedSnapshot(client: TClient, projectId: string, variant: PublicAliasVariant): Promise<PublishedSnapshotRecord | null>;

  listPublicLinks(client: TClient, projectId: string): Promise<InvitationPublicLinkRecord[]>;
}
