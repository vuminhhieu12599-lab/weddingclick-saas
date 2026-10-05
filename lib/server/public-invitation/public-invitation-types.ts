import type { InvitationVariant } from "../../domain";
import type { InvitationViewModel } from "../../invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../invitation-rendering/renderer-selection";

/**
 * A `project_media` storage reference pinned to the current PUBLISHED
 * version through `invitation_version_media` (returned only by
 * `get_public_invitation`, migration 0039). Server-only: never sent to the
 * browser, templates or the ViewModel.
 */
export interface PinnedPublishedMedia {
  id: string;
  storageBucket: string;
  storagePath: string;
  width: number | null;
  height: number | null;
}

/** The exact PUBLISHED row referenced by `project_invitations.published_version_id`, as persisted. */
export interface PublishedInvitationVersionRecord {
  id: string;
  versionNumber: number;
  templateVersionId: string;
  rendererKey: string;
  publishedAt: string;
  /** Persisted, immutable Snapshot Payload v1 (unparsed). */
  payload: unknown;
  media: PinnedPublishedMedia[];
}

/** `get_public_invitation` result for a slug that has a current publication. */
export interface PublicInvitationRecord {
  variant: InvitationVariant;
  /** Binding check only: the persisted Snapshot must name this Project. */
  projectCode: string;
  publishedVersion: PublishedInvitationVersionRecord;
}

/**
 * Task 032A public read seam. Exactly one capability: the service_role-only
 * `get_public_invitation` RPC. `null` = unknown slug or never published.
 */
export interface PublicInvitationGateway {
  getPublicInvitation(publicSlug: string): Promise<PublicInvitationRecord | null>;
}

/**
 * PUBLISHED INVITATION MEDIA SIGNING ONLY. Signs exactly the given storage
 * references (already restricted to one resolved PUBLISHED version's
 * `invitation_version_media` pins) and returns media id → short-lived
 * runtime URL. URLs are never persisted. Missing ids mean "could not sign".
 */
export type PublishedInvitationMediaSigner = (media: readonly { id: string; storagePath: string }[]) => Promise<ReadonlyMap<string, string>>;

/** Renderer-ready public invitation: exactly the serializable inputs of `InvitationRendererHost`. */
export interface PublicInvitationView {
  rendererKey: string;
  /** Carries the runtime-only resolved media (signed URLs live only here). */
  viewModel: InvitationViewModel;
  sections: RendererEffectiveSections;
}
