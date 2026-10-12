import type { InvitationVariant } from "../../domain";
import type {
  BuildSnapshotPayloadInput,
  SnapshotMediaSource,
} from "../../invitation-rendering/snapshot-payload-types";
import { buildTemplateMediaSource } from "../../server/invitation-snapshot/build-template-media-source";
import type { TemplateMediaSlotItem } from "../../server/template-media/template-media-slot-types";
import {
  TEMPLATE_EDITOR_PERSON_BOUND_SLOT_EXCEPTIONS,
  type TemplateEditorMediaSlotV1,
} from "../../../templates/core/editor-manifest";
import { lookupTemplateEditorManifest } from "../../../templates/core/production-editor-manifests";
import { PRODUCTION_COMPATIBILITY_REGISTRY } from "../../../templates/core/production-renderer-manifests";
import { DEMO_IMAGES, type DemoImage, type DemoImageOrientation } from "./demo-media";

/**
 * LAUNCH-P0-04 — canonical source records of the fictional showroom couple.
 *
 * These are RF-02 builder INPUT records (as Staff would enter them), never a
 * hand-built Snapshot or ViewModel: every demo runs the frozen production
 * pipeline. Fictional people, fictional venues, a clearly-demo bank, no QR
 * image (nothing scannable), no audio. Fixed literals only: no database,
 * network, current time or randomness.
 *
 * Generic over renderer keys: design keys come from the production renderer
 * manifest and template slots from the production editor manifest, so a new
 * registered template needs no change here.
 *
 * Event dates are fixed in the future (Saturday 2027-12-04 / Sunday
 * 2027-12-05, Asia/Ho_Chi_Minh). Lunar text is stored verbatim like any
 * Project's and was computed for exactly these dates (07/11 and 08/11 Âm
 * Lịch, year Đinh Mùi). A test fails before the dates pass; move them (and
 * recompute the lunar text) when it does.
 */

export const DEMO_PROJECT_ID = "00000000-0000-4000-8000-00000000de00";
const DEMO_PROJECT_CODE = "WC-DEMO-0001";
const DEMO_TEMPLATE_VERSION_ID = "00000000-0000-4000-8000-00000000de01";
const DEMO_TIMESTAMP = "2027-01-01T00:00:00.000Z";
const DEMO_TIMEZONE = "Asia/Ho_Chi_Minh";

export const DEMO_COUPLE = Object.freeze({ groomName: "Trần Gia Huy", brideName: "Nguyễn Khánh Linh" });

export const DEMO_EVENT_STARTS = Object.freeze({
  /** Saturday 2027-12-04 09:00 Asia/Ho_Chi_Minh. */
  VU_QUY: "2027-12-04T02:00:00.000Z",
  /** Saturday 2027-12-04 11:30 Asia/Ho_Chi_Minh. */
  BRIDE_RECEPTION: "2027-12-04T04:30:00.000Z",
  /** Sunday 2027-12-05 09:00 Asia/Ho_Chi_Minh. */
  THANH_HON: "2027-12-05T02:00:00.000Z",
  /** Sunday 2027-12-05 18:00 Asia/Ho_Chi_Minh. */
  RECEPTION: "2027-12-05T11:00:00.000Z",
});

function mapsSearch(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

type DemoEvent = BuildSnapshotPayloadInput["events"][number];

function event(fields: Omit<DemoEvent, "projectId" | "timezone" | "createdAt" | "updatedAt">): DemoEvent {
  return { ...fields, projectId: DEMO_PROJECT_ID, timezone: DEMO_TIMEZONE, createdAt: DEMO_TIMESTAMP, updatedAt: DEMO_TIMESTAMP };
}

const BRIDE_HOME = "Phố Phan Đình Phùng, Ba Đình, Hà Nội";
const GROOM_HOME = "Phố Hàng Bông, Hoàn Kiếm, Hà Nội";
const RECEPTION_ADDRESS = "Đường Thanh Niên, Tây Hồ, Hà Nội";

function demoEvents(): BuildSnapshotPayloadInput["events"] {
  return [
    event({
      id: "00000000-0000-4000-8000-00000000de11",
      occasionType: "VU_QUY",
      side: "BRIDE",
      title: "Lễ Vu Quy",
      startsAt: DEMO_EVENT_STARTS.VU_QUY,
      venueName: "Tư gia nhà gái",
      address: BRIDE_HOME,
      mapUrl: mapsSearch(BRIDE_HOME),
      description: null,
      sortOrder: 1,
      isPrimary: true,
      lunarDateDisplay: "07/11 Âm Lịch",
    }),
    event({
      id: "00000000-0000-4000-8000-00000000de12",
      occasionType: "THANH_HON",
      side: "GROOM",
      title: "Lễ Thành Hôn",
      startsAt: DEMO_EVENT_STARTS.THANH_HON,
      venueName: "Tư gia nhà trai",
      address: GROOM_HOME,
      mapUrl: mapsSearch(GROOM_HOME),
      description: null,
      sortOrder: 1,
      isPrimary: true,
      lunarDateDisplay: "08/11 Âm Lịch",
    }),
    event({
      id: "00000000-0000-4000-8000-00000000de13",
      occasionType: "RECEPTION",
      side: "BRIDE",
      title: "Tiệc cưới nhà gái",
      startsAt: DEMO_EVENT_STARTS.BRIDE_RECEPTION,
      venueName: "Tư gia nhà gái",
      address: BRIDE_HOME,
      mapUrl: mapsSearch(BRIDE_HOME),
      description: null,
      sortOrder: 2,
      isPrimary: false,
      lunarDateDisplay: null,
    }),
    event({
      id: "00000000-0000-4000-8000-00000000de14",
      occasionType: "RECEPTION",
      side: "COMMON",
      title: "Tiệc cưới",
      startsAt: DEMO_EVENT_STARTS.RECEPTION,
      venueName: "Sảnh tiệc Hoa Ngà",
      address: RECEPTION_ADDRESS,
      mapUrl: mapsSearch(RECEPTION_ADDRESS),
      description: null,
      sortOrder: 3,
      isPrimary: false,
      lunarDateDisplay: null,
    }),
  ];
}

function demoWeddingDetails(): NonNullable<BuildSnapshotPayloadInput["weddingDetails"]> {
  return {
    projectId: DEMO_PROJECT_ID,
    groomName: DEMO_COUPLE.groomName,
    brideName: DEMO_COUPLE.brideName,
    groomFather: "Trần Văn Bình",
    groomMother: "Lê Thị Mai",
    brideFather: "Nguyễn Đức Hải",
    brideMother: "Phạm Thị Thu",
    groomFamilyAddress: GROOM_HOME,
    brideFamilyAddress: BRIDE_HOME,
    invitationMessage: "Sự hiện diện của quý khách là niềm vinh hạnh cho gia đình chúng tôi.",
    loveStory:
      "Chúng mình gặp nhau trong một buổi chiều mưa ở hiệu sách cũ, cùng với tay lấy một cuốn thơ.\nSau năm năm đi qua bao mùa hoa sữa, chúng mình quyết định về chung một nhà.",
    groomBankName: "Ngân hàng Demo (thiệp mẫu)",
    groomBankAccountName: "TRAN GIA HUY",
    groomBankAccountNumber: "0000000001",
    groomBankQrMediaId: null,
    brideBankName: "Ngân hàng Demo (thiệp mẫu)",
    brideBankAccountName: "NGUYEN KHANH LINH",
    brideBankAccountNumber: "0000000002",
    brideBankQrMediaId: null,
  };
}

function demoTimeline(): BuildSnapshotPayloadInput["timelineItems"] {
  return [
    { id: "00000000-0000-4000-8000-00000000de21", projectId: DEMO_PROJECT_ID, time: "17:30", label: "Đón khách", sortOrder: 1 },
    { id: "00000000-0000-4000-8000-00000000de22", projectId: DEMO_PROJECT_ID, time: "18:00", label: "Làm lễ", sortOrder: 2 },
    { id: "00000000-0000-4000-8000-00000000de23", projectId: DEMO_PROJECT_ID, time: "18:30", label: "Khai tiệc", sortOrder: 3 },
  ];
}

function demoDressCode(): Pick<BuildSnapshotPayloadInput, "dressCode" | "dressCodeSwatches"> {
  return {
    dressCode: { projectId: DEMO_PROJECT_ID, description: "Gam màu trung tính, ấm áp. Xin tránh trang phục trắng dành cho cô dâu." },
    dressCodeSwatches: [
      { id: "00000000-0000-4000-8000-00000000de31", projectId: DEMO_PROJECT_ID, color: "#d8c3a5", sortOrder: 1 },
      { id: "00000000-0000-4000-8000-00000000de32", projectId: DEMO_PROJECT_ID, color: "#a68a6d", sortOrder: 2 },
      { id: "00000000-0000-4000-8000-00000000de33", projectId: DEMO_PROJECT_ID, color: "#6f7d64", sortOrder: 3 },
    ],
  };
}

/** Gallery-type slots without a finite maximum show this many demo images. */
const DEMO_GALLERY_COUNT = 6;

/** Deterministic demo media id `n` (1-based). */
function demoMediaId(n: number): string {
  return `00000000-0000-4000-8000-00000000d${String(n).padStart(3, "0")}`;
}

/** Picks demo images by orientation in a stable rotation so neighbours differ. */
class DemoImagePicker {
  private readonly cursor = new Map<string, number>();

  next(orientation: DemoImageOrientation | "ANY"): DemoImage {
    const pool = orientation === "ANY" ? DEMO_IMAGES : DEMO_IMAGES.filter((image) => image.orientation === orientation);
    const index = this.cursor.get(orientation) ?? 0;
    this.cursor.set(orientation, index + 1);
    const image = pool[index % pool.length];
    if (image === undefined) throw new Error("Showroom demo has no image for an orientation");
    return image;
  }
}

export interface DemoWeddingSource {
  readonly input: BuildSnapshotPayloadInput;
  /** Demo media id → image, for the demo resolver. */
  readonly imageById: ReadonlyMap<string, DemoImage>;
}

function slotImageCount(slot: TemplateEditorMediaSlotV1): number {
  if (slot.cardinality === "SINGLE") return 1;
  return slot.maxCount ?? DEMO_GALLERY_COUNT;
}

function isPersonBoundSlot(rendererKey: string, slotKey: string): boolean {
  return Object.hasOwn(TEMPLATE_EDITOR_PERSON_BOUND_SLOT_EXCEPTIONS, rendererKey)
    && TEMPLATE_EDITOR_PERSON_BOUND_SLOT_EXCEPTIONS[rendererKey]?.includes(slotKey) === true;
}

/**
 * Builds the demo canonical input for one registered production renderer and
 * one variant. Throws for an unregistered key (fail closed).
 */
export function buildDemoWeddingSource(rendererKey: string, variant: InvitationVariant): DemoWeddingSource {
  const manifest = PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(rendererKey);
  const editor = lookupTemplateEditorManifest(rendererKey);
  if (manifest === undefined || editor === undefined) {
    throw new Error("Showroom demo renderer is not a registered production renderer");
  }

  const picker = new DemoImagePicker();
  const imageById = new Map<string, DemoImage>();
  const media: SnapshotMediaSource[] = [];
  let next = 1;
  const add = (mediaType: SnapshotMediaSource["mediaType"], orientation: DemoImageOrientation | "ANY", sortOrder: number): string => {
    const id = demoMediaId(next++);
    imageById.set(id, picker.next(orientation));
    media.push({ id, projectId: DEMO_PROJECT_ID, mediaType, sortOrder });
    return id;
  };

  let templateMedia: BuildSnapshotPayloadInput["templateMedia"];
  if (editor.mediaModel === "TEMPLATE_SLOTS") {
    // Person-bound portrait slots stay empty: abstract images never pose as a person.
    const rows: TemplateMediaSlotItem[] = editor.mediaSlots
      .filter((slot) => !isPersonBoundSlot(rendererKey, slot.key))
      .flatMap((slot) =>
        Array.from({ length: slotImageCount(slot) }, (_, position) => ({
          slotKey: slot.key,
          position,
          projectMediaId: add("PHOTO", slot.orientation, next),
        })),
      );
    templateMedia = buildTemplateMediaSource(editor, rows, media);
  } else {
    // LEGACY_ROLES: cover, gallery, photo story and love story photo; no portraits (see above).
    add("COVER", "PORTRAIT", 0);
    for (let i = 0; i < DEMO_GALLERY_COUNT; i += 1) add("GALLERY", "ANY", i + 1);
    for (let i = 0; i < 5; i += 1) add("PHOTO_STORY", i === 3 ? "SQUARE" : "PORTRAIT", i);
    add("LOVE_STORY_PHOTO", "PORTRAIT", 0);
  }

  const { design } = manifest;
  const input: BuildSnapshotPayloadInput = {
    project: { id: DEMO_PROJECT_ID, projectCode: DEMO_PROJECT_CODE },
    variant,
    weddingDetails: demoWeddingDetails(),
    events: demoEvents(),
    media,
    timelineItems: demoTimeline(),
    ...demoDressCode(),
    design: {
      projectId: DEMO_PROJECT_ID,
      templateVersionId: DEMO_TEMPLATE_VERSION_ID,
      paletteKey: design.palettes[0] ?? null,
      fontPresetKey: design.fontPresets[0] ?? null,
      effectPresetKey: design.effectPresets[0] ?? null,
      sectionSettings: {},
      designSettings: {},
    },
    templateVersion: { id: DEMO_TEMPLATE_VERSION_ID, rendererKey },
    ...(templateMedia === undefined ? {} : { templateMedia }),
  };
  return { input, imageById };
}
