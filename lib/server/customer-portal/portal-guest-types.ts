import type { InvitationVariant, RsvpAttendanceStatus } from "../../domain";
import type { GuestLinkGateway } from "../guest-links/guest-link-types";

/**
 * Task 033E-A — Customer Portal Guest Tool foundation (list / create /
 * minimal edit / revoke). Every gateway call is pinned to the `projectId`
 * produced by PORTAL token resolution; a guest id only targets a row inside
 * that Project and is never authorization. No personalized link ISSUE /
 * REGENERATE here (Task 033E-B).
 */

/** COMMON package: the server always uses COMMON. SEPARATE: the customer picks GROOM or BRIDE. */
export type PortalGuestToolMode = "COMMON_ONLY" | "GROOM_OR_BRIDE";

/** What a Guest Tool request needs to know about the resolved Project. */
export interface PortalGuestToolContext {
  /** `projects.package_code_snapshot`; `null` only if the Project row is missing. */
  packageCode: string | null;
  /** At least one invitation whose published pointer is a PUBLISHED row of the same invitation and Project. */
  published: boolean;
  /** Non-revoked `project_addons` row with `addon_code_snapshot = PERSONALIZED_GUEST`. */
  personalizedGuestEntitled: boolean;
}

/**
 * One `guests` row of the resolved Project, reduced inside the repository:
 * `linkIssued` is `token_issued_at IS NOT NULL` (the timestamp itself never
 * leaves the repository). No token hash/hint, phone, note, group or Project id.
 */
export interface PortalGuestRecord {
  id: string;
  displayName: string;
  invitationVariant: InvitationVariant | null;
  linkIssued: boolean;
  revoked: boolean;
}

/** Read-only classification after a conditional write matched no row. `null` = no such guest in this Project. */
export interface PortalGuestState {
  invitationVariant: InvitationVariant | null;
  linkIssued: boolean;
  revoked: boolean;
}

export interface InsertPortalGuestParams {
  displayName: string;
  invitationVariant: InvitationVariant;
  /** Dormant 32-byte SHA-256 placeholder; never a delivered credential. */
  tokenHash: Uint8Array;
}

export interface UpdatePortalGuestParams {
  displayName: string;
  /**
   * Set only for a SEPARATE-package side submission. The write then also
   * requires `token_issued_at IS NULL OR invitation_variant = <side>` (side
   * lock after issuance), atomically.
   */
  invitationVariant?: "GROOM" | "BRIDE";
}

/** Server-only, Project-pinned Guest Tool data seam (service_role implementation). */
export interface PortalGuestGateway {
  getGuestToolContext(projectId: string): Promise<PortalGuestToolContext>;
  listGuests(projectId: string): Promise<PortalGuestRecord[]>;
  insertGuest(projectId: string, params: InsertPortalGuestParams): Promise<PortalGuestRecord>;
  /** One conditional UPDATE (project, id, active[, side lock]); `null` when no row matched. */
  updateGuest(projectId: string, guestId: string, params: UpdatePortalGuestParams): Promise<PortalGuestRecord | null>;
  /** One conditional UPDATE `SET revoked_at = now()` (project, id, active); `null` when no row matched. */
  revokeGuest(projectId: string, guestId: string): Promise<PortalGuestRecord | null>;
  /** Read-only, Project-pinned; used only to classify a 0-row write. Never followed by a write. */
  getGuestState(projectId: string, guestId: string): Promise<PortalGuestState | null>;
  /**
   * Task 033E-C — read-only: this Project's personalized RSVP rows
   * (`guest_id IS NOT NULL`), reduced to guest id + attendance + party size.
   * One query, exact count (never silently truncated); generic rows are never read.
   */
  listGuestRsvps(projectId: string): Promise<PortalGuestRsvpRecord[]>;
}

/** Task 033E-C — one personalized `rsvps` row (≤ 1 per guest, `rsvps_guest_id_key`), reduced in the repository. */
export interface PortalGuestRsvpRecord {
  guestId: string;
  attendance: RsvpAttendanceStatus;
  partySize: number;
}

/** Task 033E-C — compact per-guest RSVP state; joined only by `rsvps.guest_id = guests.id`. */
export type PortalGuestRsvpStatus = "NOT_RESPONDED" | RsvpAttendanceStatus;

/**
 * One guest as the customer sees it. `guestId` is only the mutation target
 * for this Project's own rows (every write is also pinned by the resolved
 * Project); it authorizes nothing and is not a link credential.
 */
export interface CustomerPortalGuestRow {
  guestId: string;
  displayName: string;
  /** Resolved per API §7.3; `null` = a SEPARATE-package guest without a side yet. */
  invitationVariant: InvitationVariant | null;
  status: "ACTIVE" | "REVOKED";
  linkStatus: "NOT_ISSUED" | "ISSUED";
}

/**
 * Task 033E-C — a Guest Tool list row: the 033E-A row plus the compact RSVP
 * status. `rsvpPartySize` is set only for ATTENDING / MAYBE (never 0); no
 * RSVP id, message, typed name or timestamps. Mutation responses keep the
 * plain `CustomerPortalGuestRow`.
 */
export interface CustomerPortalGuestListRow extends CustomerPortalGuestRow {
  rsvpStatus: PortalGuestRsvpStatus;
  rsvpPartySize: number | null;
}

export interface CustomerPortalGuestTool {
  mode: PortalGuestToolMode;
  /** Active guests first, then revoked; each group in the repository's order. */
  guests: CustomerPortalGuestListRow[];
}

/**
 * Task 033E-B — the "client" handed to the shared `issueGuestLink` by the
 * Portal: the PORTAL-resolved Project the gateway is pinned to. Every
 * gateway call fails closed unless its `projectId` equals this one.
 */
export interface PortalPinnedProject {
  readonly projectId: string;
}

/** Server-only, Project-pinned (service_role) implementation of the shared 033B1 issuance seam. */
export type PortalGuestLinkGateway = GuestLinkGateway<PortalPinnedProject>;

/**
 * Successful Portal ISSUE / REGENERATE. `personalizedUrl` is the relative
 * `/i/<slug>/g/<raw token>` path — the raw token's only appearance, returned
 * once and never stored. No Project/guest id, hash, hint or timestamp.
 */
export interface PortalIssuedGuestLink {
  personalizedUrl: string;
  linkStatus: "ISSUED";
}

/** Stable 409 reason for the customer UI. */
export type PortalGuestConflictReason = "GUEST_REVOKED" | "SIDE_LOCKED" | "ALREADY_REVOKED" | "CONCURRENT_CHANGE";
