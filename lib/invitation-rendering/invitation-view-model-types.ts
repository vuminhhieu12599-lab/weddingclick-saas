import type { InvitationVariant } from "../domain";
import type {
  SnapshotCeremony,
  SnapshotEvent,
  SnapshotFamily,
  SnapshotGiftSide,
  SnapshotPayloadV1,
  SnapshotPerson,
  SnapshotSections,
  SnapshotDesign,
  SnapshotTimelineItem,
  SnapshotDressCode,
} from "./snapshot-payload-types";
import type { CeremonyTitle, CoupleSide } from "./wedding-domain-types";

/**
 * Invitation Rendering Foundation RF-03 — InvitationViewModel core types
 * (docs/DECISIONS.md "RF-03 InvitationViewModel / Media Resolution Contract
 * Clarification" A1–A2, M1–M13, V1–V12).
 *
 * Render-time only: never persisted, never written back into the Snapshot.
 * RF-03 carries no RSVP capability (RF-05), no generic runtime capabilities,
 * no formatted date/weekday/countdown fields and no effective section
 * visibility (RF-04).
 */

// ---------------------------------------------------------------------------
// Media resolution (M2)
// ---------------------------------------------------------------------------

/** A referenced media item with a usable runtime rendering URL. */
export interface ResolvedMedia {
  status: "RESOLVED";
  mediaId: string;
  /** Non-empty runtime-only URL. Never stored in the Snapshot. */
  url: string;
  /** Positive integer or null (M13): null never makes media UNAVAILABLE. */
  width: number | null;
  height: number | null;
}

/** A referenced media item that currently has no usable URL. No reason taxonomy (M2). */
export interface UnavailableMedia {
  status: "UNAVAILABLE";
  mediaId: string;
}

/**
 * One per-media resolution result, and also the renderer-facing runtime
 * state of every referenced media slot (M6). Exactly these fields are ever
 * exposed: no storage path, bucket, signing metadata or adapter error.
 */
export type MediaResolution = ResolvedMedia | UnavailableMedia;

/**
 * Injected media resolver (A2, M1–M4). RF-03 owns only this interface; the
 * concrete storage/signing adapter is later integration work.
 *
 * Contract for implementations:
 * - Return a result for exactly the requested `mediaId`.
 * - Return `UNAVAILABLE` for an expected per-item inability to produce a
 *   usable URL (not found, cannot be signed, unavailable for rendering).
 * - Throw only for unexpected infrastructure/programming failures; those
 *   propagate unchanged as request-level failures.
 */
export interface MediaResolver {
  resolveMedia(mediaId: string): Promise<MediaResolution>;
}

// ---------------------------------------------------------------------------
// Guest overlay (V1)
// ---------------------------------------------------------------------------

/**
 * Already-authorized runtime personalization. Exactly one field: the
 * authorized guest's free-form `guests.display_name`, passed through as
 * given. Absent for non-personalized invitations. Never identity proof and
 * never part of the Snapshot.
 */
export interface GuestOverlay {
  displayName: string;
}

// ---------------------------------------------------------------------------
// InvitationViewModel
// ---------------------------------------------------------------------------

export type ViewModelPerson = SnapshotPerson;
export type ViewModelFamily = SnapshotFamily;
export type ViewModelCeremony = SnapshotCeremony;
export type ViewModelEvent = SnapshotEvent;
/** Snapshot sections with `timeline` always resolved (`false` for payloads built before it). */
export type ViewModelSections = Required<SnapshotSections>;

/** One ordered Timeline step, copied unchanged from the Snapshot (RF7 Timeline amendment). */
export type ViewModelTimelineItem = SnapshotTimelineItem;

/** The Project's Dress Code, copied from the Snapshot with re-validated `#rrggbb` swatches (RF7 Dress Code amendment). */
export type ViewModelDressCode = SnapshotDressCode;
export type ViewModelDesign = SnapshotDesign;

/**
 * Snapshot gift metadata, unchanged. `bankQrMediaId` stays a stable id; the
 * QR's runtime state lives only in `media.qr.<side>` (M11: one id, one result).
 */
export type ViewModelGiftSide<TSide extends CoupleSide = CoupleSide> = SnapshotGiftSide<TSide>;

export interface ViewModelGift {
  groom?: ViewModelGiftSide<"GROOM">;
  bride?: ViewModelGiftSide<"BRIDE">;
}

/**
 * Referenced media slots with runtime state (M6–M11). An absent optional
 * slot means "not referenced by the Snapshot"; a present slot is always
 * RESOLVED or UNAVAILABLE. There is no common QR slot (RF13, S9).
 */
export interface ViewModelMedia {
  cover?: MediaResolution;
  /** One item per `media.galleryMediaIds` entry, same order (M8). */
  gallery: MediaResolution[];
  audio?: MediaResolution;
  qr: {
    groom?: MediaResolution;
    bride?: MediaResolution;
  };
  /**
   * Portrait slots (RF7 Product Owner amendment), from the optional Snapshot
   * `media.portrait` refs only: an absent side means "no portrait referenced"
   * (always valid); a present side is RESOLVED or UNAVAILABLE. Never filled
   * from COVER/GALLERY and never with substitute media.
   */
  portrait: {
    groom?: MediaResolution;
    bride?: MediaResolution;
  };
  /** PHOTO_STORY slots in Snapshot order, all of them (`[]` for older payloads). Never GALLERY. */
  photoStory: MediaResolution[];
  /** The Love Story photo slot; absent when not referenced. Never COVER/GALLERY. */
  loveStoryPhoto?: MediaResolution;
}

/**
 * One runtime-only ceremony card (docs/DECISIONS.md RF2 "Ceremony-card
 * presentation"): the side's own rite event, a copy of the canonical entry
 * in `events`, with the rite-derived presentation `title`. Never persisted.
 */
export interface ViewModelCeremonyCard {
  side: CoupleSide;
  /** "Lễ Thành Hôn" (GROOM) / "Lễ Vu Quy" (BRIDE); `event.title` is untouched. */
  title: CeremonyTitle;
  event: ViewModelEvent;
}

export interface InvitationViewModel {
  project: { code: string };
  /** Carried from the Snapshot only; renderer lookup is RF-04 (V8). */
  template: { templateVersionId: string; rendererKey: string };
  variant: InvitationVariant;
  people: {
    groom: ViewModelPerson;
    bride: ViewModelPerson;
    primarySide: CoupleSide;
    secondarySide: CoupleSide;
    /** Copy of the person on `primarySide`, selected by explicit side role. */
    primary: ViewModelPerson;
    /** Copy of the person on `secondarySide`, selected by explicit side role. */
    secondary: ViewModelPerson;
  };
  families: {
    groom: ViewModelFamily;
    bride: ViewModelFamily;
    /** Copy of the family on `people.primarySide`. */
    primary: ViewModelFamily;
    /** Copy of the family on `people.secondarySide`. */
    secondary: ViewModelFamily;
  };
  /** Canonical `startsAt`/`timezone`/`lunarDateDisplay` only; no formatted fields (V4). */
  ceremony: ViewModelCeremony;
  /** Snapshot order, unchanged: the complete canonical event list. */
  events: ViewModelEvent[];
  /** Derived presentation only: one card per operational side, GROOM before BRIDE. */
  ceremonyCards: ViewModelCeremonyCard[];
  operationalSides: CoupleSide[];
  /** `timeline` is always an array here (`[]` for payloads built before it). */
  content: {
    invitationMessage: string | null;
    loveStory: string | null;
    timeline: ViewModelTimelineItem[];
    /** `null` without a Dress Code (and for payloads built before it). */
    dressCode: ViewModelDressCode | null;
  };
  gift: ViewModelGift;
  media: ViewModelMedia;
  /** Canonical content availability, copied unchanged (V6). Not effective visibility. */
  sections: ViewModelSections;
  design: ViewModelDesign;
  /** Present only when an authorized guest overlay was supplied. */
  guest?: GuestOverlay;
}

// ---------------------------------------------------------------------------
// Builder input (Layer B)
// ---------------------------------------------------------------------------

export interface BuildInvitationViewModelInput {
  snapshot: SnapshotPayloadV1;
  /** Omit for a non-personalized invitation. */
  guest?: GuestOverlay;
  /**
   * The complete resolution set from Layer A (M5): exactly one result per
   * unique media id the Snapshot references, and no other entries.
   */
  mediaResolutions: readonly MediaResolution[];
}
