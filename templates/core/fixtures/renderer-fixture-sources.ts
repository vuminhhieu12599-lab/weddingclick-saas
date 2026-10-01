import type { InvitationVariant } from "../../../lib/domain";
import type { GuestOverlay } from "../../../lib/invitation-rendering/invitation-view-model-types";
import type {
  BuildSnapshotPayloadInput,
  SnapshotDesignSettingValue,
} from "../../../lib/invitation-rendering/snapshot-payload-types";
import { ELEGANT_EDITORIAL_V1_MANIFEST } from "../../wedding/elegant-editorial/v1/manifest";

/**
 * Invitation Rendering Foundation RF-06A — deterministic canonical fixture
 * sources for the real pipeline (docs/DECISIONS.md "RF-06-0 …" P38, P42).
 *
 * Fictional data only: no real customer, no Supabase, no network, no
 * current time, no randomness. Every id and timestamp is a fixed literal.
 * These are canonical Project records (RF-02 builder input), never renderer
 * copy, UI state or a hand-built Snapshot/ViewModel.
 */

type FixtureEventRecord = BuildSnapshotPayloadInput["events"][number];
type FixtureWeddingDetails = NonNullable<BuildSnapshotPayloadInput["weddingDetails"]>;

export const FIXTURE_PROJECT_ID = "00000000-0000-4000-8000-000000000001";
export const FIXTURE_PROJECT_CODE = "WC-2026-9001";
export const FIXTURE_TEMPLATE_VERSION_ID = "00000000-0000-4000-8000-0000000000f1";

/** Canonical timestamp form only (P37): `YYYY-MM-DDTHH:mm:ss.sssZ`. */
const FIXTURE_RECORD_TIMESTAMP = "2026-09-01T00:00:00.000Z";
const FIXTURE_TIMEZONE = "Asia/Ho_Chi_Minh";

export const FIXTURE_EVENT_IDS = Object.freeze({
  VU_QUY_BRIDE: "00000000-0000-4000-8000-000000000101",
  THANH_HON_GROOM: "00000000-0000-4000-8000-000000000102",
  RECEPTION_BRIDE: "00000000-0000-4000-8000-000000000103",
  RECEPTION_COMMON: "00000000-0000-4000-8000-000000000104",
});

export const FIXTURE_MEDIA_IDS = Object.freeze({
  COVER: "00000000-0000-4000-8000-000000000201",
  GALLERY_1: "00000000-0000-4000-8000-000000000202",
  GALLERY_2: "00000000-0000-4000-8000-000000000203",
  GALLERY_3: "00000000-0000-4000-8000-000000000204",
  AUDIO: "00000000-0000-4000-8000-000000000205",
  QR_GROOM: "00000000-0000-4000-8000-000000000206",
  QR_BRIDE: "00000000-0000-4000-8000-000000000207",
  PORTRAIT_GROOM: "00000000-0000-4000-8000-000000000208",
  PORTRAIT_BRIDE: "00000000-0000-4000-8000-000000000209",
  PHOTO_STORY_1: "00000000-0000-4000-8000-000000000211",
  PHOTO_STORY_2: "00000000-0000-4000-8000-000000000212",
  PHOTO_STORY_3: "00000000-0000-4000-8000-000000000213",
  PHOTO_STORY_4: "00000000-0000-4000-8000-000000000214",
  PHOTO_STORY_5: "00000000-0000-4000-8000-000000000215",
  LOVE_STORY_PHOTO: "00000000-0000-4000-8000-000000000216",
});

/** Fixture PHOTO_STORY ids in canonical order (Task029's five-photo cluster). */
export const FIXTURE_PHOTO_STORY_IDS = Object.freeze([
  FIXTURE_MEDIA_IDS.PHOTO_STORY_1,
  FIXTURE_MEDIA_IDS.PHOTO_STORY_2,
  FIXTURE_MEDIA_IDS.PHOTO_STORY_3,
  FIXTURE_MEDIA_IDS.PHOTO_STORY_4,
  FIXTURE_MEDIA_IDS.PHOTO_STORY_5,
] as const);

/** Extra fixture GALLERY id `n` (n ≥ 4), for galleries beyond the three base images. */
export function fixtureExtraGalleryId(n: number): string {
  return `00000000-0000-4000-8000-0000000007${String(n).padStart(2, "0")}`;
}

/** Fixture image dimensions for the fixture resolver; audio has none. */
export const FIXTURE_MEDIA_DIMENSIONS: Readonly<Record<string, { readonly width: number; readonly height: number }>> =
  Object.freeze({
    [FIXTURE_MEDIA_IDS.COVER]: Object.freeze({ width: 1200, height: 1600 }),
    [FIXTURE_MEDIA_IDS.GALLERY_1]: Object.freeze({ width: 1200, height: 800 }),
    [FIXTURE_MEDIA_IDS.GALLERY_2]: Object.freeze({ width: 800, height: 1200 }),
    [FIXTURE_MEDIA_IDS.GALLERY_3]: Object.freeze({ width: 1200, height: 1200 }),
    [FIXTURE_MEDIA_IDS.QR_GROOM]: Object.freeze({ width: 600, height: 600 }),
    [FIXTURE_MEDIA_IDS.QR_BRIDE]: Object.freeze({ width: 600, height: 600 }),
    [FIXTURE_MEDIA_IDS.PORTRAIT_GROOM]: Object.freeze({ width: 900, height: 1200 }),
    [FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE]: Object.freeze({ width: 900, height: 1200 }),
    [FIXTURE_MEDIA_IDS.PHOTO_STORY_1]: Object.freeze({ width: 960, height: 1200 }),
    [FIXTURE_MEDIA_IDS.PHOTO_STORY_2]: Object.freeze({ width: 960, height: 1200 }),
    [FIXTURE_MEDIA_IDS.PHOTO_STORY_3]: Object.freeze({ width: 960, height: 1200 }),
    [FIXTURE_MEDIA_IDS.PHOTO_STORY_4]: Object.freeze({ width: 1200, height: 1200 }),
    [FIXTURE_MEDIA_IDS.PHOTO_STORY_5]: Object.freeze({ width: 800, height: 1200 }),
    [FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO]: Object.freeze({ width: 1200, height: 1500 }),
  });

/** Free-form guest display names (CLAUDE.md §10): presentation only, never identity. */
export const FIXTURE_GUESTS: Readonly<Record<"NORMAL" | "LONG" | "PLAYFUL", Readonly<GuestOverlay>>> = Object.freeze({
  NORMAL: Object.freeze({ displayName: "Anh Tuấn và gia đình" }),
  LONG: Object.freeze({
    displayName: "Gia đình Chú Nguyễn Hoàng Phúc Trường cùng Cô Trần Thị Ngọc Bích Phương và các cháu",
  }),
  PLAYFUL: Object.freeze({ displayName: "Em và sự cô đơn" }),
});

/**
 * Ceremony-event lunar text, stored verbatim on the event (RF6). Fictional.
 * Display-ready short form with no "Tức ngày"/"Nhằm ngày" prefix of its own
 * (the renderer's separate "Tức ngày" label precedes it): the RF6 example
 * values for a 2026-10-17 Vu Quy / 2026-10-18 Thành Hôn, in the approved
 * Task029 casing ("08/09 Âm Lịch" for 18.10.2026). Never calculated.
 */
const FIXTURE_LUNAR = Object.freeze({
  VU_QUY: "07/09 Âm Lịch",
  THANH_HON: "08/09 Âm Lịch",
});

export type FixtureCeremonyLunar = "PRESENT" | "ABSENT";

/** Optional portrait rows (RF7 Product Owner amendment). */
export type FixturePortraits = "PRESENT" | "ABSENT";

export interface RendererFixtureSourceOptions {
  variant: InvitationVariant;
  /** `ABSENT` stores `null` lunar text on every ceremony event. Default `PRESENT`. */
  ceremonyLunar?: FixtureCeremonyLunar;
  /**
   * `PRESENT` adds one PORTRAIT_GROOM and one PORTRAIT_BRIDE row. Default
   * `ABSENT`: no portrait rows, so the payload is exactly the pre-portrait one.
   */
  portraits?: FixturePortraits;
  /** Task 028 `project_design.section_settings`. Default `{}` (no staff override). */
  sectionSettings?: Record<string, SnapshotDesignSettingValue>;
  /** `ABSENT`: no timeline rows. Default `PRESENT`: the Task029 three-step fixture timeline. */
  timeline?: FixtureTimeline;
  /** `PRESENT` adds the five Task029-cluster PHOTO_STORY rows. Default `ABSENT`. */
  photoStory?: FixturePortraits;
  /** `PRESENT` adds one LOVE_STORY_PHOTO row. Default `ABSENT`. */
  loveStoryPhoto?: FixturePortraits;
  /** Total GALLERY rows (default 3, the base images; up to 99). Fixture only, to prove unbounded galleries. */
  galleryCount?: number;
  /** `ABSENT`: no Dress Code. Default `PRESENT`: the Task029 Dress Code fixture. */
  dressCode?: FixtureDressCode;
}

/** Optional Dress Code (RF7 Dress Code amendment). */
export type FixtureDressCode = "PRESENT" | "ABSENT";

/** Task029 fixture Dress Code text and swatches (fixture content only, never a production default). */
export const FIXTURE_DRESS_CODE_DESCRIPTION =
  "Tông màu ấm, trang trọng và thoải mái vận động. Gia đình xin phép được ưu tiên các gam màu dưới đây, tránh sắc trắng/ngà dành riêng cho cô dâu.";

export const FIXTURE_DRESS_CODE_SWATCH_IDS = Object.freeze({
  GOLD: "00000000-0000-4000-8000-000000000501",
  BROWN: "00000000-0000-4000-8000-000000000502",
  BEIGE: "00000000-0000-4000-8000-000000000503",
  DEEP: "00000000-0000-4000-8000-000000000504",
});

function dressCodeSource(dressCode: FixtureDressCode): Pick<BuildSnapshotPayloadInput, "dressCode" | "dressCodeSwatches"> {
  if (dressCode === "ABSENT") return { dressCode: null, dressCodeSwatches: [] };
  // Supplied out of order on purpose: the builder orders by sortOrder, then id.
  return {
    dressCode: { projectId: FIXTURE_PROJECT_ID, description: FIXTURE_DRESS_CODE_DESCRIPTION },
    dressCodeSwatches: [
      { id: FIXTURE_DRESS_CODE_SWATCH_IDS.DEEP, projectId: FIXTURE_PROJECT_ID, color: "#3d352b", sortOrder: 4 },
      { id: FIXTURE_DRESS_CODE_SWATCH_IDS.GOLD, projectId: FIXTURE_PROJECT_ID, color: "#caa06a", sortOrder: 1 },
      { id: FIXTURE_DRESS_CODE_SWATCH_IDS.BEIGE, projectId: FIXTURE_PROJECT_ID, color: "#e8dcc8", sortOrder: 3 },
      { id: FIXTURE_DRESS_CODE_SWATCH_IDS.BROWN, projectId: FIXTURE_PROJECT_ID, color: "#7c5c42", sortOrder: 2 },
    ],
  };
}

/** Optional Timeline rows (RF7 Timeline amendment). */
export type FixtureTimeline = "PRESENT" | "ABSENT";

export const FIXTURE_TIMELINE_IDS = Object.freeze({
  WELCOME: "00000000-0000-4000-8000-000000000301",
  RITE: "00000000-0000-4000-8000-000000000302",
  FEAST: "00000000-0000-4000-8000-000000000303",
});

/**
 * The Task029 run-of-show (fixture content only, never a production default).
 * Supplied out of order on purpose: the builder orders by sortOrder, then id.
 */
function timelineItems(timeline: FixtureTimeline): BuildSnapshotPayloadInput["timelineItems"] {
  if (timeline === "ABSENT") return [];
  return [
    { id: FIXTURE_TIMELINE_IDS.FEAST, projectId: FIXTURE_PROJECT_ID, time: "11:00", label: "Khai tiệc", sortOrder: 3 },
    { id: FIXTURE_TIMELINE_IDS.WELCOME, projectId: FIXTURE_PROJECT_ID, time: "08:30", label: "Đón khách", sortOrder: 1 },
    { id: FIXTURE_TIMELINE_IDS.RITE, projectId: FIXTURE_PROJECT_ID, time: "09:00", label: "Làm lễ", sortOrder: 2 },
  ];
}

function weddingDetails(): FixtureWeddingDetails {
  return {
    projectId: FIXTURE_PROJECT_ID,
    groomName: "Nguyễn Minh Khôi",
    brideName: "Trần Ngọc Hân",
    groomFather: "Nguyễn Văn Đức",
    groomMother: "Phạm Thị Hồng",
    brideFather: "Trần Quốc Việt",
    brideMother: "Lê Thị Thu Hương",
    groomFamilyAddress: "12 Đường Hoa Sữa, Phường Bến Nghé, TP. Hồ Chí Minh",
    brideFamilyAddress: "45 Đường Phượng Vĩ, Phường Thạch Thang, TP. Đà Nẵng",
    invitationMessage: "Trân trọng kính mời quý khách đến chung vui cùng gia đình chúng tôi.",
    loveStory: "Chúng tôi gặp nhau vào một chiều mưa.\nBa năm sau, chúng tôi quyết định về chung một nhà.",
    groomBankName: "Ngân hàng Hoa Sữa",
    groomBankAccountName: "NGUYEN MINH KHOI",
    groomBankAccountNumber: "9001000000001",
    groomBankQrMediaId: FIXTURE_MEDIA_IDS.QR_GROOM,
    brideBankName: "Ngân hàng Phượng Vĩ",
    brideBankAccountName: "TRAN NGOC HAN",
    brideBankAccountNumber: "9001000000002",
    brideBankQrMediaId: FIXTURE_MEDIA_IDS.QR_BRIDE,
  };
}

function event(
  fields: Pick<
    FixtureEventRecord,
    "id" | "occasionType" | "side" | "title" | "startsAt" | "venueName" | "address" | "mapUrl" | "description" | "sortOrder" | "isPrimary" | "lunarDateDisplay"
  >,
): FixtureEventRecord {
  return {
    ...fields,
    projectId: FIXTURE_PROJECT_ID,
    timezone: FIXTURE_TIMEZONE,
    createdAt: FIXTURE_RECORD_TIMESTAMP,
    updatedAt: FIXTURE_RECORD_TIMESTAMP,
  };
}

/**
 * Four canonical events: a bride-side VU_QUY, a groom-side THANH_HON, a
 * bride-side reception and a COMMON reception. RF-01 alone decides which
 * are visible and which is the ceremony for each variant.
 *
 * Neutral canonical data, as staff might enter it: the ceremony titles carry
 * the home ("… tại tư gia …") and both ceremonies share sortOrder 1, so the
 * bride-side VU_QUY (17.10) sorts first in RF2 display order. Ceremony-card
 * presentation (GROOM before BRIDE, rite-derived titles) never depends on
 * either (docs/DECISIONS.md RF2 "Ceremony-card presentation").
 */
function events(lunar: FixtureCeremonyLunar): FixtureEventRecord[] {
  const present = lunar === "PRESENT";
  return [
    event({
      id: FIXTURE_EVENT_IDS.VU_QUY_BRIDE,
      occasionType: "VU_QUY",
      side: "BRIDE",
      title: "Lễ Vu Quy tại tư gia nhà gái",
      startsAt: "2026-10-17T02:00:00.000Z",
      venueName: "Tư gia nhà gái",
      address: "45 Đường Phượng Vĩ, Phường Thạch Thang, TP. Đà Nẵng",
      mapUrl: "https://maps.example.invalid/bride-home",
      description: null,
      sortOrder: 1,
      isPrimary: true,
      lunarDateDisplay: present ? FIXTURE_LUNAR.VU_QUY : null,
    }),
    event({
      id: FIXTURE_EVENT_IDS.THANH_HON_GROOM,
      occasionType: "THANH_HON",
      side: "GROOM",
      title: "Lễ Thành Hôn tại tư gia nhà trai",
      startsAt: "2026-10-18T02:00:00.000Z",
      venueName: "Tư gia nhà trai",
      address: "12 Đường Hoa Sữa, Phường Bến Nghé, TP. Hồ Chí Minh",
      mapUrl: "https://maps.example.invalid/groom-home",
      description: null,
      sortOrder: 1,
      isPrimary: true,
      lunarDateDisplay: present ? FIXTURE_LUNAR.THANH_HON : null,
    }),
    event({
      id: FIXTURE_EVENT_IDS.RECEPTION_BRIDE,
      occasionType: "RECEPTION",
      side: "BRIDE",
      title: "Tiệc cưới nhà gái",
      startsAt: "2026-10-17T05:00:00.000Z",
      venueName: "Nhà hàng Phượng Vĩ",
      address: "8 Đường Bạch Đằng, TP. Đà Nẵng",
      mapUrl: null,
      description: "Tiệc thân mật",
      sortOrder: 2,
      isPrimary: false,
      lunarDateDisplay: null,
    }),
    event({
      id: FIXTURE_EVENT_IDS.RECEPTION_COMMON,
      occasionType: "RECEPTION",
      side: "COMMON",
      title: "Tiệc cưới",
      startsAt: "2026-10-18T11:00:00.000Z",
      venueName: "Trung tâm Hội nghị Hoa Sữa",
      address: "200 Đường Hoa Sữa, TP. Hồ Chí Minh",
      mapUrl: "https://maps.example.invalid/reception",
      description: null,
      sortOrder: 3,
      isPrimary: false,
      lunarDateDisplay: null,
    }),
  ];
}

function media(
  portraits: FixturePortraits,
  photoStory: FixturePortraits = "ABSENT",
  loveStoryPhoto: FixturePortraits = "ABSENT",
  galleryCount = 3,
): BuildSnapshotPayloadInput["media"] {
  const storyRows: BuildSnapshotPayloadInput["media"] = [
    ...(photoStory === "PRESENT"
      ? FIXTURE_PHOTO_STORY_IDS.map((id, index) => ({
          id,
          projectId: FIXTURE_PROJECT_ID,
          mediaType: "PHOTO_STORY" as const,
          sortOrder: index,
        }))
      : []),
    ...(loveStoryPhoto === "PRESENT"
      ? [{ id: FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO, projectId: FIXTURE_PROJECT_ID, mediaType: "LOVE_STORY_PHOTO" as const, sortOrder: 0 }]
      : []),
  ];
  const extraGallery: BuildSnapshotPayloadInput["media"] = Array.from({ length: Math.max(0, galleryCount - 3) }, (_, i) => ({
    id: fixtureExtraGalleryId(i + 4),
    projectId: FIXTURE_PROJECT_ID,
    mediaType: "GALLERY" as const,
    sortOrder: i + 4,
  }));
  const portraitRows: BuildSnapshotPayloadInput["media"] =
    portraits === "PRESENT"
      ? [
          { id: FIXTURE_MEDIA_IDS.PORTRAIT_GROOM, projectId: FIXTURE_PROJECT_ID, mediaType: "PORTRAIT_GROOM", sortOrder: 0 },
          { id: FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE, projectId: FIXTURE_PROJECT_ID, mediaType: "PORTRAIT_BRIDE", sortOrder: 0 },
        ]
      : [];
  return [
    { id: FIXTURE_MEDIA_IDS.COVER, projectId: FIXTURE_PROJECT_ID, mediaType: "COVER", sortOrder: 0 },
    { id: FIXTURE_MEDIA_IDS.GALLERY_1, projectId: FIXTURE_PROJECT_ID, mediaType: "GALLERY", sortOrder: 1 },
    { id: FIXTURE_MEDIA_IDS.GALLERY_2, projectId: FIXTURE_PROJECT_ID, mediaType: "GALLERY", sortOrder: 2 },
    { id: FIXTURE_MEDIA_IDS.GALLERY_3, projectId: FIXTURE_PROJECT_ID, mediaType: "GALLERY", sortOrder: 3 },
    { id: FIXTURE_MEDIA_IDS.AUDIO, projectId: FIXTURE_PROJECT_ID, mediaType: "AUDIO", sortOrder: 0 },
    { id: FIXTURE_MEDIA_IDS.QR_GROOM, projectId: FIXTURE_PROJECT_ID, mediaType: "QR_GROOM", sortOrder: 0 },
    { id: FIXTURE_MEDIA_IDS.QR_BRIDE, projectId: FIXTURE_PROJECT_ID, mediaType: "QR_BRIDE", sortOrder: 0 },
    ...portraitRows,
    ...storyRows,
    ...extraGallery,
  ];
}

/**
 * A fresh RF-02 builder input bound to the Elegant Editorial v1 production
 * identity. The renderer key and design keys are read from the manifest
 * constant, never hand-typed a second time. Callers (RF-06B–D) may compose
 * scenarios by editing the returned fresh object before running the
 * pipeline; nothing is shared between calls.
 */
export function buildRendererFixtureSourceInput(options: RendererFixtureSourceOptions): BuildSnapshotPayloadInput {
  const { design, compatibility } = ELEGANT_EDITORIAL_V1_MANIFEST;
  return {
    project: { id: FIXTURE_PROJECT_ID, projectCode: FIXTURE_PROJECT_CODE },
    variant: options.variant,
    weddingDetails: weddingDetails(),
    events: events(options.ceremonyLunar ?? "PRESENT"),
    media: media(options.portraits ?? "ABSENT", options.photoStory, options.loveStoryPhoto, options.galleryCount),
    timelineItems: timelineItems(options.timeline ?? "PRESENT"),
    ...dressCodeSource(options.dressCode ?? "PRESENT"),
    design: {
      projectId: FIXTURE_PROJECT_ID,
      templateVersionId: FIXTURE_TEMPLATE_VERSION_ID,
      paletteKey: design.palettes[0],
      fontPresetKey: design.fontPresets[0],
      effectPresetKey: design.effectPresets[0],
      sectionSettings: { ...(options.sectionSettings ?? {}) },
      designSettings: {},
    },
    templateVersion: { id: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: compatibility.rendererKey },
  };
}
