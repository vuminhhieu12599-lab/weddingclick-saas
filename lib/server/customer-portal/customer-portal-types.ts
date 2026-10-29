import type { InvitationVariant, RsvpAttendanceStatus } from "../../domain";
import type { EventDateTimePresentationV1 } from "../../invitation-rendering/event-date-time-presentation";
import type { CeremonyTitle } from "../../invitation-rendering/wedding-domain-types";
import type { CustomerPortalGuestTool } from "./portal-guest-types";

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
  /** LAUNCH-P0-02 friendly alias (GROOM/BRIDE only), `null` when none. */
  publicAlias: string | null;
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
  /** `projects.package_code_snapshot` (Task 033E-A Guest Tool mode); `null` only if the Project row is missing. */
  packageCode: string | null;
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
  /**
   * RSVP-P0-02 — `rsvps.invitation_id` (0055): the invitation this response
   * was submitted through, recorded server-side at submit time. `null` for
   * every pre-0055 row; the use case resolves it against the Project's own
   * invitations and never infers a side. Used only to derive the row's
   * source and never carried into the view.
   */
  invitationId: string | null;
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
  /** Relative public path: the friendly `/i/<alias>` when assigned (LAUNCH-P0-02), else `/i/<public_slug>`. */
  invitationPath: string;
  primaryName: string;
  secondaryName: string;
  ceremonyTitle: CeremonyTitle;
  ceremonyDate: EventDateTimePresentationV1;
}

/**
 * RSVP-P0-02 — where a response actually came from, as recorded by the
 * database at submit time (`rsvps.invitation_id`, migration 0055) and
 * resolved against the Project's own invitations. `UNKNOWN` means the source
 * was never recorded (every pre-0055 row); it is never a guess.
 */
export type PortalRsvpSource = InvitationVariant | "UNKNOWN";

/**
 * One RSVP response as the customer sees it (Task 033D). PERSONALIZED: the
 * canonical Guest `display_name` is the identity; `respondedAs` is the typed
 * name only when it differs. GENERIC: the typed name is all there is. No ids.
 */
export interface CustomerPortalRsvpRow {
  kind: "PERSONALIZED" | "GENERIC";
  guestName: string;
  respondedAs: string | null;
  /** The personalized Guest's own side, when set. Guest identity — never the submission source. */
  invitationVariant: InvitationVariant | null;
  /** RSVP-P0-02: the invitation link this response actually came through. */
  source: PortalRsvpSource;
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

/**
 * RSVP-P0-02 — one Portal RSVP view: its own rows and its own summary.
 *
 * - `GROOM` / `BRIDE`: only the responses recorded as coming from that
 *   invitation's public link.
 * - `ALL`: every stored response of the Project, each counted exactly once.
 *   Rows with no recorded source ("Chưa xác định nguồn") appear here only —
 *   they are never assigned to a family.
 */
export interface CustomerPortalRsvpGroup {
  key: "GROOM" | "BRIDE" | "ALL";
  rows: CustomerPortalRsvpRow[];
  summary: CustomerPortalRsvpSummary;
}

/**
 * RSVP-P0-02 — `SINGLE` (COMMON package: the unchanged one-list experience,
 * `groups` is exactly `[ALL]`) or `BY_SIDE` (SEPARATE package: exactly
 * `[GROOM, BRIDE, ALL]`).
 */
export interface CustomerPortalRsvpView {
  layout: "SINGLE" | "BY_SIDE";
  groups: CustomerPortalRsvpGroup[];
}

export type CustomerPortalView =
  | { status: "NOT_READY" }
  | {
      status: "READY";
      invitations: CustomerPortalInvitationCard[];
      personalizedGuestEntitled: boolean;
      rsvps: CustomerPortalRsvpView;
      /** Task 033E-A: present only with an active PERSONALIZED_GUEST add-on. */
      guestTool: CustomerPortalGuestTool | null;
    };
