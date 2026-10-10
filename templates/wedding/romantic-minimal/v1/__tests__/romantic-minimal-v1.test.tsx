import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InvitationVariant } from "../../../../../lib/domain";
import { deriveCeremonyMonthGridV1 } from "../../../../../lib/invitation-rendering/ceremony-month-grid";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { InvitationRendererCapabilitiesV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { RendererEffectiveSections } from "../../../../../lib/invitation-rendering/renderer-selection";
import type { RsvpCapabilityV1 } from "../../../../../lib/invitation-rendering/rsvp-capability";
import type { BuildSnapshotPayloadInput, SnapshotMediaSource } from "../../../../../lib/invitation-rendering/snapshot-payload-types";
import { buildTemplateMediaSource } from "../../../../../lib/server/invitation-snapshot/build-template-media-source";
import type { TemplateMediaSlotItem } from "../../../../../lib/server/template-media/template-media-slot-types";
import { createFixtureMediaResolver, fixtureMediaUrl } from "../../../../core/fixtures/fixture-media-resolver";
import { runRendererFixturePipeline, type RendererFixture } from "../../../../core/fixtures/renderer-fixture-pipeline";
import {
  FIXTURE_GUESTS,
  FIXTURE_PROJECT_ID,
  buildRendererFixtureSourceInput,
  type RendererFixtureSourceOptions,
} from "../../../../core/fixtures/renderer-fixture-sources";
import { ROMANTIC_MINIMAL_V1_EDITOR_MANIFEST } from "../../../../editor/wedding/romantic-minimal-v1";
import { ROMANTIC_MINIMAL_V1_MANIFEST } from "../manifest";

// next/font loaders only run under the Next compiler; `npm run build` proves the real configuration.
vi.mock("../fonts", () => ({ ROMANTIC_MINIMAL_V1_FONT_VARIABLES_CLASS_NAME: "rm-test-font-variables" }));

const { RomanticMinimalV1 } = await import("../romantic-minimal-v1");
const { ROMANTIC_MINIMAL_V1_COPY: COPY } = await import("../copy");
const { ceremonyCountdownParts } = await import("../interactive/countdown");
const { OPENING_TIMING_MS, activateOpening, openingReducer } = await import("../interactive/opening-state");
const { stepViewer, viewerSequence } = await import("../interactive/album-viewer");
const { RM_REVEAL_TARGETS } = await import("../interactive/section-reveal");
const { sundayFirstCalendarCells } = await import("../sections/calendar-cells");
const { resolvedOurLovePhotos } = await import("../sections/our-love");

/**
 * RM-02 — Romantic Minimal v1 production renderer (docs/DECISIONS.md
 * "RM-02"). Every ViewModel comes from the real pipeline: canonical fixture
 * records + slot rows → TE-04 `buildTemplateMediaSource` (validated against
 * the RM editor manifest) → Snapshot → media resolution → ViewModel → RF-04
 * selection. Slot data is never hand-built into a ViewModel.
 */

const RM_DIR = join(__dirname, "..");
const EMPTY: InvitationRendererCapabilitiesV1 = Object.freeze({});

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

const PHOTO = Object.freeze({
  P1: "00000000-0000-4000-8000-0000000005b1",
  P2: "00000000-0000-4000-8000-0000000005b2",
  P3: "00000000-0000-4000-8000-0000000005b3",
  P4: "00000000-0000-4000-8000-0000000005b4",
  P5: "00000000-0000-4000-8000-0000000005b5",
  P6: "00000000-0000-4000-8000-0000000005b6",
  P7: "00000000-0000-4000-8000-0000000005b7",
});

type SlotKey = "saveTheDatePhoto" | "justMarriedPhoto" | "ourLovePhotos" | "gallery" | "thankYouPhoto";
type SlotAssignments = Partial<Record<SlotKey, readonly string[]>>;

const FULL_SLOTS: SlotAssignments = Object.freeze({
  saveTheDatePhoto: [PHOTO.P1],
  justMarriedPhoto: [PHOTO.P2],
  ourLovePhotos: [PHOTO.P3, PHOTO.P4, PHOTO.P5],
  gallery: [PHOTO.P6, PHOTO.P1, PHOTO.P7],
  thankYouPhoto: [PHOTO.P7],
});

function slotRows(assignments: SlotAssignments): TemplateMediaSlotItem[] {
  return Object.entries(assignments).flatMap(([slotKey, ids]) =>
    (ids ?? []).map((projectMediaId, position) => ({ slotKey, position, projectMediaId })),
  );
}

interface RmOptions extends RendererFixtureSourceOptions {
  guest?: { displayName: string };
  unavailableMediaIds?: readonly string[];
  slots?: SlotAssignments;
  loveStory?: string | null;
}

function rmSource(options: RendererFixtureSourceOptions, slots: SlotAssignments, loveStory: string | null | undefined): BuildSnapshotPayloadInput {
  const input = buildRendererFixtureSourceInput(options);
  const { design, compatibility } = ROMANTIC_MINIMAL_V1_MANIFEST;
  const photos: SnapshotMediaSource[] = Object.values(PHOTO).map((id, index) => ({
    id,
    projectId: FIXTURE_PROJECT_ID,
    mediaType: "PHOTO",
    sortOrder: index,
  }));
  const media = [...input.media, ...photos];
  return {
    ...input,
    ...(loveStory === undefined
      ? {}
      : { weddingDetails: { ...(input.weddingDetails as NonNullable<BuildSnapshotPayloadInput["weddingDetails"]>), loveStory } }),
    media,
    design: {
      ...input.design,
      paletteKey: design.palettes[0] as string,
      fontPresetKey: design.fontPresets[0] as string,
      effectPresetKey: design.effectPresets[0] as string,
    },
    templateVersion: { ...input.templateVersion, rendererKey: compatibility.rendererKey },
    templateMedia: buildTemplateMediaSource(ROMANTIC_MINIMAL_V1_EDITOR_MANIFEST, slotRows(slots), media),
  };
}

async function rmFixture(options: RmOptions): Promise<RendererFixture> {
  const { guest, unavailableMediaIds, slots, loveStory, ...sourceOptions } = options;
  return runRendererFixturePipeline(rmSource(sourceOptions, slots ?? FULL_SLOTS, loveStory), {
    resolver: createFixtureMediaResolver(unavailableMediaIds === undefined ? {} : { unavailableMediaIds }),
    ...(guest === undefined ? {} : { guest }),
  });
}

function render(viewModel: InvitationViewModel, sections: RendererEffectiveSections, capabilities = EMPTY): string {
  return renderToStaticMarkup(<RomanticMinimalV1 viewModel={viewModel} sections={sections} capabilities={capabilities} />);
}

async function renderRm(options: RmOptions, capabilities = EMPTY): Promise<{ html: string; fixture: RendererFixture }> {
  const fixture = await rmFixture(options);
  return { html: render(fixture.viewModel, fixture.selection.effectiveSections, capabilities), fixture };
}

const PHOTO_IDS: readonly string[] = Object.values(PHOTO);

/** Template-slot PHOTO ids of every rendered fixture `<img src>`, in document order (QR media excluded). */
function imageIds(html: string): string[] {
  const prefix = fixtureMediaUrl("");
  return [...html.matchAll(/<img [^>]*src="([^"]+)"/g)]
    .map((match) => match[1] as string)
    .filter((url) => url.startsWith(prefix))
    .map((url) => decodeURIComponent(url.slice(prefix.length)))
    .filter((id) => PHOTO_IDS.includes(id));
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

describe("RM-02 selection and variants", () => {
  it("selects the exact RM renderer key for every variant", async () => {
    for (const variant of ["COMMON", "GROOM", "BRIDE"] as const) {
      const fixture = await rmFixture({ variant });
      expect(fixture.selection.rendererKey).toBe("wedding.romantic-minimal.v1");
      expect(fixture.viewModel.media.templateSlots).toBeDefined();
    }
  });

  it.each<[InvitationVariant, string, string, string, number]>([
    ["COMMON", "Nguyễn Minh Khôi", "Trần Ngọc Hân", "Lễ Thành Hôn", 2],
    ["GROOM", "Nguyễn Minh Khôi", "Trần Ngọc Hân", "Lễ Thành Hôn", 1],
    ["BRIDE", "Trần Ngọc Hân", "Nguyễn Minh Khôi", "Lễ Vu Quy", 1],
  ])("%s: resolver order, rite wording, family priority and operational sides", async (variant, primary, secondary, rite, cards) => {
    const { html } = await renderRm({ variant });
    const text = textOf(html);
    expect(html).toContain(`data-variant="${variant}"`);
    expect(text.indexOf(primary)).toBeLessThan(text.indexOf(secondary));
    expect(text).toContain(rite);
    // COMMON legitimately names both rites (one reception subtitle per side); GROOM/BRIDE never the other one.
    if (variant !== "COMMON") expect(text).not.toContain(rite === "Lễ Vu Quy" ? "Lễ Thành Hôn" : "Lễ Vu Quy");
    const firstFamily = variant === "BRIDE" ? "BRIDE" : "GROOM";
    expect(html.indexOf(`data-side="${firstFamily}"`)).toBeLessThan(html.indexOf(`data-side="${firstFamily === "GROOM" ? "BRIDE" : "GROOM"}"`));
    expect([...html.matchAll(/<li class="[^"]*receptionSide[^"]*" data-side="(GROOM|BRIDE)"/g)].length).toBe(cards);
  });

  it("COMMON reception shows GROOM then BRIDE with their fixed rite subtitles", async () => {
    const { html } = await renderRm({ variant: "COMMON" });
    const text = textOf(html);
    expect(text.indexOf(COPY.reception.titleBySide.GROOM)).toBeLessThan(text.indexOf(COPY.reception.titleBySide.BRIDE));
  });
});

describe("RM-02 the five media slots", () => {
  it("full slots: each image in its position, in slot order, never from another slot", async () => {
    const { html } = await renderRm({ variant: "COMMON" });
    expect(imageIds(html)).toStrictEqual([PHOTO.P1, PHOTO.P2, PHOTO.P3, PHOTO.P4, PHOTO.P5, PHOTO.P6, PHOTO.P1, PHOTO.P7, PHOTO.P7]);
    expect(html).toContain('data-photo="present"');
    expect(html).toContain('data-count="3"');
    expect(html).toContain(COPY.justMarried.serif);
  });

  it("empty slots: envelope/date/names stay, Just Married hidden, Our Love text only, plain Thank You band, no album", async () => {
    const { html } = await renderRm({ variant: "GROOM", slots: {} });
    expect(imageIds(html)).toStrictEqual([]);
    expect(count(html, 'data-photo="absent"')).toBe(2);
    expect(html).toContain("envelope-back.webp");
    expect(html).toContain('id="rm-std-names"');
    expect(html).not.toContain(COPY.justMarried.serif);
    expect(html).toContain(COPY.ourLove.heading);
    expect(html).not.toContain("ourLovePhotos");
    expect(html).not.toContain("thankYouScrim");
    expect(html).toContain(COPY.thankYou.heading);
    expect(html).not.toContain(COPY.album.heading);
  });

  it("Our Love with 1–2 photos renders only those, in order, never filled from the gallery", async () => {
    const { html } = await renderRm({ variant: "COMMON", slots: { ...FULL_SLOTS, ourLovePhotos: [PHOTO.P4, PHOTO.P3] } });
    expect(html).toContain('data-count="2"');
    const ids = imageIds(html);
    expect(ids.slice(2, 4)).toStrictEqual([PHOTO.P4, PHOTO.P3]);
    expect(ids.filter((id) => id === PHOTO.P6)).toHaveLength(1);
  });

  it("UNAVAILABLE single slots behave as absent; an UNAVAILABLE gallery item keeps its neutral tile in place", async () => {
    const { html } = await renderRm({ variant: "COMMON", unavailableMediaIds: [PHOTO.P2, PHOTO.P7] });
    expect(html).not.toContain(COPY.justMarried.serif);
    expect(html).toContain('data-photo="absent"');
    expect([...html.matchAll(/data-status="(RESOLVED|UNAVAILABLE)"/g)].map((match) => match[1])).toStrictEqual([
      "RESOLVED",
      "RESOLVED",
      "UNAVAILABLE",
    ]);
  });

  it("an empty Love Story hides the whole Our Love section, photos included", async () => {
    const { html } = await renderRm({ variant: "COMMON", loveStory: null });
    expect(html).not.toContain(COPY.ourLove.heading);
    expect(imageIds(html)).not.toContain(PHOTO.P3);
  });
});

describe("RM-02 content and capabilities", () => {
  it("guest line: verbatim personalized display name, else the fixed Quý Khách", async () => {
    const personalized = await renderRm({ variant: "COMMON", guest: FIXTURE_GUESTS.PLAYFUL });
    expect(personalized.html).toContain(`data-guest="personalized">${FIXTURE_GUESTS.PLAYFUL.displayName}<`);
    const plain = await renderRm({ variant: "GROOM" });
    expect(plain.html).toContain(`data-guest="default">${COPY.invite.defaultGuest}<`);
  });

  it("long Vietnamese guest names render verbatim", async () => {
    const { html } = await renderRm({ variant: "COMMON", guest: FIXTURE_GUESTS.LONG });
    expect(html).toContain(FIXTURE_GUESTS.LONG.displayName);
  });

  it("RSVP, music and countdown exist only with their capabilities; the RSVP name always starts empty", async () => {
    const without = await renderRm({ variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL });
    expect(without.html).not.toContain("rm-rsvp-heading");
    expect(without.html).not.toContain(COPY.music.toggle);
    expect(without.html).not.toContain("data-countdown");

    const rsvp: RsvpCapabilityV1 = { submit: vi.fn() };
    const withRsvp = await renderRm(
      { variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL },
      { rsvp, clock: { nowEpochMs: Date.parse("2026-10-01T00:00:00Z") } },
    );
    expect(withRsvp.html).toContain("rm-rsvp-heading");
    expect(withRsvp.html).toMatch(/id="rm-rsvp-guest-name"[^>]*value=""/);
    for (const label of Object.values(COPY.rsvp.attendanceLabels)) expect(withRsvp.html).toContain(label);
    expect(withRsvp.html).toContain('data-countdown="upcoming"');
    expect(rsvp.submit).not.toHaveBeenCalled();
  });

  it("countdown parts are two-digit padded and disappear once the ceremony has passed", async () => {
    const { viewModel } = await rmFixture({ variant: "COMMON" });
    const start = Date.parse(viewModel.ceremony.startsAt);
    const parts = ceremonyCountdownParts(viewModel.ceremony, { nowEpochMs: start - (2 * 86_400 + 3 * 3_600 + 4 * 60 + 5) * 1000 });
    expect(parts?.map((part) => part.value)).toStrictEqual(["02", "03", "04", "05"]);
    expect(ceremonyCountdownParts(viewModel.ceremony, { nowEpochMs: start })).toBeNull();
  });

  it("calendar: Sunday-first Task 029 layout from the shared month grid, one heart on the ceremony day", async () => {
    const { html, fixture } = await renderRm({ variant: "COMMON" });
    const grid = deriveCeremonyMonthGridV1(fixture.viewModel);
    const cells = sundayFirstCalendarCells(grid);
    const days = cells.filter((cell) => cell.kind === "day");
    expect(days.map((cell) => cell.day)).toStrictEqual(Array.from({ length: days.length }, (_, index) => index + 1));
    // 1 October 2026 is a Thursday: four leading blanks (CN T2 T3 T4).
    expect(grid.month).toBe(10);
    expect(cells.slice(0, 5).map((cell) => cell.kind)).toStrictEqual(["blank", "blank", "blank", "blank", "day"]);
    expect(count(html, 'data-ceremony-day="true"')).toBe(1);
    expect(html).toContain(`${COPY.calendar.weddingDay} 18`);
  });

  it("gift panels per operational side, no QR placeholder, copy only with the clipboard capability", async () => {
    const common = await renderRm({ variant: "COMMON" });
    expect(count(common.html, "rm-gift-panel-")).toBeGreaterThanOrEqual(2);
    expect(common.html).not.toContain(COPY.gift.copy);
    const bride = await renderRm({ variant: "BRIDE" }, { clipboard: { copyText: vi.fn() } });
    expect(bride.html).toContain('id="rm-gift-panel-BRIDE"');
    expect(bride.html).not.toContain('id="rm-gift-panel-GROOM"');
    expect(bride.html).toContain(COPY.gift.copy);
  });
});

describe("RM-02 interaction models", () => {
  it("opening: explicit tap only, onOpen at most once, final DONE", () => {
    expect(openingReducer("CLOSED", "FINISHED")).toBe("CLOSED");
    expect(openingReducer("CLOSED", "OPEN")).toBe("OPENING");
    expect(openingReducer("OPENING", "FINISHED")).toBe("DONE");
    expect(openingReducer("DONE", "OPEN")).toBe("DONE");
    const onOpen = vi.fn();
    const dispatch = vi.fn();
    activateOpening("CLOSED", onOpen, dispatch);
    activateOpening("OPENING", onOpen, dispatch);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(OPENING_TIMING_MS.coverTotal).toBe(1050);
  });

  it("album viewer sequence skips UNAVAILABLE items and wraps both ways", async () => {
    const { viewModel } = await rmFixture({ variant: "COMMON", unavailableMediaIds: [PHOTO.P1] });
    const sequence = viewerSequence(viewModel.media.templateSlots?.gallery ?? []);
    expect(sequence.map((photo) => photo.index)).toStrictEqual([0, 2]);
    expect(stepViewer(0, -1, 2)).toBe(1);
    expect(stepViewer(1, 1, 2)).toBe(0);
  });

  it("Our Love keeps original slot positions when an item is UNAVAILABLE", async () => {
    const { viewModel } = await rmFixture({ variant: "COMMON", unavailableMediaIds: [PHOTO.P4] });
    expect(resolvedOurLovePhotos(viewModel.media.templateSlots?.ourLovePhotos ?? []).map((photo) => photo.position)).toStrictEqual([1, 3]);
  });

  it("every reveal target class exists in the CSS module", () => {
    const css = readFileSync(join(RM_DIR, "romantic-minimal-v1.module.css"), "utf8");
    for (const target of RM_REVEAL_TARGETS) {
      // Under vitest CSS modules resolve to `_<class>_<hash>`; recover the source class name.
      const name = target.selector.replace(/^\._?/, "").replace(/_[0-9a-f]+$/, "");
      expect(css, name).toMatch(new RegExp(`\\.${name}[\\s,{:.\\[]`));
    }
  });
});

describe("RM-02 boundaries", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sources(path);
      return [path];
    });
  }

  it("no prototype path, demo media, framer-motion, next/image, Supabase or other template is referenced", () => {
    for (const file of sources(RM_DIR).filter((path) => /\.(tsx?|css)$/.test(path))) {
      const code = readFileSync(file, "utf8");
      for (const pattern of [/prototypes/, /\/demo\//, /framer-motion/, /next\/image/, /supabase/i, /elegant-editorial|vietnamese-heritage/, /process\.env/]) {
        expect(pattern.test(code), `${file}: ${String(pattern)}`).toBe(false);
      }
    }
  });

  it("decor is referenced only from sections/decor.tsx, by exact paths into the immutable v1 directory, all present on disk", () => {
    const decorDir = join(RM_DIR, "..", "..", "..", "..", "public", "renderers", "wedding", "romantic-minimal", "v1");
    const onDisk = readdirSync(decorDir).sort();
    expect(onDisk).toStrictEqual([
      "architecture-sketch.svg",
      "divider.webp",
      "envelope-back.webp",
      "envelope-pocket.webp",
      "envelope-seal.webp",
      "floral-bottom-right.webp",
      "floral-top-left.webp",
      "heart-burst.webp",
      "paper-blush.webp",
    ]);
    const decor = readFileSync(join(RM_DIR, "sections", "decor.tsx"), "utf8");
    const referenced = [...decor.matchAll(/\/renderers\/wedding\/romantic-minimal\/v1\/([\w-]+\.(?:webp|svg))/g)].map((match) => match[1]);
    expect([...new Set(referenced)].sort()).toStrictEqual(onDisk);
    for (const file of sources(RM_DIR).filter((path) => !path.endsWith("decor.tsx") && /\.(tsx?|css)$/.test(path))) {
      expect(/\/renderers\//.test(readFileSync(file, "utf8")), file).toBe(false);
    }
  });

  it("every animation is neutralised under prefers-reduced-motion", () => {
    const css = readFileSync(join(RM_DIR, "romantic-minimal-v1.module.css"), "utf8");
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    for (const looping of ["musicIcon", "calendarHeartShape", "coverCard", "coverBurst", "coverSealImage"]) {
      expect(reduced).toContain(looping);
    }
    expect(css).not.toMatch(/@import|url\((?!["']?data:)/);
  });
});

describe("RM directions CTA (LAUNCH-P0-01)", () => {
  /** Every new-tab anchor's href, in document order. */
  const directionHrefs = (html: string) =>
    [...html.matchAll(/<a [^>]*href="([^"]+)" target="_blank" rel="noopener noreferrer"/g)].map((match) => match[1]);

  it("COMMON links each ceremony card's own canonical mapUrl, safely in a new tab", async () => {
    expect(directionHrefs((await renderRm({ variant: "COMMON" })).html)).toStrictEqual([
      "https://maps.example.invalid/groom-home",
      "https://maps.example.invalid/bride-home",
    ]);
  });

  it("GROOM / BRIDE link only their own ceremony card's mapUrl", async () => {
    expect(directionHrefs((await renderRm({ variant: "GROOM" })).html)).toStrictEqual(["https://maps.example.invalid/groom-home"]);
    expect(directionHrefs((await renderRm({ variant: "BRIDE" })).html)).toStrictEqual(["https://maps.example.invalid/bride-home"]);
  });

  it("a null mapUrl renders no link and nothing is fabricated", async () => {
    const input = rmSource({ variant: "COMMON" }, FULL_SLOTS, undefined);
    input.events = input.events.map((event) => ({ ...event, mapUrl: null }));
    const fixture = await runRendererFixturePipeline(input, { resolver: createFixtureMediaResolver() });
    const html = render(fixture.viewModel, fixture.selection.effectiveSections);
    expect(directionHrefs(html)).toStrictEqual([]);
    expect(html).not.toMatch(/google\.[a-z.]+\/maps|maps\.google|maps\.app\.goo\.gl|maps\.apple|geo:/);
  });
});
