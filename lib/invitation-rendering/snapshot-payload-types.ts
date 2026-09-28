import type { InvitationVariant, OccasionType, EventSide } from "../domain";
import type { ProjectEventRecord } from "../server/project-events/project-events-types";
import type { ProjectMediaRecord } from "../server/media/media-types";
import type { ProjectDesignRecord } from "../server/project-design/project-design-types";
import type { ProjectSummary } from "../server/projects/project-types";
import type { RawTemplateVersionRow } from "../server/templates/templates-types";
import type { WeddingDetailsRecord } from "../server/wedding-details/wedding-details-types";
import type { CeremonyTitle, CoupleSide, WeddingDomainIssue } from "./wedding-domain-types";

/**
 * Invitation Rendering Foundation RF-02 — Snapshot Payload v1 types
 * (docs/DECISIONS.md RF11, "RF-02 Snapshot Sections Contract Clarification").
 *
 * The payload is the stable canonical rendering snapshot that is later
 * persisted unchanged into `invitation_versions.payload`. It is plain JSON:
 * no Date, function, class instance or `undefined` value ever appears.
 *
 * Optional-value convention (RF11 rule G), applied uniformly:
 * - A **reference or side object** that may not exist (`coverMediaId`,
 *   `audioMediaId`, `qr.*MediaId`, `gift.groom`/`gift.bride`) is expressed by
 *   property presence: absent means "none". It is never `null`/`undefined`.
 * - A **canonical nullable text column** (event venue/address/…, family
 *   fields, `content.*`, `lunarDateDisplay`) is passed through unchanged as
 *   `string | null`, so the key is always present.
 *
 * Not included by design: signed/expiring URLs, storage paths, guest data,
 * RSVP state, `wedding_details.additional_note` (RF8) and the LEGACY
 * `wedding_details.lunar_date_display` (RF6).
 */

export const SNAPSHOT_PAYLOAD_SCHEMA_VERSION = 1;

export interface SnapshotPerson {
  side: CoupleSide;
  /** Stored value unchanged; guaranteed non-blank on a SUCCESS payload. */
  name: string;
}

export interface SnapshotFamily {
  side: CoupleSide;
  father: string | null;
  mother: string | null;
  address: string | null;
}

export interface SnapshotCeremony {
  /** The RF2-resolved ceremony event; also present in `events`. */
  eventId: string;
  occasionType: OccasionType;
  /** Fixed RF3 business title, not the event's own `title`. */
  title: CeremonyTitle;
  startsAt: string;
  timezone: string;
  /** Copy of the referenced event entry's `lunarDateDisplay` (RF11 rule J). */
  lunarDateDisplay: string | null;
}

/** RF11 rule I: existing ProjectEventRecord field names, rendering fields only. */
export interface SnapshotEvent {
  id: string;
  occasionType: OccasionType;
  side: EventSide;
  title: string;
  startsAt: string;
  timezone: string;
  venueName: string | null;
  address: string | null;
  mapUrl: string | null;
  description: string | null;
  sortOrder: number;
  isPrimary: boolean;
  lunarDateDisplay: string | null;
}

/** docs/PHYSICAL_DATABASE_PLAN.md §2.7 [R20] per-side canonical gift field set. */
export interface SnapshotGiftSide<TSide extends CoupleSide = CoupleSide> {
  side: TSide;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankQrMediaId: string | null;
}

/** RF-02 clarification S8: only meaningful operational sides are present. */
export interface SnapshotGift {
  groom?: SnapshotGiftSide<"GROOM">;
  bride?: SnapshotGiftSide<"BRIDE">;
}

/** RF-02 clarification S9: `commonMediaId` is always absent in payload v1. */
export interface SnapshotQrMedia {
  groomMediaId?: string;
  brideMediaId?: string;
  commonMediaId?: never;
}

/** Stable `project_media` ids only (RF11 rule C). */
export interface SnapshotMedia {
  coverMediaId?: string;
  galleryMediaIds: string[];
  audioMediaId?: string;
  qr: SnapshotQrMedia;
}

/**
 * RF-02 clarification S1/S2: canonical content availability after variant
 * filtering. Not renderer visibility and not `design.sectionSettings`.
 */
export interface SnapshotSections {
  invitationMessage: boolean;
  loveStory: boolean;
  gallery: boolean;
  music: boolean;
  gift: boolean;
}

export type SnapshotDesignSettingValue = string | number | boolean;

export interface SnapshotDesign {
  paletteKey: string;
  fontPresetKey: string;
  effectPresetKey: string;
  sectionSettings: Record<string, SnapshotDesignSettingValue>;
  designSettings: Record<string, SnapshotDesignSettingValue>;
}

export interface SnapshotPayloadV1 {
  payloadSchemaVersion: typeof SNAPSHOT_PAYLOAD_SCHEMA_VERSION;
  project: { code: string };
  template: { templateVersionId: string; rendererKey: string };
  variant: InvitationVariant;
  people: {
    groom: SnapshotPerson;
    bride: SnapshotPerson;
    primarySide: CoupleSide;
    secondarySide: CoupleSide;
  };
  families: { groom: SnapshotFamily; bride: SnapshotFamily };
  ceremony: SnapshotCeremony;
  /** Variant-visible events in RF2 display order (as returned by RF-01). */
  events: SnapshotEvent[];
  operationalSides: CoupleSide[];
  content: { invitationMessage: string | null; loveStory: string | null };
  gift: SnapshotGift;
  media: SnapshotMedia;
  sections: SnapshotSections;
  design: SnapshotDesign;
}

// ---------------------------------------------------------------------------
// Builder input
// ---------------------------------------------------------------------------

export type SnapshotProjectSource = Pick<ProjectSummary, "id" | "projectCode">;

/**
 * The WeddingDetailsRecord fields the builder may read. Excludes the LEGACY
 * `lunarDateDisplay` (RF6) and INTERNAL `additionalNote` (RF8), so the type
 * system proves the builder cannot read them.
 */
export type SnapshotWeddingDetailsSource = Omit<
  WeddingDetailsRecord,
  "id" | "lunarDateDisplay" | "additionalNote" | "createdAt" | "updatedAt"
>;

export type SnapshotMediaSource = Pick<
  ProjectMediaRecord,
  "id" | "projectId" | "mediaType" | "sortOrder"
>;

export type SnapshotDesignSource = Pick<
  ProjectDesignRecord,
  | "projectId"
  | "templateVersionId"
  | "paletteKey"
  | "fontPresetKey"
  | "effectPresetKey"
  | "sectionSettings"
  | "designSettings"
>;

/** The exact immutable template version selected by `design.templateVersionId`. */
export type SnapshotTemplateVersionSource = Pick<RawTemplateVersionRow, "id" | "rendererKey">;

export interface BuildSnapshotPayloadInput {
  project: SnapshotProjectSource;
  variant: InvitationVariant;
  /** `null` when the canonical `wedding_details` row does not exist. */
  weddingDetails: SnapshotWeddingDetailsSource | null;
  events: readonly ProjectEventRecord[];
  media: readonly SnapshotMediaSource[];
  design: SnapshotDesignSource;
  templateVersion: SnapshotTemplateVersionSource;
}

// ---------------------------------------------------------------------------
// Builder result
// ---------------------------------------------------------------------------

/** RF-02 clarification S12 — the only builder-owned issue codes. */
export type SnapshotBuilderIssueCode =
  | "WEDDING_DETAILS_MISSING"
  | "GROOM_NAME_MISSING"
  | "BRIDE_NAME_MISSING";

export interface SnapshotBuilderIssue {
  code: SnapshotBuilderIssueCode;
  severity: "BLOCKING";
  message: string;
}

/** Builder-owned issues, or RF-01 resolver issues passed through unchanged (S13). */
export type SnapshotPayloadIssue = SnapshotBuilderIssue | WeddingDomainIssue;

export interface SnapshotPayloadSuccess {
  status: "SUCCESS";
  payload: SnapshotPayloadV1;
  issues: [];
}

/** No payload is produced when any BLOCKING issue exists (S13a step 4). */
export interface SnapshotPayloadBlocked {
  status: "BLOCKED";
  issues: [SnapshotPayloadIssue, ...SnapshotPayloadIssue[]];
}

export type BuildSnapshotPayloadResult = SnapshotPayloadSuccess | SnapshotPayloadBlocked;
