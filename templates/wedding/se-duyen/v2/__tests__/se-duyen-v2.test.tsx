import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { startMusicOnOpen } from "../../../../../lib/invitation-rendering/music-control-model";
import type {
  InvitationRendererCapabilitiesV1,
  MusicCapabilityV1,
} from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { RendererEffectiveSections } from "../../../../../lib/invitation-rendering/renderer-selection";
import type { BuildSnapshotPayloadInput, SnapshotMediaSource } from "../../../../../lib/invitation-rendering/snapshot-payload-types";
import { buildTemplateMediaSource } from "../../../../../lib/server/invitation-snapshot/build-template-media-source";
import type { TemplateMediaSlotItem } from "../../../../../lib/server/template-media/template-media-slot-types";
import { createFixtureMediaResolver } from "../../../../core/fixtures/fixture-media-resolver";
import { runRendererFixturePipeline, type RendererFixture } from "../../../../core/fixtures/renderer-fixture-pipeline";
import {
  FIXTURE_PROJECT_ID,
  buildRendererFixtureSourceInput,
  type RendererFixtureSourceOptions,
} from "../../../../core/fixtures/renderer-fixture-sources";
import {
  createProductionCompatibilityRegistry,
  type ProductionCompatibilityRegistryV1,
} from "../../../../core/production-renderer-manifests";
import { SE_DUYEN_V2_EDITOR_MANIFEST } from "../../../../editor/wedding/se-duyen-v2";
import { SE_DUYEN_V2_MANIFEST } from "../manifest";

// next/font loaders only run under the Next compiler; `npm run build` proves the real configuration.
vi.mock("../fonts", () => ({ SE_DUYEN_V2_FONT_VARIABLES_CLASS_NAME: "sd2-test-font-variables" }));

const { SeDuyenV2 } = await import("../se-duyen-v2");
const { albumPhotos, stepAlbum, SE_DUYEN_V2_ALBUM_LIMIT } = await import("../sections/gallery-frames");
const { albumAlt } = await import("../interactive/gallery-viewer");
const { musicFailureVisible } = await import("../interactive/music-control");

/**
 * SD-V2-01 / SD-V2-02 — the two Product-Owner-rejected compositions that
 * Se Duyên v2 exists to correct, and nothing else: v1 is frozen and its own
 * 1748-line suite still covers the direction. Every ViewModel here comes
 * from the real pipeline (canonical fixture records → Snapshot → media
 * resolution → ViewModel → RF-04 selection), so a manifest that could not
 * be registered in production cannot pass these tests either.
 *
 * WHAT IS NOT EXERCISED HERE. The repository has no DOM test environment
 * (no jsdom, no testing-library) and adding one is out of scope, so no test
 * below clicks the wedding box. The gesture requirement is pinned the way
 * this codebase pins island behaviour: the pure model is unit-tested, the
 * server markup is asserted, and the one thing only the source can prove —
 * that `play()` is requested inside the tap and never from a timer — is
 * asserted against the source itself. The browser behaviour is in the
 * task's manual steps.
 */

const EMPTY: InvitationRendererCapabilitiesV1 = Object.freeze({});
const SRC = join(__dirname, "..");

function source(relative: string): string {
  return readFileSync(join(SRC, relative), "utf8");
}

/** Comment-free source: a rule must hold in the code, not in prose about it. */
function code(relative: string): string {
  return source(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Fixture PHOTO ids; all distinct, so a repeat or a reorder is visible. */
const PHOTO = Object.freeze({
  OPENING: "00000000-0000-4000-8000-0000000008d1",
  LEAD: "00000000-0000-4000-8000-0000000008d2",
  ASIDE: "00000000-0000-4000-8000-0000000008d3",
  CLOSING: "00000000-0000-4000-8000-0000000008d4",
});

/** Eleven gallery photographs: ten the album draws, and one it must not. */
const GALLERY_IDS = Array.from(
  { length: 11 },
  (_, index) => `00000000-0000-4000-8000-00000000090${index.toString(16)}`,
);

type SlotKey = "openingPhoto" | "portraitLead" | "portraitAside" | "closingPhoto" | "gallery";
type SlotAssignments = Partial<Record<SlotKey, readonly string[]>>;

function slotRows(assignments: SlotAssignments): TemplateMediaSlotItem[] {
  return Object.entries(assignments).flatMap(([slotKey, ids]) =>
    (ids ?? []).map((projectMediaId, position) => ({ slotKey, position, projectMediaId })),
  );
}

const SD2_REGISTRY: ProductionCompatibilityRegistryV1 = createProductionCompatibilityRegistry([SE_DUYEN_V2_MANIFEST]);

interface Sd2Options extends Partial<RendererFixtureSourceOptions> {
  slots?: SlotAssignments;
  unavailableMediaIds?: readonly string[];
}

function sd2Source(options: RendererFixtureSourceOptions, slots: SlotAssignments): BuildSnapshotPayloadInput {
  const input = buildRendererFixtureSourceInput(options);
  const { design, compatibility } = SE_DUYEN_V2_MANIFEST;
  const photos: SnapshotMediaSource[] = [...Object.values(PHOTO), ...GALLERY_IDS].map((id, index) => ({
    id,
    projectId: FIXTURE_PROJECT_ID,
    mediaType: "PHOTO",
    sortOrder: index,
  }));
  const media = [...input.media, ...photos];
  return {
    ...input,
    media,
    design: {
      ...input.design,
      paletteKey: design.palettes[0] as string,
      fontPresetKey: design.fontPresets[0] as string,
      effectPresetKey: design.effectPresets[0] as string,
    },
    templateVersion: { ...input.templateVersion, rendererKey: compatibility.rendererKey },
    // The real TE-04 builder, validated against Se Duyên v2's own editor manifest.
    templateMedia: buildTemplateMediaSource(SE_DUYEN_V2_EDITOR_MANIFEST, slotRows(slots), media),
  };
}

async function sd2Fixture(options: Sd2Options): Promise<RendererFixture> {
  const { slots, unavailableMediaIds, ...rest } = options;
  const sourceOptions = { variant: "COMMON" as const, ...rest };
  return runRendererFixturePipeline(sd2Source(sourceOptions, slots ?? { gallery: GALLERY_IDS.slice(0, 4) }), {
    resolver: createFixtureMediaResolver(unavailableMediaIds === undefined ? {} : { unavailableMediaIds }),
    registry: SD2_REGISTRY,
  });
}

function render(
  viewModel: InvitationViewModel,
  sections: RendererEffectiveSections,
  capabilities: InvitationRendererCapabilitiesV1 = EMPTY,
): string {
  return renderToStaticMarkup(<SeDuyenV2 viewModel={viewModel} sections={sections} capabilities={capabilities} />);
}

async function renderSd2(options: Sd2Options, capabilities?: InvitationRendererCapabilitiesV1): Promise<string> {
  const fixture = await sd2Fixture(options);
  return render(fixture.viewModel, fixture.selection.effectiveSections, capabilities);
}

/** A music capability with a chosen status; the commands only record calls. */
function stubMusic(status: MusicCapabilityV1["status"]): MusicCapabilityV1 & { calls: string[] } {
  const calls: string[] = [];
  return {
    status,
    calls,
    play: async () => {
      calls.push("play");
    },
    pause: async () => {
      calls.push("pause");
    },
  };
}

// ---------------------------------------------------------------------------
// A. Music starts with the invitation (SD-V2-01)
// ---------------------------------------------------------------------------

describe("SD-V2-01 music starts from the opening gesture", () => {
  it("the root hands the opening a start hook built from the shared model, only when music exists", () => {
    const root = code("se-duyen-v2.tsx");
    // One hook, from the shared RF-06C model — never a second controller.
    expect(root).toContain("onOpening={music === undefined ? undefined : startMusicOnOpen(music)}");
    expect(root).toContain('import { startMusicOnOpen } from "../../../../lib/invitation-rendering/music-control-model"');
    // The disc is the opening's floating control, not an interior child.
    expect(root).toContain("floatingControl={music === undefined ? undefined : <MusicControl music={music} />}");
    // `sections.music` plus capability presence stays the only gate.
    expect(root).toContain("const music = sections.music ? capabilities.music : undefined;");
  });

  it("the opening runs the hook synchronously inside the tap, before the phase changes", () => {
    const opening = code("interactive/opening-stage.tsx");
    const handler = /onClick=\{\(\) => \{([\s\S]*?)\}\}/.exec(opening)?.[1] ?? "";
    expect(handler).not.toBe("");
    // Order matters: the duplicate guard, then the hook, then the phase.
    expect(handler.indexOf("activated.current = true")).toBeLessThan(handler.indexOf("onOpening?.()"));
    expect(handler.indexOf("onOpening?.()")).toBeLessThan(handler.indexOf('dispatch("OPEN")'));
    // Nothing is awaited in the handler: an await would end the gesture.
    expect(handler).not.toMatch(/\bawait\b|\.then\(/);
  });

  it("no timer, frame or delayed call may carry the playback request anywhere in v2", () => {
    // The Product Owner's own constraint: a delayed `play()` loses the user
    // gesture and is refused as autoplay. The ~0.5s smoothing is CSS only.
    for (const file of ["se-duyen-v2.tsx", "interactive/opening-stage.tsx", "interactive/music-control.tsx"]) {
      expect(code(file), file).not.toMatch(/setTimeout|setInterval|requestAnimationFrame|queueMicrotask/);
    }
  });

  it("the shared start hook requests playback once, and never restarts a playing track", () => {
    const paused = stubMusic("PAUSED");
    startMusicOnOpen(paused)();
    expect(paused.calls).toStrictEqual(["play"]);

    const playing = stubMusic("PLAYING");
    startMusicOnOpen(playing)();
    expect(playing.calls).toStrictEqual([]);

    // An explicit retry after a refusal is the same one command.
    const blocked = stubMusic("BLOCKED");
    startMusicOnOpen(blocked)();
    expect(blocked.calls).toStrictEqual(["play"]);
  });

  it("holds no audio element and keeps status the only playback truth", () => {
    const music = code("interactive/music-control.tsx");
    expect(music).not.toMatch(/new Audio|<audio|\.volume|\.currentTime|fade/i);
    expect(music).toContain('const playing = music.status === "PLAYING";');
    // A refusal is reported and retryable, never shown as playing.
    expect(musicFailureVisible("BLOCKED", true, false)).toBe(true);
    expect(musicFailureVisible("ERROR", true, false)).toBe(true);
    expect(musicFailureVisible("PLAYING", true, true)).toBe(true);
    // Nothing is said before the guest has pressed anything.
    expect(musicFailureVisible("BLOCKED", false, false)).toBe(false);
  });
});

describe("SD-V2-01 the floating control", () => {
  it("is mounted outside both query containers, and only once the box has opened", () => {
    const opening = code("interactive/opening-stage.tsx");
    expect(opening).toContain('{phase === "hero" && floatingControl !== undefined ? (');
    expect(opening).toContain("<div className={styles.floatingControl}>{floatingControl}</div>");
    // It is a sibling of `.root` and `.interior`, never a child of either:
    // both are query containers, which would capture a fixed position.
    const interiorAt = opening.indexOf("className={styles.interior}");
    const floatAt = opening.indexOf("className={styles.floatingControl}");
    expect(interiorAt).toBeGreaterThan(-1);
    expect(floatAt).toBeGreaterThan(interiorAt);
    expect(opening.slice(interiorAt, floatAt)).toContain("</div>");
  });

  it("floats at the top right above the hero, and fades in without animating under reduced motion", () => {
    const css = source("se-duyen-v2.module.css");
    const block = /\.floatingControl \{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
    expect(block).toContain("position: fixed");
    expect(block).toContain("top: 14px");
    expect(block).toContain("right: 16px");
    // Above `.hero` (z-index 5) and `.interior` (6).
    expect(/z-index: 9/.test(block)).toBe(true);
    expect(block).toMatch(/animation: sdp-music-arrive/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.floatingControl \{\s*animation: none;/);
    // The disc itself no longer positions or reserves space.
    const button = /\.musicButton \{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
    expect(button).not.toContain("position: sticky");
    expect(button).toContain("margin: 0;");
  });

  it("renders no disc in the closed server markup, and none at all without music", async () => {
    const music = stubMusic("PAUSED");
    const withMusic = await renderSd2({}, { music });
    // Server markup is the closed box: the floating wrapper is not there yet.
    expect(withMusic).toContain('data-phase="closed"');
    expect(withMusic).not.toContain("data-music-status");
    expect(music.calls).toStrictEqual([]);

    // No capability at all: no disc, and nothing that could request playback.
    const withoutMusic = await renderSd2({});
    expect(withoutMusic).not.toContain("data-music-status");
  });
});

// ---------------------------------------------------------------------------
// B. The album is a responsive grid of every drawn photograph (SD-V2-02)
// ---------------------------------------------------------------------------

describe("SD-V2-02 album model", () => {
  const resolved = (url: string) => ({ status: "RESOLVED" as const, mediaId: url, url, width: 1200, height: 1600 });
  const unavailable = (mediaId: string) => ({ status: "UNAVAILABLE" as const, mediaId });

  it("draws every RESOLVED photograph in the customer's order, up to ten", () => {
    const eleven = GALLERY_IDS.map((id) => resolved(`https://cdn.test/${id}.webp`));
    const photos = albumPhotos(eleven);
    expect(SE_DUYEN_V2_ALBUM_LIMIT).toBe(10);
    expect(photos).toHaveLength(10);
    expect(photos.map((photo) => photo.position)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Customer order, and the eleventh is simply not drawn.
    expect(photos.map((photo) => photo.media.url)).toStrictEqual(eleven.slice(0, 10).map((item) => item.url));
    expect(new Set(photos.map((photo) => photo.media.url)).size).toBe(10);
  });

  it("skips an UNAVAILABLE photograph and closes the tiles up, never leaving a blank", () => {
    const photos = albumPhotos([
      resolved("https://cdn.test/a.webp"),
      unavailable("b"),
      resolved("https://cdn.test/c.webp"),
    ]);
    expect(photos.map((photo) => [photo.position, photo.media.url])).toStrictEqual([
      [1, "https://cdn.test/a.webp"],
      [2, "https://cdn.test/c.webp"],
    ]);
  });

  it("draws nothing for an empty or wholly unavailable slot", () => {
    expect(albumPhotos([])).toStrictEqual([]);
    expect(albumPhotos([unavailable("a"), unavailable("b")])).toStrictEqual([]);
  });

  it("the viewer steps over every drawn photograph and wraps both ways", () => {
    // Ten tiles means ten reachable photographs, not v1's four.
    expect(stepAlbum(9, 1, 10)).toBe(0);
    expect(stepAlbum(0, -1, 10)).toBe(9);
    expect(stepAlbum(3, 1, 10)).toBe(4);
    expect(albumAlt(7)).toContain("7");
  });
});

describe("SD-V2-02 album rendering", () => {
  it("renders one tile per assigned photograph — ten when ten are assigned", async () => {
    const html = await renderSd2({ slots: { gallery: GALLERY_IDS.slice(0, 10) } });
    const positions = [...html.matchAll(/data-position="(\d+)"/g)].map((match) => Number(match[1]));
    expect(positions).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Every tile is its own photograph: no repeat, no blank, no demo art.
    const images = [...html.matchAll(/--sdp-albumTile-image:url\(&quot;([^&]+)&quot;\)/g)].map((match) => match[1]);
    expect(images).toHaveLength(10);
    expect(new Set(images).size).toBe(10);
    // The viewer's accessible name counts all ten, so none is unreachable.
    expect(html).toContain("10");
  });

  it("drops the eleventh assigned photograph rather than overflowing the page", async () => {
    const html = await renderSd2({ slots: { gallery: GALLERY_IDS } });
    expect([...html.matchAll(/data-position="(\d+)"/g)]).toHaveLength(10);
  });

  it("renders only the resolvable photographs, with the tiles closed up", async () => {
    const html = await renderSd2({
      slots: { gallery: GALLERY_IDS.slice(0, 5) },
      unavailableMediaIds: [GALLERY_IDS[1] as string, GALLERY_IDS[3] as string],
    });
    const positions = [...html.matchAll(/data-position="(\d+)"/g)].map((match) => Number(match[1]));
    expect(positions).toStrictEqual([1, 2, 3]);
  });

  it("draws no album section when the slot has nothing resolvable", async () => {
    const html = await renderSd2({ slots: {} });
    expect(html).not.toContain("data-album-count");
    expect(html).not.toContain("sd-album-heading");
  });

  it("keeps none of v1's four hand-placed frames", () => {
    const css = source("se-duyen-v2.module.css").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const stem of ["albumLead", "albumPairTall", "albumPairSmall", "albumFoot", "albumPairSolo"]) {
      expect(css, stem).not.toContain(`.${stem}`);
    }
    expect(code("interactive/gallery-viewer.tsx")).not.toMatch(/albumLead|albumTall|albumSmall|albumFoot/);
  });

  it("is two columns on a phone and more only where there is room", () => {
    const css = source("se-duyen-v2.module.css");
    const grid = /\.albumGrid \{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
    expect(grid).toContain("grid-template-columns: repeat(2, 1fr)");
    expect(css).toMatch(/@container \(min-width: 460px\) \{\s*\.albumGrid \{\s*[\s\S]*?grid-template-columns: repeat\(3, 1fr\)/);
    expect(css).toMatch(/@container \(min-width: 760px\) \{\s*\.albumGrid \{\s*[\s\S]*?grid-template-columns: repeat\(4, 1fr\)/);
    // Square tiles, so no upload becomes a band.
    const tile = /\.albumTile \{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
    expect(tile).toContain("aspect-ratio: 1");
  });

  it("the interior reveal drives the grid's tiles, and every target is a real class", async () => {
    const { SD_REVEAL_TARGET_CLASSES, SD_REVEAL_TARGETS } = await import("../interactive/section-reveal");
    const css = source("se-duyen-v2.module.css");
    // A mistyped name resolves to itself and then matches nothing, so the
    // reveal would silently animate nothing (the v1 motion suite's rule).
    for (const name of SD_REVEAL_TARGET_CLASSES) {
      expect(css, name).toContain(`.${name}`);
    }
    expect(SD_REVEAL_TARGET_CLASSES).toContain("albumTile");
    for (const stem of ["albumLead", "albumPairTall", "albumPairSmall", "albumFoot"]) {
      expect(SD_REVEAL_TARGET_CLASSES, stem).not.toContain(stem);
    }
    // One selector covers every tile, however many the Project assigned.
    expect(SD_REVEAL_TARGETS.some((entry) => entry.variant === "photo")).toBe(true);
    // The grid rises square: a rotated tile would cross its neighbour.
    expect(css).toMatch(/\.interior \.albumTile \{\s*--sd-tilt: 0deg;/);
  });

  it("the tap-to-open viewer is unchanged: one native modal dialog, no second pattern", () => {
    const viewer = code("interactive/gallery-viewer.tsx");
    expect(viewer).toContain("dialog.showModal()");
    expect(viewer).toContain("aria-haspopup=\"dialog\"");
    expect(viewer.match(/<dialog/g)).toHaveLength(1);
    // Each tile is itself the control, as in v1.
    expect(viewer).toContain("onClick={(event) => openAt(at, event.currentTarget)}");
    expect(viewer).not.toMatch(/fetch\(|localStorage|sessionStorage|document\.|window\./);
  });
});

// ---------------------------------------------------------------------------
// C. v2 is v1 everywhere else
// ---------------------------------------------------------------------------

describe("SD-V2 scope", () => {
  it("is version 2 of the same catalog template, with v1's design subset exactly", async () => {
    const { SE_DUYEN_V1_MANIFEST } = await import("../../v1/manifest");
    expect(SE_DUYEN_V2_MANIFEST.identity).toStrictEqual({
      eventType: "WEDDING",
      templateCode: "se-duyen",
      versionNumber: 2,
      displayName: "Se Duyên",
    });
    expect(SE_DUYEN_V2_MANIFEST.compatibility.rendererKey).toBe("wedding.se-duyen.v2");
    // Presentation only: the design subset and the capabilities are v1's, so
    // a Project moved to v2 keeps its design assignment and its media.
    expect(SE_DUYEN_V2_MANIFEST.design).toStrictEqual(SE_DUYEN_V1_MANIFEST.design);
    expect(SE_DUYEN_V2_MANIFEST.compatibility.sectionCapabilities).toStrictEqual(
      SE_DUYEN_V1_MANIFEST.compatibility.sectionCapabilities,
    );
    expect(SE_DUYEN_V2_MANIFEST.compatibility.supportedVariants).toStrictEqual(["COMMON", "GROOM", "BRIDE"]);
  });

  it("declares the same editor slots as v1, so nothing is re-uploaded", async () => {
    const { SE_DUYEN_V1_EDITOR_MANIFEST } = await import("../../../../editor/wedding/se-duyen-v1");
    const strip = (manifest: typeof SE_DUYEN_V2_EDITOR_MANIFEST) =>
      manifest.mediaSlots.map((slot) => ({ ...slot, hint: "" }));

    expect(strip(SE_DUYEN_V2_EDITOR_MANIFEST)).toStrictEqual(strip(SE_DUYEN_V1_EDITOR_MANIFEST));
    expect(SE_DUYEN_V2_EDITOR_MANIFEST.rendererKey).toBe("wedding.se-duyen.v2");
    // Only the album hint changed, and it describes the grid.
    const gallery = SE_DUYEN_V2_EDITOR_MANIFEST.mediaSlots.find((slot) => slot.key === "gallery");
    expect(gallery?.hint).toContain("10");
    expect(gallery?.hint).not.toContain("bốn khung");
  });

  it("renders all three variants, with the resolver's own order and rite title", async () => {
    for (const variant of ["COMMON", "GROOM", "BRIDE"] as const) {
      const fixture = await sd2Fixture({ variant });
      const html = render(fixture.viewModel, fixture.selection.effectiveSections);
      expect(html, variant).toContain(`data-variant="${variant}"`);
      expect(html, variant).toContain('data-renderer="se-duyen-v2"');
      expect(html, variant).toContain(fixture.viewModel.people.primary.name);
      expect(html, variant).toContain(fixture.viewModel.ceremony.title);
    }
  });

  it("adds no decorative asset of its own: the stylesheet reads v1's immutable path", () => {
    const css = source("se-duyen-v2.module.css");
    const assets = [...css.matchAll(/\/renderers\/wedding\/se-duyen\/v(\d)\//g)].map((match) => match[1]);
    expect(assets.length).toBeGreaterThan(0);
    expect(new Set(assets)).toStrictEqual(new Set(["1"]));
  });
});
