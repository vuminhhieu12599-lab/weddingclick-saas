/**
 * Prototype-only shape. NOT the future InvitationViewModel contract
 * (docs/TEMPLATE_SYSTEM.md §3) — deliberately smaller and only what these
 * three static visual prototypes need to render.
 */
export type InvitationVariant = "COMMON" | "GROOM" | "BRIDE";

export interface SideDetails {
  personName: string;
  familyName: string;
  /** Short label used on tabs/buttons, e.g. "Nhà Trai" / "Nhà Gái". */
  sideLabel: string;
  /** Father's name for the ceremonial family-information block (checkpoint V6 §5). */
  fatherName: string;
  /** Mother's name for the ceremonial family-information block. */
  motherName: string;
  /** The family's home address — distinct from the reception venue address. */
  familyAddress: string;
  /** Optional short family home location (e.g. "TP. Đà Nẵng") for compact family blocks. */
  familyLocationLabel?: string;
  /** This side's own reception/party instant — may differ from the other side's. */
  receptionDateTimeIso: string;
  venueName: string;
  venueAddress: string;
  mapsUrl: string;
  /** Fictional prototype gift details for this side only. */
  gift: {
    bankName: string;
    accountHolder: string;
    accountNumber: string;
    /** This side's configured transfer-QR image; a placeholder shows when absent. */
    qrImageUrl?: string;
  };
}

export interface TimelineItem {
  dateTimeIso: string;
  label: string;
}

/**
 * One couple-story milestone (prototype range: 1–5 per story). `dateLabel`
 * is free-form story wording ("2023", "Mùa thu 2024") — never a canonical
 * wedding date/time, so it is not derived from any event instant.
 */
export interface LoveStoryMilestone {
  dateLabel: string;
  title: string;
  description?: string;
  /** Optional photo (Project media). */
  imageUrl?: string;
}

/** One dress-code colour: a guest-facing name plus its hex value. */
export interface DressCodeSwatch {
  label: string;
  color: string;
}

export interface DressCode {
  description: string;
  /** Labelled colours, in display order (prototype range: 1–6). */
  swatches: DressCodeSwatch[];
  /** The same colours as plain hex values, for layouts that only need the colour. */
  palette: string[];
}

/**
 * The general invitation sentence is wording customers/regions want to
 * customize (checkpoint V5 §B4) — never a string baked into component
 * logic. `template` uses `{guest}` / `{ceremonyTitle}` tokens; the ceremony
 * token is still filled from the centralized variant resolver so COMMON/
 * GROOM/BRIDE wording never drifts out of sync (CLAUDE.md §5).
 */
export interface InvitationWording {
  template: string;
  /**
   * Stationery-style salutation shown on its own line above the guest line
   * by templates that split the sentence (e.g. "Trân Trọng Kính Mời").
   */
  salutation: string;
  /** Guest line when no personalized guest is active (e.g. "Bạn và Gia Đình"). */
  defaultGuestLabel: string;
}

/**
 * Product direction only (checkpoint V5 §B10) — the Zalo/Facebook share
 * preview image is chosen independently from the in-invitation Hero photo.
 * No OG/meta implementation in this prototype.
 */
export interface ShareCoverConfig {
  imageLabel: string;
  note: string;
}

/** Product direction only (checkpoint V5 §B9) — no real audio asset here. */
export interface MusicConfig {
  trackLabel: string;
}

export type MediaOrientation = "portrait" | "landscape" | "square";

/** Point to keep in view when a photo is cropped: 0–1 from left / top. */
export interface FocalPoint {
  x: number;
  y: number;
}

/**
 * One wedding-album photo (Project media), in upload order. Templates place
 * photos into their own slots by orientation — never by fixed index.
 */
export interface AlbumPhoto {
  src: string;
  alt: string;
  /** Source dimensions; orientation is derived from these when not given. */
  width?: number;
  height?: number;
  /** Explicit orientation, overriding the derived one. */
  orientation?: MediaOrientation;
  /** Optional crop focus for album thumbnails; centre when absent. */
  focalPoint?: FocalPoint;
}

export interface PrototypeWeddingData {
  groom: SideDetails;
  bride: SideDetails;
  /** The formal ceremony/rite instant — single canonical value, not side-scoped (CLAUDE.md §7). */
  ceremonyDateTimeIso: string;
  /**
   * Fictional prototype-only lunar calendar label (e.g. "08/09 Âm Lịch").
   * A real solar→lunar conversion is production work, not built here —
   * this is a static companion string, never derived from
   * ceremonyDateTimeIso, so it must never be presented as computed.
   */
  ceremonyLunarDateLabel: string;
  timeZone: string;
  loveStory: string;
  /** Optional short love-story paragraph for compact photo-strip layouts. */
  loveStoryShort?: string;
  /** Short editable heading for the couple-story section. */
  loveStoryHeading: string;
  /** Couple-story milestones, in story order (1–5). */
  loveStoryMilestones: LoveStoryMilestone[];
  /** Muted backdrop photo for image-led story layouts (Project media). */
  loveStoryBackgroundUrl: string;
  timeline: TimelineItem[];
  dressCode: DressCode;
  /** Short editable heading for the photo album. */
  albumHeading: string;
  album: AlbumPhoto[];
  /** May contain "\n" line breaks for layouts that honour them. */
  closingMessage: string;
  /** Landscape photo for image-backed closing panels (Project media). */
  closingPhotoUrl: string;
  giftIntroNote: string;
  /** Optional fuller gift note (also addresses guests who cannot attend). */
  giftIntroNoteExtended?: string;
  invitationWording: InvitationWording;
  shareCover: ShareCoverConfig;
  music: MusicConfig;
}

export interface DerivedCeremonyDisplay {
  weekdayLabel: string;
  dayLabel: string;
  monthLabel: string;
  yearLabel: string;
  timeLabel: string;
  fullDateLabel: string;
}
