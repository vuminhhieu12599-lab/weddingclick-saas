import type { InvitationVariant } from "../../domain";

/**
 * Task 033B1 — personalized guest-link issuance seam (actor-neutral).
 *
 * The shared `issueGuestLink` use case runs against an already-authorized
 * data client + gateway; it does not authenticate anyone itself. Today the
 * only implementation is the staff SUPPORT/back-office gateway (staff
 * session, direct RLS on `guests`, docs/API_CONTRACT.md §7.5, no
 * activity-log event). The primary customer flow is the Customer Portal
 * Guest Tool (Task 033E-B: PORTAL access link, entitlement-gated), which
 * supplies its own Project-pinned service_role gateway. A gateway never reads or returns
 * `token_hash`.
 */

export const GUEST_LINK_ACTIONS = ["ISSUE", "REGENERATE"] as const;

export type GuestLinkAction = (typeof GUEST_LINK_ACTIONS)[number];

/** What issuance needs to know about one guest of one Project. Never the token hash. */
export interface GuestLinkTarget {
  invitationVariant: InvitationVariant | null;
  /** `token_issued_at IS NOT NULL` (0042) — the sole issuance authority, never `token_hint`. */
  hasIssuedLink: boolean;
  revoked: boolean;
  /** `projects.package_code_snapshot`. */
  packageCode: string;
}

export interface ReplaceGuestTokenParams {
  projectId: string;
  guestId: string;
  /** ISSUE: only while `token_issued_at IS NULL`; REGENERATE: only while it is set. Both set it to now. */
  expectIssued: boolean;
  /**
   * Task 033E-B race fix: the stored `guests.invitation_variant` (NULL kept as
   * NULL) the issued path's slug was resolved from. The write matches only
   * while it is unchanged, so a concurrent side change can never leave a
   * dead link for the old side.
   */
  expectedInvitationVariant: InvitationVariant | null;
  tokenHash: Uint8Array;
  tokenHint: string;
}

export interface GuestLinkGateway<TClient> {
  /**
   * PERSONALIZED_GUEST entitlement (docs/PHYSICAL_DATABASE_PLAN.md §2.6):
   * at least one non-revoked `project_addons` row with that add-on code.
   * Derived server-side only; never a client-supplied value.
   */
  hasPersonalizedGuestEntitlement(client: TClient, projectId: string): Promise<boolean>;
  /** `null` when no guest with this id exists in this Project (or is invisible under RLS). */
  getGuestLinkTarget(client: TClient, projectId: string, guestId: string): Promise<GuestLinkTarget | null>;
  /** The invitation's public slug, or `null` when the Project has no invitation of that variant. */
  getInvitationSlug(client: TClient, projectId: string, variant: InvitationVariant): Promise<string | null>;
  /**
   * Conditional in-place rotation (`UPDATE guests SET token_hash, token_hint,
   * token_issued_at` guarded on project, active guest, the expected
   * `token_issued_at` state and, since Task 033E-B, the expected
   * `invitation_variant` — one atomic statement).
   * `false` = no row matched (concurrent change) — nothing written.
   */
  replaceGuestToken(client: TClient, params: ReplaceGuestTokenParams): Promise<boolean>;
}

export interface IssuedGuestLink {
  guestId: string;
  projectId: string;
  invitationVariant: InvitationVariant;
  /** `/i/[slug]/g/[token]` — carries the raw token; returned once, never stored. */
  invitationPath: string;
}
