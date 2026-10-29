import type {
  GuestOverlay,
  InvitationViewModel,
  MediaResolution,
  MediaResolver,
} from "../../../lib/invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../../lib/invitation-rendering/renderer-selection";
import type {
  BuildSnapshotPayloadInput,
  SnapshotDesignSettingValue,
} from "../../../lib/invitation-rendering/snapshot-payload-types";
import { runRendererFixturePipeline } from "../../../templates/core/fixtures/renderer-fixture-pipeline";
import { SE_DUYEN_V2_EDITOR_MANIFEST } from "../../../templates/editor/wedding/se-duyen-v2";
import { SE_DUYEN_V2_MANIFEST } from "../../../templates/wedding/se-duyen/v2/manifest";
import {
  FIXTURE_GUESTS,
  FIXTURE_MEDIA_DIMENSIONS,
  FIXTURE_MEDIA_IDS,
  fixtureExtraGalleryId,
  buildRendererFixtureSourceInput,
  type RendererFixtureSourceOptions,
} from "../../../templates/core/fixtures/renderer-fixture-sources";

/**
 * Invitation Rendering Foundation RF-06B — internal renderer harness
 * scenarios (docs/DECISIONS.md "RF-06-0 …" P23, P38).
 *
 * Server-side composition only. Runs the real pure pipeline over the RF-06A
 * fictional fixtures: canonical records → RF-02 Snapshot → RF-03 media
 * resolution (the harness resolver below) → RF-03 ViewModel → RF-04
 * selection over the server-safe production compatibility registry. No
 * Supabase, database, network, environment, current time or randomness.
 *
 * The scenario id is a harness view selector only. It is never guest
 * identity or authorization; guest overlays come from the fixed fictional
 * RF-06A fixture names.
 */

/** Harness-owned fictional fixture media (never under `public/renderers/**`). */
export const HARNESS_MEDIA_BASE_PATH = "/internal/renderer-harness/";

/**
 * RF-06D: the harness-only audio fixture, a short quiet tone generated in
 * this repository (see harness-audio-provenance.md). Served only when a
 * scenario opts in with `resolveAudio`.
 */
export const HARNESS_AUDIO_FILE = "audio-tone.wav";

const HARNESS_MEDIA_FILES: Readonly<Record<string, string>> = Object.freeze({
  [FIXTURE_MEDIA_IDS.COVER]: "cover.svg",
  [FIXTURE_MEDIA_IDS.GALLERY_1]: "gallery-1.svg",
  [FIXTURE_MEDIA_IDS.GALLERY_2]: "gallery-2.svg",
  [FIXTURE_MEDIA_IDS.GALLERY_3]: "gallery-3.svg",
  [FIXTURE_MEDIA_IDS.QR_GROOM]: "qr-groom.svg",
  [FIXTURE_MEDIA_IDS.QR_BRIDE]: "qr-bride.svg",
  [FIXTURE_MEDIA_IDS.PORTRAIT_GROOM]: "portrait-groom.svg",
  [FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE]: "portrait-bride.svg",
  [FIXTURE_MEDIA_IDS.PHOTO_STORY_1]: "photo-story-1.svg",
  [FIXTURE_MEDIA_IDS.PHOTO_STORY_2]: "photo-story-2.svg",
  [FIXTURE_MEDIA_IDS.PHOTO_STORY_3]: "photo-story-3.svg",
  [FIXTURE_MEDIA_IDS.PHOTO_STORY_4]: "photo-story-4.svg",
  [FIXTURE_MEDIA_IDS.PHOTO_STORY_5]: "photo-story-5.svg",
  [FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO]: "love-story.svg",
  // Fixture-only extra gallery images (gallery-many) reuse the three gallery placeholders in turn.
  ...Object.fromEntries(
    Array.from({ length: 22 }, (_, i) => [fixtureExtraGalleryId(i + 4), `gallery-${(i % 3) + 1}.svg`]),
  ),
});

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export interface HarnessMediaResolverOptions {
  /** RF-06D: resolve the fixture audio to the local harness tone instead of `UNAVAILABLE`. */
  readonly resolveAudio?: boolean;
}

/**
 * Deterministic harness `MediaResolver` over the RF-03 contract. Fixture
 * images resolve to local harness paths; ids listed as unavailable resolve
 * `UNAVAILABLE`. The fixture audio resolves `UNAVAILABLE` unless the
 * scenario opts in with `resolveAudio`, in which case it resolves to the
 * local harness tone (RF-06D). An id outside the fixture set is a fixture
 * bug and throws.
 */
export function createHarnessMediaResolver(
  unavailableMediaIds: readonly string[] = [],
  options: HarnessMediaResolverOptions = {},
): MediaResolver {
  const unavailable = new Set<string>(unavailableMediaIds);
  const resolveAudio = options.resolveAudio === true;
  return Object.freeze({
    async resolveMedia(mediaId: string): Promise<MediaResolution> {
      if (unavailable.has(mediaId) || (mediaId === FIXTURE_MEDIA_IDS.AUDIO && !resolveAudio)) {
        return { status: "UNAVAILABLE", mediaId };
      }
      if (mediaId === FIXTURE_MEDIA_IDS.AUDIO) {
        return {
          status: "RESOLVED",
          mediaId,
          url: `${HARNESS_MEDIA_BASE_PATH}${HARNESS_AUDIO_FILE}`,
          width: null,
          height: null,
        };
      }
      if (!hasOwn(HARNESS_MEDIA_FILES, mediaId)) {
        throw new Error("Renderer harness fixture media id has no harness image");
      }
      const dimensions = hasOwn(FIXTURE_MEDIA_DIMENSIONS, mediaId) ? FIXTURE_MEDIA_DIMENSIONS[mediaId] : undefined;
      return {
        status: "RESOLVED",
        mediaId,
        url: `${HARNESS_MEDIA_BASE_PATH}${HARNESS_MEDIA_FILES[mediaId]}`,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      };
    },
  });
}

/**
 * SD-V2-01 harness scenario data: the ten album photographs, in order,
 * assembled from fixture media that already have a local placeholder in
 * `HARNESS_MEDIA_FILES` — no new image is added.
 *
 * The three named gallery images come first, then the five photo-story ones
 * (`PHOTO_STORY` is slot-assignable, and Se Duyên renders no photo-story
 * section, so those rows are free to use here), then two gallery extras.
 * That ordering is deliberate: the harness ships only three gallery
 * placeholders and recycles them for the extras, so taking the photo-story
 * images gives EIGHT visibly different pictures across the ten tiles —
 * enough to check the grid order and step the viewer through it by eye.
 */
const SE_DUYEN_V2_GALLERY_IDS: readonly string[] = Object.freeze([
  FIXTURE_MEDIA_IDS.GALLERY_1,
  FIXTURE_MEDIA_IDS.GALLERY_2,
  FIXTURE_MEDIA_IDS.GALLERY_3,
  FIXTURE_MEDIA_IDS.PHOTO_STORY_1,
  FIXTURE_MEDIA_IDS.PHOTO_STORY_2,
  FIXTURE_MEDIA_IDS.PHOTO_STORY_3,
  FIXTURE_MEDIA_IDS.PHOTO_STORY_4,
  FIXTURE_MEDIA_IDS.PHOTO_STORY_5,
  fixtureExtraGalleryId(4),
  fixtureExtraGalleryId(5),
]);

/**
 * Se Duyên's five positional slots, each filled from an existing fixture
 * image of a slot-assignable media type (COVER, PORTRAIT_*, GALLERY,
 * LOVE_STORY_PHOTO). Fictional fixture ids only.
 */
const SE_DUYEN_V2_SLOT_MEDIA: Readonly<Record<string, readonly string[]>> = Object.freeze({
  openingPhoto: [FIXTURE_MEDIA_IDS.COVER],
  portraitLead: [FIXTURE_MEDIA_IDS.PORTRAIT_GROOM],
  portraitAside: [FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE],
  gallery: SE_DUYEN_V2_GALLERY_IDS,
  closingPhoto: [FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO],
});

/**
 * Re-points a built fixture input at `wedding.se-duyen.v2`: its pinned
 * template version, the design keys its own manifest declares, and the
 * TEMPLATE_SLOTS assignments above. Pure and local — no database, no
 * network, no environment, and no media id that is not a fixture id. The
 * slot keys and the gallery-backed ones are read from Se Duyên v2's own
 * editor manifest rather than hand-listed, so they cannot drift from it.
 */
function toSeDuyenV2Source(input: BuildSnapshotPayloadInput): BuildSnapshotPayloadInput {
  const { compatibility, design } = SE_DUYEN_V2_MANIFEST;
  const declared = SE_DUYEN_V2_EDITOR_MANIFEST.mediaSlots;
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
      slots: Object.fromEntries(declared.map((slot) => [slot.key, SE_DUYEN_V2_SLOT_MEDIA[slot.key] ?? []])),
      gallerySlotKeys: declared.filter((slot) => slot.sectionKey === "gallery").map((slot) => slot.key),
    },
  };
}

interface HarnessScenarioDefinition {
  readonly label: string;
  readonly source: RendererFixtureSourceOptions;
  readonly guest?: GuestOverlay;
  readonly unavailableMediaIds?: readonly string[];
  readonly resolveAudio?: boolean;
  /**
   * Rewrites the built fixture input so a scenario can render a registered
   * renderer other than the default one. Pure; fixture data only.
   */
  readonly overrideSource?: (input: BuildSnapshotPayloadInput) => BuildSnapshotPayloadInput;
}

const ALL_SECTIONS_OFF: Record<string, SnapshotDesignSettingValue> = Object.freeze({
  invitationMessage: false,
  loveStory: false,
  gallery: false,
  music: false,
  gift: false,
  timeline: false,
  dressCode: false,
  photoStory: false,
});

export const HARNESS_SCENARIOS = Object.freeze({
  "common-full": {
    label: "COMMON — đầy đủ, khách mời",
    source: { variant: "COMMON", portraits: "PRESENT", photoStory: "PRESENT", loveStoryPhoto: "PRESENT" },
    guest: FIXTURE_GUESTS.NORMAL,
  },
  groom: {
    label: "GROOM — không cá nhân hoá",
    source: { variant: "GROOM", portraits: "PRESENT", photoStory: "PRESENT", loveStoryPhoto: "PRESENT" },
  },
  bride: {
    label: "BRIDE — tên khách vui",
    source: { variant: "BRIDE", portraits: "PRESENT", photoStory: "PRESENT", loveStoryPhoto: "PRESENT" },
    guest: FIXTURE_GUESTS.PLAYFUL,
  },
  "long-guest": { label: "Tên khách dài", source: { variant: "COMMON" }, guest: FIXTURE_GUESTS.LONG },
  "cover-unavailable": {
    label: "Ảnh bìa không khả dụng",
    source: { variant: "GROOM" },
    unavailableMediaIds: [FIXTURE_MEDIA_IDS.COVER],
  },
  "gallery-unavailable": {
    label: "Một ảnh album không khả dụng",
    source: { variant: "BRIDE" },
    unavailableMediaIds: [FIXTURE_MEDIA_IDS.GALLERY_2],
  },
  "qr-unavailable": {
    label: "QR nhà trai không khả dụng",
    source: { variant: "COMMON" },
    unavailableMediaIds: [FIXTURE_MEDIA_IDS.QR_GROOM],
  },
  "portrait-unavailable": {
    label: "Ảnh chân dung chú rể không khả dụng",
    source: { variant: "COMMON", portraits: "PRESENT" },
    unavailableMediaIds: [FIXTURE_MEDIA_IDS.PORTRAIT_GROOM],
  },
  "gallery-many": {
    label: "Album 25 ảnh",
    source: { variant: "COMMON", galleryCount: 25 },
  },
  "lunar-null": { label: "Không có ngày âm lịch", source: { variant: "BRIDE", ceremonyLunar: "ABSENT" } },
  "sections-minimal": {
    label: "Tắt mọi mục tuỳ chọn",
    source: { variant: "COMMON", sectionSettings: ALL_SECTIONS_OFF },
  },
  "music-resolved": {
    label: "Nhạc nền khả dụng (âm thử)",
    source: { variant: "GROOM" },
    resolveAudio: true,
  },
  // SD-V2-01 local visual QA: the album grid full at ten photographs, and a
  // resolved tone so the music-on-open tap can be checked in a browser.
  "se-duyen-v2": {
    label: "Se Duyên v2 — album 10 ảnh + nhạc",
    source: {
      variant: "COMMON",
      portraits: "PRESENT",
      loveStoryPhoto: "PRESENT",
      photoStory: "PRESENT",
      galleryCount: 5,
    },
    guest: FIXTURE_GUESTS.NORMAL,
    resolveAudio: true,
    overrideSource: toSeDuyenV2Source,
  },
} as const satisfies Record<string, HarnessScenarioDefinition>);

export type HarnessScenarioId = keyof typeof HARNESS_SCENARIOS;

export const HARNESS_SCENARIO_IDS = Object.freeze(Object.keys(HARNESS_SCENARIOS) as HarnessScenarioId[]);

export const DEFAULT_HARNESS_SCENARIO_ID: HarnessScenarioId = "common-full";

export function isHarnessScenarioId(value: string): value is HarnessScenarioId {
  return hasOwn(HARNESS_SCENARIOS, value);
}

/** Exactly the serializable data the harness client wrapper receives (P23). */
export interface HarnessRenderData {
  readonly rendererKey: string;
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
}

export async function buildHarnessRenderData(id: HarnessScenarioId): Promise<HarnessRenderData> {
  const scenario: HarnessScenarioDefinition = HARNESS_SCENARIOS[id];
  const base = buildRendererFixtureSourceInput(scenario.source);
  const source = scenario.overrideSource === undefined ? base : scenario.overrideSource(base);
  const fixture = await runRendererFixturePipeline(source, {
    resolver: createHarnessMediaResolver(scenario.unavailableMediaIds, {
      resolveAudio: scenario.resolveAudio === true,
    }),
    ...(scenario.guest === undefined ? {} : { guest: { displayName: scenario.guest.displayName } }),
  });
  return {
    rendererKey: fixture.selection.rendererKey,
    viewModel: fixture.viewModel,
    sections: fixture.selection.effectiveSections,
  };
}
