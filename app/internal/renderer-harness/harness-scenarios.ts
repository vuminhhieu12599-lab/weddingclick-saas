import type {
  GuestOverlay,
  InvitationViewModel,
  MediaResolution,
  MediaResolver,
} from "../../../lib/invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../../lib/invitation-rendering/renderer-selection";
import type { SnapshotDesignSettingValue } from "../../../lib/invitation-rendering/snapshot-payload-types";
import { runRendererFixturePipeline } from "../../../templates/core/fixtures/renderer-fixture-pipeline";
import {
  FIXTURE_GUESTS,
  FIXTURE_MEDIA_DIMENSIONS,
  FIXTURE_MEDIA_IDS,
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

/** Harness-owned fictional fixture images (never under `public/renderers/**`). */
export const HARNESS_MEDIA_BASE_PATH = "/internal/renderer-harness/";

const HARNESS_MEDIA_FILES: Readonly<Record<string, string>> = Object.freeze({
  [FIXTURE_MEDIA_IDS.COVER]: "cover.svg",
  [FIXTURE_MEDIA_IDS.GALLERY_1]: "gallery-1.svg",
  [FIXTURE_MEDIA_IDS.GALLERY_2]: "gallery-2.svg",
  [FIXTURE_MEDIA_IDS.GALLERY_3]: "gallery-3.svg",
  [FIXTURE_MEDIA_IDS.QR_GROOM]: "qr-groom.svg",
  [FIXTURE_MEDIA_IDS.QR_BRIDE]: "qr-bride.svg",
});

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * Deterministic harness `MediaResolver` over the RF-03 contract. Fixture
 * images resolve to local harness paths; ids listed as unavailable, and the
 * fixture audio (RF-06C owns harness audio), resolve `UNAVAILABLE`. An id
 * outside the fixture set is a fixture bug and throws.
 */
export function createHarnessMediaResolver(unavailableMediaIds: readonly string[] = []): MediaResolver {
  const unavailable = new Set<string>([...unavailableMediaIds, FIXTURE_MEDIA_IDS.AUDIO]);
  return Object.freeze({
    async resolveMedia(mediaId: string): Promise<MediaResolution> {
      if (unavailable.has(mediaId)) {
        return { status: "UNAVAILABLE", mediaId };
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

interface HarnessScenarioDefinition {
  readonly label: string;
  readonly source: RendererFixtureSourceOptions;
  readonly guest?: GuestOverlay;
  readonly unavailableMediaIds?: readonly string[];
}

const ALL_SECTIONS_OFF: Record<string, SnapshotDesignSettingValue> = Object.freeze({
  invitationMessage: false,
  loveStory: false,
  gallery: false,
  music: false,
  gift: false,
});

export const HARNESS_SCENARIOS = Object.freeze({
  "common-full": { label: "COMMON — đầy đủ, khách mời", source: { variant: "COMMON" }, guest: FIXTURE_GUESTS.NORMAL },
  groom: { label: "GROOM — không cá nhân hoá", source: { variant: "GROOM" } },
  bride: { label: "BRIDE — tên khách vui", source: { variant: "BRIDE" }, guest: FIXTURE_GUESTS.PLAYFUL },
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
  "lunar-null": { label: "Không có ngày âm lịch", source: { variant: "BRIDE", ceremonyLunar: "ABSENT" } },
  "sections-minimal": {
    label: "Tắt mọi mục tuỳ chọn",
    source: { variant: "COMMON", sectionSettings: ALL_SECTIONS_OFF },
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
  const fixture = await runRendererFixturePipeline(buildRendererFixtureSourceInput(scenario.source), {
    resolver: createHarnessMediaResolver(scenario.unavailableMediaIds),
    ...(scenario.guest === undefined ? {} : { guest: { displayName: scenario.guest.displayName } }),
  });
  return {
    rendererKey: fixture.selection.rendererKey,
    viewModel: fixture.viewModel,
    sections: fixture.selection.effectiveSections,
  };
}
