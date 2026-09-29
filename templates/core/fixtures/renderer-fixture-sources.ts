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
});

/** Fixture image dimensions for the fixture resolver; audio has none. */
export const FIXTURE_MEDIA_DIMENSIONS: Readonly<Record<string, { readonly width: number; readonly height: number }>> =
  Object.freeze({
    [FIXTURE_MEDIA_IDS.COVER]: Object.freeze({ width: 1200, height: 1600 }),
    [FIXTURE_MEDIA_IDS.GALLERY_1]: Object.freeze({ width: 1200, height: 800 }),
    [FIXTURE_MEDIA_IDS.GALLERY_2]: Object.freeze({ width: 800, height: 1200 }),
    [FIXTURE_MEDIA_IDS.GALLERY_3]: Object.freeze({ width: 1200, height: 1200 }),
    [FIXTURE_MEDIA_IDS.QR_GROOM]: Object.freeze({ width: 600, height: 600 }),
    [FIXTURE_MEDIA_IDS.QR_BRIDE]: Object.freeze({ width: 600, height: 600 }),
  });

/** Free-form guest display names (CLAUDE.md §10): presentation only, never identity. */
export const FIXTURE_GUESTS: Readonly<Record<"NORMAL" | "LONG" | "PLAYFUL", Readonly<GuestOverlay>>> = Object.freeze({
  NORMAL: Object.freeze({ displayName: "Anh Tuấn và gia đình" }),
  LONG: Object.freeze({
    displayName: "Gia đình Chú Nguyễn Hoàng Phúc Trường cùng Cô Trần Thị Ngọc Bích Phương và các cháu",
  }),
  PLAYFUL: Object.freeze({ displayName: "Em và sự cô đơn" }),
});

/** Ceremony-event lunar text, stored verbatim on the event (RF6). Fictional. */
const FIXTURE_LUNAR = Object.freeze({
  VU_QUY: "Nhằm ngày 08 tháng 09 năm Bính Ngọ",
  THANH_HON: "Nhằm ngày 09 tháng 09 năm Bính Ngọ",
});

export type FixtureCeremonyLunar = "PRESENT" | "ABSENT";

export interface RendererFixtureSourceOptions {
  variant: InvitationVariant;
  /** `ABSENT` stores `null` lunar text on every ceremony event. Default `PRESENT`. */
  ceremonyLunar?: FixtureCeremonyLunar;
  /** Task 028 `project_design.section_settings`. Default `{}` (no staff override). */
  sectionSettings?: Record<string, SnapshotDesignSettingValue>;
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

function media(): BuildSnapshotPayloadInput["media"] {
  return [
    { id: FIXTURE_MEDIA_IDS.COVER, projectId: FIXTURE_PROJECT_ID, mediaType: "COVER", sortOrder: 0 },
    { id: FIXTURE_MEDIA_IDS.GALLERY_1, projectId: FIXTURE_PROJECT_ID, mediaType: "GALLERY", sortOrder: 1 },
    { id: FIXTURE_MEDIA_IDS.GALLERY_2, projectId: FIXTURE_PROJECT_ID, mediaType: "GALLERY", sortOrder: 2 },
    { id: FIXTURE_MEDIA_IDS.GALLERY_3, projectId: FIXTURE_PROJECT_ID, mediaType: "GALLERY", sortOrder: 3 },
    { id: FIXTURE_MEDIA_IDS.AUDIO, projectId: FIXTURE_PROJECT_ID, mediaType: "AUDIO", sortOrder: 0 },
    { id: FIXTURE_MEDIA_IDS.QR_GROOM, projectId: FIXTURE_PROJECT_ID, mediaType: "QR_GROOM", sortOrder: 0 },
    { id: FIXTURE_MEDIA_IDS.QR_BRIDE, projectId: FIXTURE_PROJECT_ID, mediaType: "QR_BRIDE", sortOrder: 0 },
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
    media: media(),
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
