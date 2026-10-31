import type {
  GuestOverlay,
  InvitationViewModel,
  MediaResolution,
  MediaResolver,
} from "../../../../lib/invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../../../lib/invitation-rendering/renderer-selection";
import type {
  BuildSnapshotPayloadInput,
  SnapshotDesignSettingValue,
} from "../../../../lib/invitation-rendering/snapshot-payload-types";
import {
  PRODUCTION_RENDERER_MANIFESTS,
  createProductionCompatibilityRegistry,
} from "../../../../templates/core/production-renderer-manifests";
import { runRendererFixturePipeline } from "../../../../templates/core/fixtures/renderer-fixture-pipeline";
import {
  FIXTURE_GUESTS,
  FIXTURE_MEDIA_IDS,
  buildRendererFixtureSourceInput,
  type RendererFixtureSourceOptions,
} from "../../../../templates/core/fixtures/renderer-fixture-sources";
import { HONG_AN_V1_EDITOR_MANIFEST } from "../../../../templates/editor/wedding/hong-an-v1";
import { HONG_AN_V1_MANIFEST } from "../../../../templates/wedding/hong-an/v1/manifest";

/**
 * HA-TEMPLATE-01 — local preview scenarios for the Hồng Ân renderer.
 *
 * Server-side composition only, over the REAL pure pipeline and the
 * existing fictional fixtures: canonical records → RF-02 Snapshot → RF-03
 * media resolution → RF-03 ViewModel → RF-04 selection. No Supabase, no
 * database, no network, no environment, no current time, no randomness.
 *
 * WHY ITS OWN REGISTRY. Hồng Ân is deliberately NOT registered in
 * production yet: catalog seeding, binding registration and the showroom
 * are separate release steps after visual QA. So this preview composes a
 * throwaway registry — the production manifests plus this one — with the
 * same factory the production registry uses, and passes it to the pipeline
 * through its existing `registry` option. `PRODUCTION_RENDERER_MANIFESTS`,
 * `PRODUCTION_COMPATIBILITY_REGISTRY` and the binding registry are not
 * touched, imported into, or changed by any of this.
 *
 * The scenario id selects a fixed fictional fixture view. It is never guest
 * identity and never authorization.
 */

/**
 * The preview's demo photographs: existing published showroom demo media,
 * REFERENCED by path, so this task adds no new image to the repository.
 *
 * They exist only in this internal preview's own scenario file and are
 * reached only through the injected fixture resolver. No renderer code,
 * manifest or production path knows them, so a real Project's media can
 * never be replaced by one of these: the renderer only ever draws what its
 * own ViewModel slots resolved to, and these ids resolve only here.
 *
 * The opening photograph is the V4 pack's own illustrative stand-in, which
 * is the picture the Product Owner approved the opening frames on.
 */
const PREVIEW_MEDIA_FILES: Readonly<Record<string, string>> = Object.freeze({
  [FIXTURE_MEDIA_IDS.COVER]: "/prototypes/hong-an/opening/hero-photo.jpg",
  [FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO]: "/showroom/demo/romantic-minimal/photos/03-our-love-bride-golden-garden.webp",
  [FIXTURE_MEDIA_IDS.PORTRAIT_GROOM]: "/showroom/demo/romantic-minimal/photos/10-thank-you-ivory-bow.webp",
  [FIXTURE_MEDIA_IDS.GALLERY_1]: "/showroom/demo/elegant-editorial/photos/01-cover-couple-portrait.webp",
  [FIXTURE_MEDIA_IDS.GALLERY_2]: "/showroom/demo/elegant-editorial/photos/04-ceremony-couple.webp",
  [FIXTURE_MEDIA_IDS.GALLERY_3]: "/showroom/demo/romantic-minimal/photos/07-garden-wedding-vows.webp",
  [FIXTURE_MEDIA_IDS.PHOTO_STORY_1]: "/showroom/demo/elegant-editorial/photos/09-bride-full-length.webp",
  [FIXTURE_MEDIA_IDS.PHOTO_STORY_2]: "/showroom/demo/romantic-minimal/photos/06-golden-hour-dance.webp",
  [FIXTURE_MEDIA_IDS.PHOTO_STORY_3]: "/showroom/demo/elegant-editorial/photos/10-wide-couple.webp",
  [FIXTURE_MEDIA_IDS.QR_GROOM]: "/showroom/demo/qr-demo-nha-trai.webp",
  [FIXTURE_MEDIA_IDS.QR_BRIDE]: "/showroom/demo/qr-demo-nha-gai.webp",
});

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * Deterministic preview `MediaResolver` over the RF-03 contract. Ids listed
 * as unavailable resolve `UNAVAILABLE`, so the "missing media" scenario
 * exercises the renderer's real absent-media paths. An id with no preview
 * file also resolves `UNAVAILABLE` rather than throwing, which is exactly
 * what a Project with a partly-filled album looks like.
 */
export function createHongAnPreviewResolver(unavailableMediaIds: readonly string[] = []): MediaResolver {
  const unavailable = new Set<string>(unavailableMediaIds);
  return Object.freeze({
    async resolveMedia(mediaId: string): Promise<MediaResolution> {
      if (unavailable.has(mediaId) || !hasOwn(PREVIEW_MEDIA_FILES, mediaId)) {
        return { status: "UNAVAILABLE", mediaId };
      }
      return {
        status: "RESOLVED",
        mediaId,
        url: PREVIEW_MEDIA_FILES[mediaId],
        width: null,
        height: null,
      };
    },
  });
}

/** The album, in the order a customer would have arranged it. */
const HONG_AN_GALLERY_IDS: readonly string[] = Object.freeze([
  FIXTURE_MEDIA_IDS.GALLERY_1,
  FIXTURE_MEDIA_IDS.GALLERY_2,
  FIXTURE_MEDIA_IDS.GALLERY_3,
  FIXTURE_MEDIA_IDS.PHOTO_STORY_1,
  FIXTURE_MEDIA_IDS.PHOTO_STORY_2,
  FIXTURE_MEDIA_IDS.PHOTO_STORY_3,
]);

/**
 * Hồng Ân's four slots, each filled from a fixture id of a slot-assignable
 * media type. Fictional fixture ids only.
 */
const HONG_AN_SLOT_MEDIA: Readonly<Record<string, readonly string[]>> = Object.freeze({
  openingPhoto: [FIXTURE_MEDIA_IDS.COVER],
  storyPhoto: [FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO],
  gallery: HONG_AN_GALLERY_IDS,
  closingPhoto: [FIXTURE_MEDIA_IDS.PORTRAIT_GROOM],
});

/**
 * Re-points a built fixture input at `wedding.hong-an.v1`: the design keys
 * its own manifest declares and the TEMPLATE_SLOTS assignments above. Pure
 * and local. The slot keys come from the template's own editor manifest
 * rather than being hand-listed, so they cannot drift from it.
 */
function toHongAnSource(input: BuildSnapshotPayloadInput): BuildSnapshotPayloadInput {
  const { compatibility, design } = HONG_AN_V1_MANIFEST;
  const declared = HONG_AN_V1_EDITOR_MANIFEST.mediaSlots;
  return {
    ...input,
    design: {
      ...input.design,
      paletteKey: design.palettes[0] as string,
      fontPresetKey: design.fontPresets[0] as string,
      effectPresetKey: design.effectPresets[0] as string,
    },
    templateVersion: { ...input.templateVersion, rendererKey: compatibility.rendererKey },
    templateMedia: {
      // Every declared slot, so an unfilled one is `[]` rather than missing.
      slots: Object.fromEntries(declared.map((slot) => [slot.key, HONG_AN_SLOT_MEDIA[slot.key] ?? []])),
      gallerySlotKeys: declared.filter((slot) => slot.sectionKey === "gallery").map((slot) => slot.key),
    },
  };
}

/** Production manifests plus Hồng Ân — preview only; the production registry is untouched. */
const PREVIEW_REGISTRY = createProductionCompatibilityRegistry([
  ...PRODUCTION_RENDERER_MANIFESTS,
  HONG_AN_V1_MANIFEST,
]);

interface PreviewScenarioDefinition {
  readonly label: string;
  readonly source: RendererFixtureSourceOptions;
  readonly guest?: GuestOverlay;
  readonly unavailableMediaIds?: readonly string[];
}

/**
 * The fixture media rows every Hồng Ân slot assignment needs.
 *
 * The slot map above names LOVE_STORY_PHOTO, PHOTO_STORY_* and
 * PORTRAIT_GROOM ids, and the Snapshot builder rightly refuses a slot that
 * references a photo the Project does not have. So every scenario creates
 * those rows; a scenario that wants a photo MISSING takes it away through
 * `unavailableMediaIds`, which is what an unresolvable photo really looks
 * like at runtime — not by removing the Project's assignment.
 */
const SLOT_MEDIA_PRESENT = {
  portraits: "PRESENT",
  photoStory: "PRESENT",
  loveStoryPhoto: "PRESENT",
} as const;

const ALL_OPTIONAL_SECTIONS_OFF: Record<string, SnapshotDesignSettingValue> = Object.freeze({
  invitationMessage: false,
  loveStory: false,
  gallery: false,
  music: false,
  gift: false,
  timeline: false,
  dressCode: false,
  photoStory: false,
});

export const HONG_AN_PREVIEW_SCENARIOS = Object.freeze({
  "common-full": {
    label: "COMMON — đầy đủ, có khách mời",
    source: { variant: "COMMON", ...SLOT_MEDIA_PRESENT },
    guest: FIXTURE_GUESTS.NORMAL,
  },
  groom: {
    label: "GROOM — Lễ Thành Hôn",
    source: { variant: "GROOM", ...SLOT_MEDIA_PRESENT },
  },
  bride: {
    label: "BRIDE — Lễ Vu Quy, tên khách vui",
    source: { variant: "BRIDE", ...SLOT_MEDIA_PRESENT },
    guest: FIXTURE_GUESTS.PLAYFUL,
  },
  "long-guest": {
    label: "Tên khách rất dài",
    source: { variant: "COMMON", ...SLOT_MEDIA_PRESENT },
    guest: FIXTURE_GUESTS.LONG,
  },
  "sections-minimal": {
    label: "Tắt mọi mục tuỳ chọn",
    source: { variant: "COMMON", ...SLOT_MEDIA_PRESENT, sectionSettings: ALL_OPTIONAL_SECTIONS_OFF },
  },
  "no-photos": {
    label: "Chưa có ảnh nào",
    source: { variant: "COMMON", ...SLOT_MEDIA_PRESENT },
    unavailableMediaIds: [
      FIXTURE_MEDIA_IDS.COVER,
      FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO,
      FIXTURE_MEDIA_IDS.PORTRAIT_GROOM,
      ...HONG_AN_GALLERY_IDS,
    ],
  },
  "partial-media": {
    label: "Thiếu một số ảnh và QR nhà trai",
    source: { variant: "COMMON", ...SLOT_MEDIA_PRESENT },
    unavailableMediaIds: [FIXTURE_MEDIA_IDS.GALLERY_2, FIXTURE_MEDIA_IDS.QR_GROOM, FIXTURE_MEDIA_IDS.PORTRAIT_GROOM],
  },
  "no-lunar": {
    label: "Không có ngày âm lịch",
    source: { variant: "COMMON", ...SLOT_MEDIA_PRESENT, ceremonyLunar: "ABSENT" },
  },
  "no-timeline": {
    label: "Không có lịch trình",
    source: { variant: "COMMON", ...SLOT_MEDIA_PRESENT, timeline: "ABSENT" },
  },
} as const satisfies Record<string, PreviewScenarioDefinition>);

export type HongAnPreviewScenarioId = keyof typeof HONG_AN_PREVIEW_SCENARIOS;

export const HONG_AN_PREVIEW_SCENARIO_IDS = Object.freeze(
  Object.keys(HONG_AN_PREVIEW_SCENARIOS) as HongAnPreviewScenarioId[],
);

export const DEFAULT_HONG_AN_PREVIEW_SCENARIO_ID: HongAnPreviewScenarioId = "common-full";

export function isHongAnPreviewScenarioId(value: string): value is HongAnPreviewScenarioId {
  return hasOwn(HONG_AN_PREVIEW_SCENARIOS, value);
}

/** Exactly the serializable data the preview client receives. */
export interface HongAnPreviewData {
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
}

export async function buildHongAnPreviewData(id: HongAnPreviewScenarioId): Promise<HongAnPreviewData> {
  const scenario: PreviewScenarioDefinition = HONG_AN_PREVIEW_SCENARIOS[id];
  const source = toHongAnSource(buildRendererFixtureSourceInput(scenario.source));
  const fixture = await runRendererFixturePipeline(source, {
    resolver: createHongAnPreviewResolver(scenario.unavailableMediaIds),
    registry: PREVIEW_REGISTRY,
    ...(scenario.guest === undefined ? {} : { guest: { displayName: scenario.guest.displayName } }),
  });
  return { viewModel: fixture.viewModel, sections: fixture.selection.effectiveSections };
}
