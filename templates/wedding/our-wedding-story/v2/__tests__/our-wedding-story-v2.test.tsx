import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InvitationVariant } from "../../../../../lib/domain";
import { deriveCeremonyMonthGridV1 } from "../../../../../lib/invitation-rendering/ceremony-month-grid";
import type { InvitationViewModel, MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
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
import { OUR_WEDDING_STORY_V2_EDITOR_MANIFEST } from "../../../../editor/wedding/our-wedding-story-v2";
import { OUR_WEDDING_STORY_V2_MANIFEST } from "../manifest";

// next/font loaders only run under the Next compiler; `npm run build` proves the real configuration.
vi.mock("../fonts", () => ({ OUR_WEDDING_STORY_V2_FONT_VARIABLES_CLASS_NAME: "ows2-test-font-variables" }));

const { OurWeddingStoryV2 } = await import("../our-wedding-story-v2");
const { OUR_WEDDING_STORY_V2_COPY: COPY } = await import("../copy");
const { ceremonyCountdownParts } = await import("../interactive/countdown");
const { stepViewer, viewerSequence } = await import("../interactive/gallery-viewer");
const { musicFailureVisible } = await import("../interactive/music-control");
const { OWS_INITIAL_RSVP_DRAFT } = await import("../interactive/rsvp");
const { OWS_REVEAL_TARGETS } = await import("../interactive/section-reveal");
const { sundayFirstCalendarCells } = await import("../sections/calendar-cells");
const { coupleLayout, orderedCouplePeople } = await import("../sections/couple-people");
const { assignFeatureRow, buildGalleryRows } = await import("../sections/gallery-rows");
const { owsPageNumbers } = await import("../sections/page-plan");

/**
 * OWS-V2-01 — Our Wedding Story v2 production renderer (docs/DECISIONS.md
 * "OWS-V2-01"): v1's data contract and behaviour without the opening gate,
 * the helper texts or the guest-name placeholder, with the v2 motion system. Every ViewModel comes from the real pipeline: canonical fixture
 * records + slot rows → TE-04 `buildTemplateMediaSource` (validated against
 * the OWS editor manifest, including the two person-bound portrait slots) →
 * Snapshot → media resolution → ViewModel → RF-04 selection. Slot data is
 * never hand-built into a ViewModel.
 */

const OWS_DIR = join(__dirname, "..");
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
  COVER: "00000000-0000-4000-8000-0000000006c1",
  GROOM: "00000000-0000-4000-8000-0000000006c2",
  BRIDE: "00000000-0000-4000-8000-0000000006c3",
  STORY: "00000000-0000-4000-8000-0000000006c4",
  G1: "00000000-0000-4000-8000-0000000006c5",
  G2: "00000000-0000-4000-8000-0000000006c6",
  G3: "00000000-0000-4000-8000-0000000006c7",
  G4: "00000000-0000-4000-8000-0000000006c8",
  THANKS: "00000000-0000-4000-8000-0000000006c9",
});

type SlotKey = "coverPhoto" | "groomPortrait" | "bridePortrait" | "storyPhoto" | "gallery" | "thankYouPhoto";
type SlotAssignments = Partial<Record<SlotKey, readonly string[]>>;

const FULL_SLOTS: SlotAssignments = Object.freeze({
  coverPhoto: [PHOTO.COVER],
  groomPortrait: [PHOTO.GROOM],
  bridePortrait: [PHOTO.BRIDE],
  storyPhoto: [PHOTO.STORY],
  gallery: [PHOTO.G1, PHOTO.G2, PHOTO.G3, PHOTO.G4],
  thankYouPhoto: [PHOTO.THANKS],
});

function slotRows(assignments: SlotAssignments): TemplateMediaSlotItem[] {
  return Object.entries(assignments).flatMap(([slotKey, ids]) =>
    (ids ?? []).map((projectMediaId, position) => ({ slotKey, position, projectMediaId })),
  );
}

interface OwsOptions extends RendererFixtureSourceOptions {
  guest?: { displayName: string };
  unavailableMediaIds?: readonly string[];
  slots?: SlotAssignments;
  loveStory?: string | null;
}

function owsSource(options: RendererFixtureSourceOptions, slots: SlotAssignments, loveStory: string | null | undefined): BuildSnapshotPayloadInput {
  const input = buildRendererFixtureSourceInput(options);
  const { design, compatibility } = OUR_WEDDING_STORY_V2_MANIFEST;
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
    templateMedia: buildTemplateMediaSource(OUR_WEDDING_STORY_V2_EDITOR_MANIFEST, slotRows(slots), media),
  };
}

async function owsFixture(options: OwsOptions): Promise<RendererFixture> {
  const { guest, unavailableMediaIds, slots, loveStory, ...sourceOptions } = options;
  return runRendererFixturePipeline(owsSource(sourceOptions, slots ?? FULL_SLOTS, loveStory), {
    resolver: createFixtureMediaResolver(unavailableMediaIds === undefined ? {} : { unavailableMediaIds }),
    ...(guest === undefined ? {} : { guest }),
  });
}

function render(viewModel: InvitationViewModel, sections: RendererEffectiveSections, capabilities = EMPTY): string {
  return renderToStaticMarkup(<OurWeddingStoryV2 viewModel={viewModel} sections={sections} capabilities={capabilities} />);
}

async function renderOws(options: OwsOptions, capabilities = EMPTY): Promise<{ html: string; fixture: RendererFixture }> {
  const fixture = await owsFixture(options);
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

/** The Couple section markup only. */
function coupleOf(html: string): string {
  const start = html.indexOf('aria-labelledby="ows-couple-heading"');
  return html.slice(start, html.indexOf("</section>", start));
}

/** Each Couple entry in display order: side, portrait media id (or "names") and caption name. */
function coupleEntries(html: string): string[] {
  const prefix = fixtureMediaUrl("");
  return [...coupleOf(html).matchAll(/<div class="[^"]*(?:portrait(?:Lead|Follow|SingleFigure)|nameBlock)[^"]*" data-side="(GROOM|BRIDE)">([\s\S]*?)<\/(?:figure|div)>/g)].map(
    (match) => {
      const src = /<img [^>]*src="([^"]+)"/.exec(match[2] as string)?.[1];
      const id = src === undefined ? "names" : decodeURIComponent(src.slice(prefix.length));
      return `${match[1] as string}:${id}`;
    },
  );
}

describe("OWS-V2-01 selection and variants", () => {
  it("selects the exact OWS renderer key for every variant, with every declared slot frozen", async () => {
    for (const variant of ["COMMON", "GROOM", "BRIDE"] as const) {
      const fixture = await owsFixture({ variant });
      expect(fixture.selection.rendererKey).toBe("wedding.our-wedding-story.v2");
      expect(Object.keys(fixture.viewModel.media.templateSlots ?? {}).sort()).toStrictEqual(
        ["bridePortrait", "coverPhoto", "gallery", "groomPortrait", "storyPhoto", "thankYouPhoto"],
      );
    }
  });

  it.each<[InvitationVariant, string, string, string, number]>([
    ["COMMON", "Nguyễn Minh Khôi", "Trần Ngọc Hân", "Lễ Thành Hôn", 2],
    ["GROOM", "Nguyễn Minh Khôi", "Trần Ngọc Hân", "Lễ Thành Hôn", 1],
    ["BRIDE", "Trần Ngọc Hân", "Nguyễn Minh Khôi", "Lễ Vu Quy", 1],
  ])("%s: resolver order, rite wording, family priority and operational sides", async (variant, primary, secondary, rite, cards) => {
    const { html } = await renderOws({ variant });
    const text = textOf(html);
    expect(html).toContain(`data-variant="${variant}"`);
    expect(text.indexOf(primary)).toBeLessThan(text.indexOf(secondary));
    expect(text).toContain(rite);
    // COMMON legitimately names both rites (one reception per side); GROOM/BRIDE never the other one.
    if (variant !== "COMMON") expect(text).not.toContain(rite === "Lễ Vu Quy" ? "Lễ Thành Hôn" : "Lễ Vu Quy");
    const firstFamily = variant === "BRIDE" ? "BRIDE" : "GROOM";
    const families = html.slice(html.indexOf('aria-labelledby="ows-families-heading"'));
    expect(families.indexOf(`data-side="${firstFamily}"`)).toBeLessThan(families.indexOf(`data-side="${firstFamily === "GROOM" ? "BRIDE" : "GROOM"}"`));
    expect([...html.matchAll(/<li class="[^"]*receptionCard[^"]*" data-side="(GROOM|BRIDE)"/g)].length).toBe(cards);
  });

  it("cover: no 'Cover story' badge; masthead and names; Thân gửi only for a personalized guest", async () => {
    const plain = await renderOws({ variant: "GROOM" });
    expect(textOf(plain.html)).not.toMatch(/cover story/i);
    expect(plain.html).toContain(COPY.cover.mastheadWord);
    expect(plain.html).not.toContain(COPY.cover.guestLabel);
    const personal = await renderOws({ variant: "COMMON", guest: FIXTURE_GUESTS.PLAYFUL });
    expect(personal.html).toContain(COPY.cover.guestLabel);
    expect(personal.html).toContain(FIXTURE_GUESTS.PLAYFUL.displayName);
  });

  it("pages are numbered over the sections shown, cover = 01", async () => {
    const { html } = await renderOws({ variant: "COMMON" });
    const numbers = [...html.matchAll(/kickerNumber[^"]*" aria-hidden="true">(\d\d)</g)].map((match) => match[1]);
    expect(numbers).toStrictEqual(["02", "03", "04", "05", "06", "07", "08"]);
    expect(
      owsPageNumbers({ families: true, couple: true, invitation: true, date: true, gallery: false, rsvpGift: true, thanks: true }),
    ).toStrictEqual({ families: "02", couple: "03", invitation: "04", date: "05", rsvpGift: "06", thanks: "07" });
  });
});

describe("OWS-V2-01 person-bound portraits (Rule of Three)", () => {
  it.each<[InvitationVariant, string[]]>([
    ["COMMON", [`GROOM:${PHOTO.GROOM}`, `BRIDE:${PHOTO.BRIDE}`]],
    ["GROOM", [`GROOM:${PHOTO.GROOM}`, `BRIDE:${PHOTO.BRIDE}`]],
    ["BRIDE", [`BRIDE:${PHOTO.BRIDE}`, `GROOM:${PHOTO.GROOM}`]],
  ])("%s: each portrait follows its own person, in variant display order", async (variant, expected) => {
    const { html } = await renderOws({ variant });
    expect(coupleEntries(html)).toStrictEqual(expected);
    const couple = textOf(coupleOf(html));
    const groomAt = couple.indexOf(`${COPY.couple.englishRole.GROOM} Nguyễn Minh Khôi`);
    const brideAt = couple.indexOf(`${COPY.couple.englishRole.BRIDE} Trần Ngọc Hân`);
    expect(groomAt).toBeGreaterThan(-1);
    expect(brideAt).toBeGreaterThan(-1);
    expect(variant === "BRIDE" ? brideAt < groomAt : groomAt < brideAt).toBe(true);
    // Alt text names the right person on the right photo.
    const imgs = [...coupleOf(html).matchAll(/<img [^>]*>/g)].map((match) => match[0]);
    expect(imgs.find((tag) => tag.includes(PHOTO.GROOM))).toContain(`alt="${COPY.couple.vietnameseRole.GROOM} Nguyễn Minh Khôi"`);
    expect(imgs.find((tag) => tag.includes(PHOTO.BRIDE))).toContain(`alt="${COPY.couple.vietnameseRole.BRIDE} Trần Ngọc Hân"`);
  });

  it.each<InvitationVariant>(["COMMON", "GROOM", "BRIDE"])("%s: a missing bride portrait is never borrowed; she gets a name block", async (variant) => {
    const { html } = await renderOws({ variant, slots: { ...FULL_SLOTS, bridePortrait: [] } });
    const entries = coupleEntries(html);
    expect(entries).toContain(`GROOM:${PHOTO.GROOM}`);
    expect(entries).toContain("BRIDE:names");
    expect(coupleOf(html)).toContain('data-portraits="single"');
    expect(imageIds(coupleOf(html))).toStrictEqual([PHOTO.GROOM, PHOTO.STORY]);
  });

  it("an UNAVAILABLE groom portrait counts as absent (no substitute, no broken image)", async () => {
    const { html } = await renderOws({ variant: "BRIDE", unavailableMediaIds: [PHOTO.GROOM] });
    expect(coupleEntries(html)).toStrictEqual([`BRIDE:${PHOTO.BRIDE}`, "GROOM:names"]);
  });

  it("no portraits: two name blocks; never an empty frame", async () => {
    const { html } = await renderOws({ variant: "COMMON", slots: { ...FULL_SLOTS, groomPortrait: [], bridePortrait: [] } });
    expect(coupleEntries(html)).toStrictEqual(["GROOM:names", "BRIDE:names"]);
    expect(coupleOf(html)).toContain('data-portraits="names_only"');
  });

  it("orderedCouplePeople binds by explicit side and the layout counts resolved portraits", async () => {
    const { viewModel } = await owsFixture({ variant: "BRIDE" });
    const groom: MediaResolution = { status: "RESOLVED", mediaId: "g", url: "u-g", width: 3, height: 4 };
    const people = orderedCouplePeople(viewModel.people, { groom, bride: undefined });
    expect(people.map((person) => [person.side, person.portrait?.mediaId ?? null])).toStrictEqual([
      ["BRIDE", null],
      ["GROOM", "g"],
    ]);
    expect(coupleLayout(people)).toBe("SINGLE");
  });
});

describe("OWS-V2-01 the six media slots", () => {
  it("full slots: each image in its position, in slot order, never from another slot", async () => {
    const { html } = await renderOws({ variant: "COMMON" });
    const ids = imageIds(html);
    expect(ids.slice(0, 4)).toStrictEqual([PHOTO.COVER, PHOTO.GROOM, PHOTO.BRIDE, PHOTO.STORY]);
    expect([...ids.slice(4, 8)].sort()).toStrictEqual([PHOTO.G1, PHOTO.G2, PHOTO.G3, PHOTO.G4].sort());
    expect(ids.slice(8)).toStrictEqual([PHOTO.THANKS]);
    expect(count(html, 'data-photo="present"')).toBe(2);
  });

  it("empty slots: typographic cover, name blocks, text-only story, no gallery, framed Thank You panel", async () => {
    const { html } = await renderOws({ variant: "GROOM", slots: {} });
    expect(imageIds(html)).toStrictEqual([]);
    expect(count(html, 'data-photo="absent"')).toBe(2);
    expect(html).toContain(COPY.couple.storyTitle);
    expect(html).not.toContain("ows-gallery-heading");
    expect(html).toContain(COPY.thankYou.script);
    expect(html).not.toContain("thanksShade");
  });

  it("an UNAVAILABLE gallery item keeps a neutral, non-interactive tile in place", async () => {
    const { html } = await renderOws({ variant: "COMMON", unavailableMediaIds: [PHOTO.G2] });
    expect(count(html, 'data-unavailable="true"')).toBe(1);
    expect(count(html, `${COPY.gallery.open} `)).toBe(3);
  });

  it("the story photo shows only with a love story; an empty story hides both", async () => {
    const { html } = await renderOws({ variant: "COMMON", loveStory: null });
    expect(html).not.toContain(COPY.couple.storyTitle);
    expect(imageIds(html)).not.toContain(PHOTO.STORY);
    expect(html).toContain(`>${COPY.couple.kicker}</h2>`);
  });

  it("gallery rhythm: 4 → feature + wide closer, 3 → one feature, 5 → feature + pair; portrait preferred large", () => {
    const tile = (width: number, height: number): MediaResolution => ({ status: "RESOLVED", mediaId: `${width}x${height}`, url: "u", width, height });
    const portrait = tile(3, 4);
    const landscape = tile(3, 2);
    expect(buildGalleryRows([portrait, portrait, portrait, portrait]).map((row) => row.kind)).toStrictEqual(["feature", "single"]);
    expect(buildGalleryRows([portrait, portrait, portrait]).map((row) => row.kind)).toStrictEqual(["feature"]);
    expect(buildGalleryRows([portrait, portrait, portrait, portrait, portrait]).map((row) => row.kind)).toStrictEqual(["feature", "pair"]);
    expect(assignFeatureRow(["LANDSCAPE", "PORTRAIT", "SQUARE"])).toStrictEqual([1, 2, 0]);
    const rows = buildGalleryRows([landscape, portrait, landscape, portrait, portrait, portrait]);
    expect(rows[0]).toStrictEqual({ kind: "feature", large: 1, small: [0, 2], flip: false });
    expect(rows[1]).toMatchObject({ kind: "feature", flip: true });
  });
});

describe("OWS-V2-01 content and capabilities", () => {
  it("guest line: verbatim personalized display name, else the fixed default", async () => {
    const personalized = await renderOws({ variant: "COMMON", guest: FIXTURE_GUESTS.LONG });
    expect(personalized.html).toContain(`data-guest="personalized">${FIXTURE_GUESTS.LONG.displayName}<`);
    const plain = await renderOws({ variant: "GROOM" });
    expect(plain.html).toContain(`data-guest="default">${COPY.invitation.defaultGuest}<`);
  });

  it("RSVP, music and countdown exist only with their capabilities; the RSVP name always starts empty", async () => {
    const without = await renderOws({ variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL });
    expect(without.html).not.toContain("ows-rsvp-heading");
    expect(without.html).not.toContain(COPY.music.play);
    expect(without.html).not.toContain("data-countdown");

    const rsvp: RsvpCapabilityV1 = { submit: vi.fn() };
    const withRsvp = await renderOws(
      { variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL },
      { rsvp, clock: { nowEpochMs: Date.parse("2026-10-01T00:00:00Z") } },
    );
    expect(withRsvp.html).toContain("ows-rsvp-heading");
    expect(withRsvp.html).toMatch(/id="ows-rsvp-guest-name"[^>]*value=""/);
    for (const label of Object.values(COPY.rsvp.attendanceLabels)) expect(withRsvp.html).toContain(label);
    expect(withRsvp.html).not.toMatch(/type="radio"[^>]*checked/);
    expect(withRsvp.html).toContain('data-countdown="upcoming"');
    expect(rsvp.submit).not.toHaveBeenCalled();
    expect(OWS_INITIAL_RSVP_DRAFT.attendance).toBeNull();
  });

  it("countdown parts are padded; once passed the approved 'Ngày chung đôi đã đến' replaces them", async () => {
    const { viewModel, selection } = await owsFixture({ variant: "COMMON" });
    const start = Date.parse(viewModel.ceremony.startsAt);
    const parts = ceremonyCountdownParts(viewModel.ceremony, { nowEpochMs: start - (2 * 86_400 + 3 * 3_600 + 4 * 60 + 5) * 1000 });
    expect(parts?.map((part) => part.value)).toStrictEqual(["02", "03", "04", "05"]);
    expect(ceremonyCountdownParts(viewModel.ceremony, { nowEpochMs: start })).toBeNull();
    const html = render(viewModel, selection.effectiveSections, { clock: { nowEpochMs: start + 1 } });
    expect(html).toContain('data-countdown="passed"');
    expect(html).toContain(COPY.date.passed);
  });

  it("calendar: Sunday-first layout from the shared month grid, one ring on the ceremony day", async () => {
    const { html, fixture } = await renderOws({ variant: "COMMON" });
    const grid = deriveCeremonyMonthGridV1(fixture.viewModel);
    const cells = sundayFirstCalendarCells(grid);
    expect(grid.month).toBe(10);
    // 1 October 2026 is a Thursday: four leading blanks (CN T2 T3 T4).
    expect(cells.slice(0, 5).map((cell) => cell.kind)).toStrictEqual(["blank", "blank", "blank", "blank", "day"]);
    expect(count(html, 'data-ceremony-day="true"')).toBe(1);
    expect(html).toMatch(/aria-current="date" data-ceremony-day="true">18</);
  });

  it("gift cards per operational side, own QR only, copy only with the clipboard capability; RSVP-less kicker", async () => {
    const common = await renderOws({ variant: "COMMON" });
    expect([...common.html.matchAll(/bankCard[^"]*" data-side="(GROOM|BRIDE)"/g)].map((match) => match[1])).toStrictEqual(["GROOM", "BRIDE"]);
    expect(common.html).not.toContain(COPY.gift.copy);
    expect(common.html).toContain(`>${COPY.rsvpGift.kickerGiftOnly}</h2>`);
    const bride = await renderOws({ variant: "BRIDE" }, { clipboard: { copyText: vi.fn() } });
    expect([...bride.html.matchAll(/bankCard[^"]*" data-side="(GROOM|BRIDE)"/g)].map((match) => match[1])).toStrictEqual(["BRIDE"]);
    expect(bride.html).toContain(COPY.gift.copy);
    // GIFT-UI-01: the control is icon-only — its whole name is the aria-label,
    // it carries no visible wording, and the number sits on its own centred plate.
    const controls = [
      ...bride.html.matchAll(/<button type="button" class="[^"]*copyButton[^"]*" aria-label="([^"]+)" title="([^"]+)"[^>]*>(.*?)<\/button>/g),
    ];
    expect(controls).toHaveLength(1);
    const [, label, title, inner] = controls[0] ?? [];
    expect(label).toBe(`${COPY.gift.copy} ${COPY.gift.copyTarget} ${COPY.sideLabel.BRIDE}`);
    expect(title).toBe(`${COPY.gift.copy} ${COPY.gift.copyTarget}`);
    expect(inner).toMatch(/^<svg [^>]*aria-hidden="true"/);
    expect(inner?.replace(/<[^>]*>/g, "").trim()).toBe("");
    expect(bride.html).toMatch(/class="[^"]*bankAccount[^"]*" data-line="accountNumber"/);
  });

  it("gift off and no RSVP capability: the whole RSVP & Gift page is omitted", async () => {
    const { fixture } = await renderOws({ variant: "COMMON" });
    const html = render(fixture.viewModel, { ...fixture.selection.effectiveSections, gift: false });
    expect(html).not.toContain("ows-rsvp-gift-heading");
  });
});

describe("OWS-V2-01 interaction models", () => {
  it("no opening gate: the cover is first and the whole invitation is in the server markup, with nothing to tap", async () => {
    for (const variant of ["COMMON", "GROOM", "BRIDE"] as const) {
      const { html } = await renderOws({ variant });
      expect(html).not.toMatch(/data-opening|data-interactive|Mở thiệp|Cuộn xuống để đọc tiếp/);
      // Cover, then every page, in order, with no hidden state.
      const order = ["aria-label=\"Bìa thiệp\"", "ows-families-heading", "ows-couple-heading", "ows-invitation-heading", "ows-date-heading", "ows-gallery-heading", "ows-rsvp-gift-heading", "ows-thanks-heading"];
      const positions = order.map((needle) => html.indexOf(needle));
      expect(positions.every((position) => position >= 0), variant).toBe(true);
      expect([...positions].sort((a, b) => a - b), variant).toStrictEqual(positions);
      expect(html).not.toMatch(/<main[^>]*hidden|display:\s*none/);
      expect(html).not.toContain("<button type=\"button\" class=\"" + "openButton");
    }
  });

  it("music: present from the first render, never started by the renderer (plays only on its own tap)", async () => {
    const fixture = await owsFixture({ variant: "COMMON" });
    const play = vi.fn(async () => undefined);
    const pause = vi.fn(async () => undefined);
    const html = render(fixture.viewModel, { ...fixture.selection.effectiveSections, music: true }, { music: { status: "PAUSED", play, pause } });
    expect(html).toContain(`aria-label="${COPY.music.play}"`);
    expect(html).toContain('data-music="present"');
    // The music control comes before the cover in the column, so it floats over the first screen.
    expect(html.indexOf(COPY.music.play)).toBeLessThan(html.indexOf('aria-label="Bìa thiệp"'));
    expect(play).not.toHaveBeenCalled();
    // Without music there is no control and no masthead offset.
    const { html: silent } = await renderOws({ variant: "COMMON" });
    expect(silent).not.toContain(COPY.music.play);
    expect(silent).not.toContain('data-music="present"');
  });

  it("no helper texts: no gallery tap hint and no guest-name placeholder; the field keeps its label, id and empty value", async () => {
    const rsvp: RsvpCapabilityV1 = { submit: vi.fn() };
    const { html } = await renderOws({ variant: "COMMON" }, { rsvp });
    expect(html).not.toContain("Chạm vào ảnh để xem toàn màn hình");
    expect(html).not.toContain("Ví dụ: Anh Hiếu và gia đình");
    const input = html.match(/<input[^>]*id="ows-rsvp-guest-name"[^>]*>/)?.[0] ?? "";
    expect(input).not.toMatch(/placeholder=/);
    expect(input).toMatch(/value=""/);
    expect(input).toMatch(/name="guestName"/);
    expect(html).toContain(`<label for="ows-rsvp-guest-name" class="`);
    expect(html).toContain(`>${COPY.rsvp.guestNameLabel}</label>`);
    // The message field keeps its placeholder; every gallery tile stays a labelled button.
    expect(html).toContain(`placeholder="${COPY.rsvp.messagePlaceholder}"`);
    expect(html).toMatch(/<button type="button" class="[^"]*galleryTile[^"]*" aria-haspopup="dialog" aria-label="Xem ảnh 1 trên 4"/);
    expect((COPY.cover as Record<string, unknown>).open).toBeUndefined();
    expect((COPY.gallery as Record<string, unknown>).hint).toBeUndefined();
    expect((COPY.rsvp as Record<string, unknown>).guestNamePlaceholder).toBeUndefined();
  });

  it("the gift note is v1's approved wording, unchanged, above the unchanged gift button", async () => {
    const { html } = await renderOws({ variant: "COMMON" });
    expect(COPY.gift.pageNote).toBe(
      "Sự hiện diện của bạn là món quà quý giá nhất. Nếu không thể tham dự và muốn gửi quà chúc mừng, gia đình xin phép nhận tại đây.",
    );
    expect(html.indexOf(COPY.gift.pageNote)).toBeGreaterThan(0);
    expect(html.indexOf(COPY.gift.pageNote)).toBeLessThan(html.indexOf(COPY.gift.open));
  });

  it("music failure note only after an explicit tap", () => {
    expect(musicFailureVisible("BLOCKED", false, false)).toBe(false);
    expect(musicFailureVisible("BLOCKED", true, false)).toBe(true);
    expect(musicFailureVisible("PAUSED", true, true)).toBe(true);
    expect(musicFailureVisible("PLAYING", true, false)).toBe(false);
  });

  it("viewer sequence skips UNAVAILABLE items and wraps both ways", async () => {
    const { viewModel } = await owsFixture({ variant: "COMMON", unavailableMediaIds: [PHOTO.G1] });
    const sequence = viewerSequence(viewModel.media.templateSlots?.gallery ?? []);
    expect(sequence.map((photo) => photo.index)).toStrictEqual([1, 2, 3]);
    expect(stepViewer(0, -1, 3)).toBe(2);
    expect(stepViewer(2, 1, 3)).toBe(0);
  });

  it("every reveal target class exists in the CSS module", () => {
    const css = readFileSync(join(OWS_DIR, "our-wedding-story-v2.module.css"), "utf8");
    for (const target of OWS_REVEAL_TARGETS) {
      const name = target.selector.replace(/^\._?/, "").replace(/_[0-9a-f]+$/, "");
      expect(css, name).toMatch(new RegExp(`\\.${name}[\\s,{:.\\[]`));
    }
  });
});

describe("OWS-V2-01 boundaries", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sources(path);
      return [path];
    });
  }

  it("no prototype path, demo media, framer-motion, next/image, Supabase, other template or decor asset is referenced", () => {
    for (const file of sources(OWS_DIR).filter((path) => /\.(tsx?|css)$/.test(path))) {
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      for (const pattern of [
        /prototypes/,
        /\/demo\//,
        /framer-motion/,
        /next\/image/,
        /supabase/i,
        /elegant-editorial|vietnamese-heritage|romantic-minimal/,
        /process\.env/,
        /\/renderers\//,
        /Hoàng Nam|Minh Anh|18\.10\.2026/,
      ]) {
        expect(pattern.test(code), `${file}: ${String(pattern)}`).toBe(false);
      }
    }
  });

  it("motion only without a reduced-motion preference; pending reveal states never exist otherwise", () => {
    const css = readFileSync(join(OWS_DIR, "our-wedding-story-v2.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css.match(/@media \(prefers-reduced-motion: reduce\)/g)).toHaveLength(1);
    expect(css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"))).toMatch(/animation: none;\s*transition: none;/);
    // Every pending reveal state and every animation sits after the first no-preference block opens.
    const firstNoPreference = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    expect(firstNoPreference).toBeGreaterThan(0);
    expect(css.indexOf('[data-ows-reveal="')).toBeGreaterThan(firstNoPreference);
    expect(/animation:\s*ows-/.test(css.slice(0, firstNoPreference))).toBe(false);
    expect(css).not.toMatch(/@import|url\((?!["']?data:)/);
  });

  it("every reveal variant is styled and every variant is used", () => {
    const css = readFileSync(join(OWS_DIR, "our-wedding-story-v2.module.css"), "utf8");
    const used = new Set(OWS_REVEAL_TARGETS.map((target) => target.variant));
    expect([...used].sort()).toStrictEqual(["draw", "head", "photo", "rise", "tiles"]);
    for (const variant of used) expect(css, String(variant)).toContain(`[data-ows-reveal="${String(variant)} shown"]`);
  });
});

describe("OWS directions CTA (LAUNCH-P0-01)", () => {
  /** Every new-tab anchor's href, in document order. */
  const directionHrefs = (html: string) =>
    [...html.matchAll(/<a [^>]*href="([^"]+)" target="_blank" rel="noopener noreferrer"/g)].map((match) => match[1]);

  it("COMMON links each ceremony card's own canonical mapUrl, safely in a new tab", async () => {
    expect(directionHrefs((await renderOws({ variant: "COMMON" })).html)).toStrictEqual([
      "https://maps.example.invalid/groom-home",
      "https://maps.example.invalid/bride-home",
    ]);
  });

  it("GROOM / BRIDE link only their own ceremony card's mapUrl", async () => {
    expect(directionHrefs((await renderOws({ variant: "GROOM" })).html)).toStrictEqual(["https://maps.example.invalid/groom-home"]);
    expect(directionHrefs((await renderOws({ variant: "BRIDE" })).html)).toStrictEqual(["https://maps.example.invalid/bride-home"]);
  });

  it("a null mapUrl renders no link and nothing is fabricated", async () => {
    const input = owsSource({ variant: "COMMON" }, FULL_SLOTS, undefined);
    input.events = input.events.map((event) => ({ ...event, mapUrl: null }));
    const fixture = await runRendererFixturePipeline(input, { resolver: createFixtureMediaResolver() });
    const html = render(fixture.viewModel, fixture.selection.effectiveSections);
    expect(directionHrefs(html)).toStrictEqual([]);
    expect(html).not.toMatch(/google\.[a-z.]+\/maps|maps\.google|maps\.app\.goo\.gl|maps\.apple|geo:/);
  });
});

describe("OWS-V2-UI-02 the invitation date block", () => {
  /** The invitation's date block: the row (weekday | time over day | month / year) and what follows it. */
  const dateBlock = (html: string) => /inviteDate_[^"]*">([\s\S]*?)<\/div><\/div>/.exec(html)?.[1] ?? "";

  it("drops the caption line and sets the canonical lunar text under the day number", async () => {
    for (const variant of ["COMMON", "GROOM", "BRIDE"] as const) {
      const { html, fixture } = await renderOws({ variant });
      expect(html).not.toContain("Hôn lễ được cử hành vào lúc");
      const lunar = fixture.viewModel.ceremony.lunarDateDisplay;
      expect(lunar).not.toBeNull();
      const block = dateBlock(html);
      // The verbatim canonical value, after the day number, behind the fixed label.
      expect(block).toContain(`Tức ngày ${String(lunar)}`);
      expect(block.indexOf("inviteDateDay")).toBeLessThan(block.indexOf("inviteDateLunar"));
    }
  });

  it("no canonical lunar text → no lunar line, and nothing is calculated", async () => {
    const { html } = await renderOws({ variant: "GROOM", ceremonyLunar: "ABSENT" });
    expect(html).not.toContain("Tức ngày");
    expect(html).not.toContain("inviteDateLunar");
    expect(html).not.toMatch(/Âm Lịch|âm lịch/);
    // The Gregorian row is untouched: the time still stands over the day number.
    expect(dateBlock(html)).toMatch(/inviteDateTime[^>]*>\d{2}:\d{2}<\/span><span class="[^"]*inviteDateDay[^>]*>\d{1,2}</);
  });
});
