import type { InvitationVariant, RsvpAttendanceStatus } from "../../domain";
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
 * Task 033D — one `rsvps` row of the resolved Project, as read for the
 * Portal owner-read list. `guest` is the canonical Guest relationship (only
 * `display_name` / `invitation_variant`) when `guest_id` is set; `null` for a
 * generic (link-wide) response. No ids, token fields, phone or notes.
 */
export interface PortalRsvpRecord {
  /** `rsvps.guest_display_name_snapshot` — the typed response name; never identity. */
  typedName: string | null;
  attendance: RsvpAttendanceStatus;
  partySize: number;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  guest: { displayName: string; invitationVariant: InvitationVariant | null } | null;
}

/**
 * Task 033C/033D read seam. Every read is scoped to the `projectId` produced
 * by PORTAL token resolution — never a browser-supplied id. RSVP rows are
 * read-only (033D); no guest management, media, payment, review or staff data.
 */
export interface CustomerPortalGateway {
  getPortalProject(projectId: string): Promise<PortalProjectRecord>;
  listPortalRsvps(projectId: string): Promise<PortalRsvpRecord[]>;
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

/**
 * One RSVP response as the customer sees it (Task 033D). PERSONALIZED: the
 * canonical Guest `display_name` is the identity; `respondedAs` is the typed
 * name only when it differs. GENERIC: the typed name is all there is. No ids.
 */
export interface CustomerPortalRsvpRow {
  kind: "PERSONALIZED" | "GENERIC";
  guestName: string;
  respondedAs: string | null;
  invitationVariant: InvitationVariant | null;
  attendance: RsvpAttendanceStatus;
  partySize: number;
  message: string | null;
  /** `updated_at`, formatted dd/mm/yyyy HH:mm in Asia/Ho_Chi_Minh. */
  respondedAt: string;
}

/** Derived purely from the loaded rows: responses per status and guests (party size) per status. */
export interface CustomerPortalRsvpSummary {
  responses: Record<RsvpAttendanceStatus, number>;
  people: Record<RsvpAttendanceStatus, number>;
}

export type CustomerPortalView =
  | { status: "NOT_READY" }
  | {
      status: "READY";
      invitations: CustomerPortalInvitationCard[];
      personalizedGuestEntitled: boolean;
      rsvps: CustomerPortalRsvpRow[];
      rsvpSummary: CustomerPortalRsvpSummary;
    };
