import type { EventSide, InvitationVariant, OccasionType } from "../domain";
import type { ProjectEventRecord } from "../server/project-events/project-events-types";
import type { WeddingDetailsRecord } from "../server/wedding-details/wedding-details-types";

/**
 * Invitation Rendering Foundation RF-01 — production Wedding Domain
 * Resolver types (docs/DECISIONS.md RF2–RF6).
 *
 * Pure data shapes only: no snapshot payload (RF-02), no InvitationViewModel
 * (RF-03), no renderer/registry data (RF-04+).
 */

/**
 * A couple side: the `GROOM`/`BRIDE` subset of the canonical EventSide
 * vocabulary. People, families and operational sides always carry one of
 * these explicitly (RF5) — never object identity or array position.
 */
export type CoupleSide = Exclude<EventSide, "COMMON">;

export const COUPLE_SIDES = ["GROOM", "BRIDE"] as const satisfies readonly CoupleSide[];

/**
 * The only WeddingDetailsRecord fields the resolver reads. Deliberately
 * excludes the LEGACY `lunarDateDisplay` (RF6) and INTERNAL
 * `additionalNote` (RF8), so the type system proves they cannot be read.
 */
export type WeddingPartiesSource = Pick<
  WeddingDetailsRecord,
  | "groomName"
  | "brideName"
  | "groomFather"
  | "groomMother"
  | "brideFather"
  | "brideMother"
  | "groomFamilyAddress"
  | "brideFamilyAddress"
>;

export interface WeddingPerson {
  side: CoupleSide;
  name: string | null;
}

export interface WeddingFamily {
  side: CoupleSide;
  father: string | null;
  mother: string | null;
  address: string | null;
}

export interface WeddingPeople {
  groom: WeddingPerson;
  bride: WeddingPerson;
}

export interface WeddingFamilies {
  groom: WeddingFamily;
  bride: WeddingFamily;
}

export interface ResolveWeddingDomainInput {
  variant: InvitationVariant;
  weddingDetails: WeddingPartiesSource;
  events: readonly ProjectEventRecord[];
}

/** RF3 business wording. Separate from the ceremony event's own `title`. */
export type CeremonyTitle = "Lễ Thành Hôn" | "Lễ Vu Quy";

export interface ResolvedCeremony {
  /** The RF2-resolved ceremony event's canonical id. */
  eventId: string;
  occasionType: OccasionType;
  /** Fixed business title (RF3); `event.title` is left unchanged. */
  title: CeremonyTitle;
  /**
   * Copy of `event.lunarDateDisplay` (RF6) — never calculated, never
   * taken from another event or from wedding_details.
   */
  lunarDateDisplay: string | null;
  /** The resolved event itself: the single source of ceremony date/time. */
  event: ProjectEventRecord;
}

export type WeddingDomainIssueCode = "REQUIRED_CEREMONY_EVENT_MISSING";

export type WeddingDomainIssueSeverity = "BLOCKING";

export interface WeddingDomainIssue {
  code: WeddingDomainIssueCode;
  severity: WeddingDomainIssueSeverity;
  message: string;
}

interface WeddingDomainResolutionBase {
  variant: InvitationVariant;
  primarySide: CoupleSide;
  secondarySide: CoupleSide;
  operationalSides: CoupleSide[];
  people: WeddingPeople;
  families: WeddingFamilies;
  /** Variant-visible events in RF2 display order. */
  visibleEvents: ProjectEventRecord[];
}

export interface ResolvedWeddingDomain extends WeddingDomainResolutionBase {
  status: "RESOLVED";
  ceremony: ResolvedCeremony;
  issues: [];
}

/** No snapshot payload may be built from a BLOCKED result (RF2). */
export interface BlockedWeddingDomain extends WeddingDomainResolutionBase {
  status: "BLOCKED";
  ceremony: null;
  issues: [WeddingDomainIssue, ...WeddingDomainIssue[]];
}

export type WeddingDomainResolution = ResolvedWeddingDomain | BlockedWeddingDomain;
