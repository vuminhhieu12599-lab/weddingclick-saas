import type { InvitationVariant } from "../../domain";
import type { EventDateTimePresentationV1 } from "../../invitation-rendering/event-date-time-presentation";
import type { CeremonyTitle } from "../../invitation-rendering/wedding-domain-types";

/**
 * Task 033C — private Customer Portal foundation (read-only, post-publish).
 *
 * Server-only records read for ONE Project after its PORTAL access link
 * resolved (Task 026). Never sent to the browser as-is: the use case
 * reduces them to `CustomerPortalView`.
 */

/** A `project_invitations` row of the Project that has a published pointer. */
export interface PortalInvitationRecord {
  id: string;
  variant: InvitationVariant;
  publicSlug: string;
  publishedVersionId: string;
}

/** The `invitation_versions` row a published pointer references, as persisted. */
export interface PortalPublishedVersionRecord {
  id: string;
  invitationId: string;
  projectId: string;
  versionType: string;
  templateVersionId: string;
  rendererKey: string;
  /** Persisted, immutable Snapshot Payload v1 (unparsed). */
  payload: unknown;
}

export interface PortalProjectRecord {
  /** `projects.project_code`; `null` only if the Project row is missing. */
  projectCode: string | null;
  invitations: PortalInvitationRecord[];
  versions: PortalPublishedVersionRecord[];
  /** Non-revoked `project_addons` row with `addon_code_snapshot = PERSONALIZED_GUEST`. Informational only here. */
  personalizedGuestEntitled: boolean;
}

/**
 * Task 033C read seam. Every read is scoped to the `projectId` produced by
 * PORTAL token resolution — never a browser-supplied id. No RSVP, guest,
 * media, payment, review or staff data.
 */
export interface CustomerPortalGateway {
  getPortalProject(projectId: string): Promise<PortalProjectRecord>;
}

/** One published invitation as the customer sees it. No ids, storage paths or renderer data. */
export interface CustomerPortalInvitationCard {
  variant: InvitationVariant;
  /** Relative public path `/i/<public_slug>`. */
  invitationPath: string;
  primaryName: string;
  secondaryName: string;
  ceremonyTitle: CeremonyTitle;
  ceremonyDate: EventDateTimePresentationV1;
}

export type CustomerPortalView =
  | { status: "NOT_READY" }
  | { status: "READY"; invitations: CustomerPortalInvitationCard[]; personalizedGuestEntitled: boolean };
