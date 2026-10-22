import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InvitationVariant } from "../../../../../lib/domain";
import { deriveEventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type {
  InvitationViewModel,
  MediaResolution,
  ResolvedMedia,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
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
  FIXTURE_GUESTS,
  FIXTURE_PROJECT_ID,
  buildRendererFixtureSourceInput,
  type RendererFixtureSourceOptions,
} from "../../../../core/fixtures/renderer-fixture-sources";
import {
  TEMPLATE_EDITOR_PERSON_BOUND_SLOT_EXCEPTIONS,
  TEMPLATE_EDITOR_SLOT_KEY_FORBIDDEN_WORDS,
  validateTemplateEditorManifest,
} from "../../../../core/editor-manifest";
import { validateProductionEditorManifests } from "../../../../core/production-editor-manifests";
import {
  createProductionCompatibilityRegistry,
  type ProductionCompatibilityRegistryV1,
} from "../../../../core/production-renderer-manifests";
import { SE_DUYEN_V1_EDITOR_MANIFEST } from "../../../../editor/wedding/se-duyen-v1";
import { validateRendererProductionManifest, composeProductionRendererKey } from "../../../../core/renderer-manifest";
import { SE_DUYEN_V1_MANIFEST } from "../manifest";

// next/font loaders only run under the Next compiler; `npm run build` proves the real configuration.
vi.mock("../fonts", () => ({ SE_DUYEN_V1_FONT_VARIABLES_CLASS_NAME: "sd-test-font-variables" }));

const { SeDuyenV1 } = await import("../se-duyen-v1");
const { SE_DUYEN_V1_COPY: COPY } = await import("../copy");
const { buildInvitationWording } = await import("../sections/invitation-wording");
const { albumPhotos, stepAlbum, SE_DUYEN_ALBUM_FRAMES } = await import("../sections/gallery-frames");
const { albumAlt } = await import("../interactive/gallery-viewer");
const { countdownDials, SE_DUYEN_COUNTDOWN_UNITS } = await import("../interactive/countdown");
const { musicFailureVisible } = await import("../interactive/music-control");

/**
 * SD-V1-01 — Se Duyên v1 production renderer foundation.
 *
 * Every ViewModel comes from the real pipeline: canonical fixture records →
 * Snapshot → media resolution → ViewModel → RF-04 selection. Nothing is
 * hand-built into a ViewModel, and the registry is built from the Se Duyên
 * manifest through the real RF-06 validator, so a manifest that could not be
 * registered in production cannot pass these tests either.
 */

const EMPTY: InvitationRendererCapabilitiesV1 = Object.freeze({});

/** Fixture PHOTO ids; all distinct, so a repeat or a reorder is visible. */
const PHOTO = Object.freeze({
  OPENING: "00000000-0000-4000-8000-0000000007d1",
  LEAD: "00000000-0000-4000-8000-0000000007d2",
  ASIDE: "00000000-0000-4000-8000-0000000007d3",
  CLOSING: "00000000-0000-4000-8000-0000000007d4",
  G1: "00000000-0000-4000-8000-0000000007e1",
  G2: "00000000-0000-4000-8000-0000000007e2",
  G3: "00000000-0000-4000-8000-0000000007e3",
  G4: "00000000-0000-4000-8000-0000000007e4",
  G5: "00000000-0000-4000-8000-0000000007e5",
});

/** The album's slot order, as a customer would arrange it. */
const ALBUM_IDS = [PHOTO.G1, PHOTO.G2, PHOTO.G3, PHOTO.G4] as const;

type SlotKey = "openingPhoto" | "portraitLead" | "portraitAside" | "closingPhoto" | "gallery";
type SlotAssignments = Partial<Record<SlotKey, readonly string[]>>;

const ALL_SLOTS: SlotAssignments = Object.freeze({
  openingPhoto: [PHOTO.OPENING],
  portraitLead: [PHOTO.LEAD],
  portraitAside: [PHOTO.ASIDE],
  closingPhoto: [PHOTO.CLOSING],
  gallery: ALBUM_IDS,
});

function slotRows(assignments: SlotAssignments): TemplateMediaSlotItem[] {
  return Object.entries(assignments).flatMap(([slotKey, ids]) =>
    (ids ?? []).map((projectMediaId, position) => ({ slotKey, position, projectMediaId })),
  );
}

/**
 * The renderer is not in `PRODUCTION_RENDERER_MANIFESTS` yet (SD-V1-02), so
 * the fixture pipeline is given a registry built from its manifest — by the
 * same `createProductionCompatibilityRegistry` the production list uses.
 */
const SD_REGISTRY: ProductionCompatibilityRegistryV1 = createProductionCompatibilityRegistry([SE_DUYEN_V1_MANIFEST]);

interface SdOptions extends RendererFixtureSourceOptions {
  guest?: { displayName: string };
  invitationMessage?: string | null;
  unavailableMediaIds?: readonly string[];
  /** Template media slot assignments; defaults to all four SINGLE slots filled. */
  slots?: SlotAssignments;
}

function sdSource(
  options: RendererFixtureSourceOptions,
  invitationMessage: string | null | undefined,
  slots: SlotAssignments,
): BuildSnapshotPayloadInput {
  const input = buildRendererFixtureSourceInput(options);
  const { design, compatibility } = SE_DUYEN_V1_MANIFEST;
  const details = input.weddingDetails as NonNullable<BuildSnapshotPayloadInput["weddingDetails"]>;
  const photos: SnapshotMediaSource[] = Object.values(PHOTO).map((id, index) => ({
    id,
    projectId: FIXTURE_PROJECT_ID,
    mediaType: "PHOTO",
    sortOrder: index,
  }));
  const media = [...input.media, ...photos];
  return {
    ...input,
    ...(invitationMessage === undefined ? {} : { weddingDetails: { ...details, invitationMessage } }),
    media,
    design: {
      ...input.design,
      paletteKey: design.palettes[0] as string,
      fontPresetKey: design.fontPresets[0] as string,
      effectPresetKey: design.effectPresets[0] as string,
    },
    templateVersion: { ...input.templateVersion, rendererKey: compatibility.rendererKey },
    // The real TE-04 builder, validated against Se Duyên's own editor
    // manifest: slot data is never hand-built into a ViewModel.
    templateMedia: buildTemplateMediaSource(SE_DUYEN_V1_EDITOR_MANIFEST, slotRows(slots), media),
  };
}

async function sdFixture(options: SdOptions): Promise<RendererFixture> {
  const { guest, invitationMessage, unavailableMediaIds, slots, ...sourceOptions } = options;
  return runRendererFixturePipeline(sdSource(sourceOptions, invitationMessage, slots ?? ALL_SLOTS), {
    resolver: createFixtureMediaResolver(unavailableMediaIds === undefined ? {} : { unavailableMediaIds }),
    registry: SD_REGISTRY,
    ...(guest === undefined ? {} : { guest }),
  });
}

function render(viewModel: InvitationViewModel, sections: RendererEffectiveSections): string {
  return renderToStaticMarkup(<SeDuyenV1 viewModel={viewModel} sections={sections} capabilities={EMPTY} />);
}

async function renderSd(options: SdOptions): Promise<{ html: string; fixture: RendererFixture }> {
  const fixture = await sdFixture(options);
  return { html: render(fixture.viewModel, fixture.selection.effectiveSections), fixture };
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

/** The same render, with a music capability so the disc is present. */
async function renderSdWithMusic(
  options: SdOptions,
  music: MusicCapabilityV1,
): Promise<{ html: string; fixture: RendererFixture }> {
  const fixture = await sdFixture(options);
  const html = renderToStaticMarkup(
    <SeDuyenV1 viewModel={fixture.viewModel} sections={fixture.selection.effectiveSections} capabilities={{ music }} />,
  );
  return { html, fixture };
}

/** The same render, with an explicit clock so the countdown is present. */
async function renderSdWithClock(
  options: SdOptions,
  nowEpochMs: number,
): Promise<{ html: string; fixture: RendererFixture }> {
  const fixture = await sdFixture(options);
  const html = renderToStaticMarkup(
    <SeDuyenV1 viewModel={fixture.viewModel} sections={fixture.selection.effectiveSections} capabilities={{ clock: { nowEpochMs } }} />,
  );
  return { html, fixture };
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

const VARIANTS: readonly InvitationVariant[] = ["COMMON", "GROOM", "BRIDE"];

// ---------------------------------------------------------------------------
// A. Production contract
// ---------------------------------------------------------------------------

describe("A. production contract", () => {
  it("the manifest passes the real RF-06 full-manifest validator unchanged", () => {
    expect(validateRendererProductionManifest(SE_DUYEN_V1_MANIFEST)).toStrictEqual(SE_DUYEN_V1_MANIFEST);
  });

  it("the renderer key is the composition of its own identity, not a hand-typed string", () => {
    expect(composeProductionRendererKey(SE_DUYEN_V1_MANIFEST.identity)).toBe("wedding.se-duyen.v1");
    expect(SE_DUYEN_V1_MANIFEST.compatibility.rendererKey).toBe(composeProductionRendererKey(SE_DUYEN_V1_MANIFEST.identity));
  });

  it("all three wedding variants are supported and payload v1 is the only schema", () => {
    expect(SE_DUYEN_V1_MANIFEST.compatibility.supportedVariants).toStrictEqual(["COMMON", "GROOM", "BRIDE"]);
    expect(SE_DUYEN_V1_MANIFEST.compatibility.supportedPayloadSchemaVersions).toStrictEqual([1]);
  });

  it("the section settings schema is exactly the capable sections", () => {
    const capable = Object.entries(SE_DUYEN_V1_MANIFEST.compatibility.sectionCapabilities)
      .filter(([, value]) => value)
      .map(([key]) => key);
    expect(Object.keys(SE_DUYEN_V1_MANIFEST.design.sectionSettingsSchema).sort()).toStrictEqual(capable.sort());
  });

  it("every variant selects this renderer through the real RF-04 selection", async () => {
    for (const variant of VARIANTS) {
      const fixture = await sdFixture({ variant });
      expect(fixture.selection.rendererKey, variant).toBe("wedding.se-duyen.v1");
    }
  });

  it("the sections this renderer cannot render are never effective, whatever the staff settings say", async () => {
    const fixture = await sdFixture({
      variant: "COMMON",
      sectionSettings: { gallery: true, music: true, gift: true, timeline: true, dressCode: true, photoStory: true },
    });
    const effective = fixture.selection.effectiveSections;
    for (const key of ["gift", "dressCode", "photoStory"] as const) {
      expect(effective[key], key).toBe(false);
    }
    // B2, B3A and C1: the album, the run-of-show and the music are real.
    expect(effective.gallery).toBe(true);
    expect(effective.timeline).toBe(true);
    expect(effective.music).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B. The Rule of Three — COMMON, GROOM, BRIDE
// ---------------------------------------------------------------------------

describe("B. variants", () => {
  it.each(VARIANTS)("%s renders every section of the slice exactly once", async (variant) => {
    const { html } = await renderSd({ variant, loveStoryPhoto: "PRESENT" });
    expect(html).toContain(`data-variant="${variant}"`);
    expect(count(html, 'data-renderer="se-duyen-v1"')).toBe(1);
    for (const heading of ["sd-invite-title", "sd-couple-heading", "sd-houses-heading", "sd-rite-title", "sd-closing-eyebrow"]) {
      expect(count(html, heading), heading).toBeGreaterThanOrEqual(1);
    }
  });

  it("GROOM and COMMON announce Lễ Thành Hôn; BRIDE announces Lễ Vu Quy — and never the other", async () => {
    for (const variant of ["COMMON", "GROOM"] as const) {
      const { html, fixture } = await renderSd({ variant });
      expect(fixture.viewModel.ceremony.title).toBe("Lễ Thành Hôn");
      expect(textOf(html)).toContain("Lễ Thành Hôn");
      // BRIDE's own rite card is a legitimate COMMON row, so only GROOM is checked for absence.
      if (variant === "GROOM") expect(textOf(html)).not.toContain("Lễ Vu Quy");
    }
    const bride = await renderSd({ variant: "BRIDE" });
    expect(bride.fixture.viewModel.ceremony.title).toBe("Lễ Vu Quy");
    expect(textOf(bride.html)).toContain("Lễ Vu Quy");
    expect(textOf(bride.html)).not.toContain("Lễ Thành Hôn");
  });

  it("the primary person leads the cover, the hero, the couple page and the signature in every variant", async () => {
    for (const variant of VARIANTS) {
      const { html, fixture } = await renderSd({ variant });
      const { primary, secondary } = fixture.viewModel.people;
      expect(primary.side, variant).toBe(variant === "BRIDE" ? "BRIDE" : "GROOM");
      const text = textOf(html);
      // Four places name the couple; the primary name precedes the secondary in each.
      const pairs = [...text.matchAll(new RegExp(`${primary.name}\\s*&\\s*${secondary.name}`, "g"))];
      expect(pairs.length, variant).toBeGreaterThanOrEqual(2);
      expect(text.indexOf(primary.name), variant).toBeLessThan(text.indexOf(secondary.name));
      // The role labels follow each person's own side, never a position.
      expect(text, variant).toContain(`${COPY.roleLabel[primary.side]} & ${COPY.roleLabel[secondary.side]}`);
    }
  });

  it("both houses stay on the page in every variant, primary side first, and never as 'Song thân'", async () => {
    for (const variant of VARIANTS) {
      const { html, fixture } = await renderSd({ variant });
      const text = textOf(html);
      expect(text, variant).toContain(COPY.sideLabel.GROOM);
      expect(text, variant).toContain(COPY.sideLabel.BRIDE);
      expect(text, variant).not.toContain("Song thân");
      const primaryLabel = COPY.sideLabel[fixture.viewModel.families.primary.side];
      const secondaryLabel = COPY.sideLabel[fixture.viewModel.families.secondary.side];
      const houses = html.slice(html.indexOf('aria-labelledby="sd-houses-heading"'));
      expect(houses.indexOf(primaryLabel), variant).toBeLessThan(houses.indexOf(secondaryLabel));
    }
  });

  it("each family's own names are printed directly under its house label", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON" });
    const { groom, bride } = fixture.viewModel.families;
    for (const family of [groom, bride]) {
      const start = html.indexOf(`data-side="${family.side}"`, html.indexOf('aria-labelledby="sd-houses-heading"'));
      expect(start, family.side).toBeGreaterThan(0);
      const house = textOf(html.slice(start, html.indexOf("</div>", start) + 6));
      expect(house, family.side).toContain(COPY.sideLabel[family.side]);
      for (const name of [family.father, family.mother]) {
        if (name !== null) expect(house, `${family.side} ${name}`).toContain(name);
      }
    }
  });

  it("one ceremony card per operational side: two on COMMON, one on GROOM and BRIDE", async () => {
    const common = await renderSd({ variant: "COMMON" });
    expect(common.fixture.viewModel.ceremonyCards.map((card) => card.side)).toStrictEqual(["GROOM", "BRIDE"]);
    // Both rows are labelled on COMMON, because the heading cannot carry both.
    expect(count(common.html, 'class="ritePartyRow"') + count(common.html, "ritePartyRow")).toBeGreaterThanOrEqual(2);
    for (const variant of ["GROOM", "BRIDE"] as const) {
      const single = await sdFixture({ variant });
      expect(single.viewModel.ceremonyCards, variant).toHaveLength(1);
      expect(single.viewModel.ceremonyCards[0]?.side, variant).toBe(variant);
    }
  });

  it("the rite is announced at the hosting family's home — the primary side's", async () => {
    for (const variant of VARIANTS) {
      const { html, fixture } = await renderSd({ variant });
      const host = fixture.viewModel.families.primary;
      const rite = textOf(html.slice(html.indexOf('aria-labelledby="sd-rite-title"')));
      expect(rite, variant).toContain(`${COPY.ceremony.homePrefix} ${COPY.sideLabel[host.side]}`);
      if (host.address !== null) expect(rite, variant).toContain(host.address);
    }
  });
});

// ---------------------------------------------------------------------------
// C. Date and time — one canonical instant (CLAUDE.md §7)
// ---------------------------------------------------------------------------

describe("C. date and time", () => {
  it.each(VARIANTS)("%s prints one weekday, date and hour, all from the canonical ceremony instant", async (variant) => {
    const { html, fixture } = await renderSd({ variant });
    const expected = deriveEventDateTimePresentationV1(fixture.viewModel.ceremony);
    const text = textOf(html);
    const dotted = `${expected.day}.${expected.month}.${expected.year}`;

    // Cover, hero and the invitation plate all carry the same date.
    expect(count(text, dotted), "dotted date").toBeGreaterThanOrEqual(3);
    expect(count(text, expected.weekday), "weekday").toBeGreaterThanOrEqual(3);
    expect(text, "time").toContain(expected.time);
    // The ceremony rail prints the same day, month and year.
    const rite = textOf(html.slice(html.indexOf('aria-labelledby="sd-rite-title"')));
    expect(rite).toContain(`${COPY.ceremony.monthPrefix} ${expected.month}`);
    expect(rite).toContain(expected.day);
    expect(rite).toContain(expected.year);
    expect(rite).toContain(expected.time);
    // Nothing is a localized string: the weekday is the fixed v1 vocabulary.
    expect(text).not.toMatch(/Thursday|Friday|Monday|Tuesday|Wednesday|Saturday|Sunday/);
  });

  it("the lunar companion line is the Project's stored text, and absent when it has none", async () => {
    const withLunar = await renderSd({ variant: "COMMON", ceremonyLunar: "PRESENT" });
    const lunar = withLunar.fixture.viewModel.ceremony.lunarDateDisplay;
    expect(lunar).not.toBeNull();
    expect(textOf(withLunar.html)).toContain(`${COPY.invitation.lunarPrefix} ${lunar as string}`);

    const without = await renderSd({ variant: "COMMON", ceremonyLunar: "ABSENT" });
    expect(without.fixture.viewModel.ceremony.lunarDateDisplay).toBeNull();
    expect(textOf(without.html)).not.toContain(COPY.invitation.lunarPrefix);
  });

  it("a reception on the ceremony's own day shows its hour alone, not a repeated date", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON" });
    const ceremonyDate = deriveEventDateTimePresentationV1(fixture.viewModel.ceremony);
    const parties = html.slice(html.indexOf("riteParties"));
    for (const card of fixture.viewModel.ceremonyCards) {
      const start = parties.indexOf(`data-side="${card.side}"`);
      expect(start, card.side).toBeGreaterThan(0);
      const when = deriveEventDateTimePresentationV1(card.event);
      const row = textOf(parties.slice(start, parties.indexOf("</div>", start) + 6));
      expect(row, card.side).toContain(when.time);
      const sameDay = when.day === ceremonyDate.day && when.month === ceremonyDate.month && when.year === ceremonyDate.year;
      expect(row.includes(`${when.day}.${when.month}.${when.year}`), `${card.side} repeats the date`).toBe(!sameDay);
    }
  });
});

// ---------------------------------------------------------------------------
// D. Guest personalization and the customer's wording
// ---------------------------------------------------------------------------

describe("D. guest and wording", () => {
  it.each(Object.entries(FIXTURE_GUESTS))("the %s guest display name is printed verbatim and marked personalized", async (_label, guest) => {
    const { html } = await renderSd({ variant: "COMMON", guest });
    expect(html).toContain('data-guest="personalized"');
    expect(textOf(html)).toContain(guest.displayName);
  });

  it("with no guest overlay the fixed default line is used, and nothing claims personalization", async () => {
    const { html } = await renderSd({ variant: "COMMON" });
    expect(html).toContain('data-guest="default"');
    expect(textOf(html)).toContain(COPY.invitation.defaultGuest);
  });

  it("the customer's sentence is split at {guest} and both halves are kept", () => {
    const wording = buildInvitationWording({
      message: "Hân hoan báo tin {guest} cùng tới dự {ceremonyTitle} của chúng tôi.",
      guestText: "Anh Hiếu và gia đình",
      salutation: COPY.invitation.salutation,
      ceremonyTitle: "Lễ Vu Quy",
    });
    expect(wording.lead).toBe("Hân hoan báo tin");
    expect(wording.body).toBe("cùng tới dự Lễ Vu Quy của chúng tôi.");
  });

  it("a lead that only repeats the salutation above it is dropped, not printed twice", () => {
    const wording = buildInvitationWording({
      message: "Trân trọng kính mời {guest} tới dự lễ cưới.",
      guestText: "Bạn và Gia Đình",
      salutation: "Trân Trọng Kính Mời",
      ceremonyTitle: "Lễ Thành Hôn",
    });
    expect(wording.lead).toBe("");
    expect(wording.body).toBe("tới dự lễ cưới.");
  });

  it("a sentence without the token is printed whole, and an empty one prints nothing", () => {
    expect(
      buildInvitationWording({ message: "Kính mời quý khách.", guestText: "x", salutation: "y", ceremonyTitle: "z" }),
    ).toStrictEqual({ lead: "", body: "Kính mời quý khách." });
    expect(buildInvitationWording({ message: null, guestText: "x", salutation: "y", ceremonyTitle: "z" })).toStrictEqual({
      lead: "",
      body: "",
    });
  });

  it("the ceremony title substituted into the wording is always the variant's own", async () => {
    for (const variant of VARIANTS) {
      const { html, fixture } = await renderSd({
        variant,
        invitationMessage: "Kính mời {guest} tới dự {ceremonyTitle} của chúng tôi.",
      });
      expect(textOf(html), variant).toContain(`tới dự ${fixture.viewModel.ceremony.title} của chúng tôi.`);
      expect(html, variant).not.toContain("{ceremonyTitle}");
      expect(html, variant).not.toContain("{guest}");
    }
  });

  it("the customer's sentence disappears when the section is switched off", async () => {
    const message = "Kính mời {guest} tới dự lễ cưới của chúng tôi.";
    const on = await renderSd({ variant: "COMMON", invitationMessage: message });
    expect(textOf(on.html)).toContain("tới dự lễ cưới của chúng tôi.");
    const off = await renderSd({ variant: "COMMON", invitationMessage: message, sectionSettings: { invitationMessage: false } });
    expect(off.fixture.selection.effectiveSections.invitationMessage).toBe(false);
    expect(textOf(off.html)).not.toContain("tới dự lễ cưới của chúng tôi.");
  });
});

// ---------------------------------------------------------------------------
// E. Media — the Project's own photographs only
// ---------------------------------------------------------------------------

describe("E. media", () => {
  /** The four SINGLE frames' urls, in document order; the album has its own section. */
  function frameUrls(html: string): string[] {
    return [...html.matchAll(/--sdp-(hero|coupleMain|coupleAside|closing)-image:url\(&quot;([^&]+)&quot;\)/g)].map(
      (match) => `${match[1] as string}=${match[2] as string}`,
    );
  }

  function urlOf(fixture: RendererFixture, slotKey: SlotKey): string {
    const item = fixture.viewModel.media.templateSlots?.[slotKey]?.[0];
    expect(item?.status, slotKey).toBe("RESOLVED");
    return (item as { url: string }).url;
  }

  it("the four SINGLE slots each fill their own frame, once, from the Project's own media", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON" });
    expect(frameUrls(html)).toStrictEqual([
      `hero=${urlOf(fixture, "openingPhoto")}`,
      `coupleMain=${urlOf(fixture, "portraitLead")}`,
      `coupleAside=${urlOf(fixture, "portraitAside")}`,
      `closing=${urlOf(fixture, "closingPhoto")}`,
    ]);
  });

  it("no photograph is ever repeated across frames", async () => {
    const { html } = await renderSd({ variant: "COMMON" });
    const urls = frameUrls(html).map((entry) => entry.split("=")[1] as string);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("each slot is independent: only the opening photo fills the box, and nothing else appears", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", slots: { openingPhoto: [PHOTO.OPENING] } });
    expect(frameUrls(html)).toStrictEqual([`hero=${urlOf(fixture, "openingPhoto")}`]);
    // The frames with no photograph of their own are omitted, not emptied.
    expect(html).not.toContain("--sdp-coupleMain-image");
    expect(html).not.toContain("--sdp-coupleAside-image");
    expect(html).not.toContain("--sdp-closing-image");
  });

  it("the opening photograph is painted on the card inside the box that grows into the hero", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON" });
    const slot = html.indexOf("photoSlot");
    expect(slot).toBeGreaterThan(0);
    // The card lives inside the box control, so the same element becomes the hero.
    expect(html.lastIndexOf("boxButton", slot)).toBeGreaterThan(0);
    expect(html.slice(slot)).toContain(urlOf(fixture, "openingPhoto"));
    expect(count(html, "--sdp-hero-image")).toBe(1);
  });

  it("an UNAVAILABLE opening photo omits the frame: no broken image, no demo art, and the box still opens", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", unavailableMediaIds: [PHOTO.OPENING] });
    expect(fixture.viewModel.media.templateSlots?.openingPhoto?.[0]?.status).toBe("UNAVAILABLE");
    expect(html).not.toContain("--sdp-hero-image");
    expect(html).not.toContain("photoSlot");
    // The control and the approved sequence are untouched.
    expect(html).toContain("boxButton");
    expect(html).toContain("openingClock");
    // And the rest of the invitation is unaffected.
    expect(html).toContain("--sdp-coupleMain-image");
  });

  it("the aside frame is only drawn beside the lead, and the solo composition applies without it", async () => {
    const both = await renderSd({ variant: "COMMON" });
    expect(both.html).toContain("--sdp-coupleAside-image");
    expect(both.html).not.toContain("coupleFramesSolo");

    const leadOnly = await renderSd({ variant: "COMMON", slots: { portraitLead: [PHOTO.LEAD] } });
    expect(leadOnly.html).toContain("--sdp-coupleMain-image");
    expect(leadOnly.html).not.toContain("--sdp-coupleAside-image");
    expect(leadOnly.html).toContain("coupleFramesSolo");

    // An aside with no lead draws neither: the aside is positioned against the lead.
    const asideOnly = await renderSd({ variant: "COMMON", slots: { portraitAside: [PHOTO.ASIDE] } });
    expect(asideOnly.html).not.toContain("coupleFrames");
    expect(asideOnly.html).not.toContain("--sdp-coupleAside-image");
  });

  it("a Project with no photograph at all still renders a complete invitation", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", slots: {} });
    for (const slotKey of ["openingPhoto", "portraitLead", "portraitAside", "closingPhoto", "gallery"] as const) {
      expect(fixture.viewModel.media.templateSlots?.[slotKey], slotKey).toStrictEqual([]);
    }
    expect(frameUrls(html)).toStrictEqual([]);
    for (const heading of ["sd-invite-title", "sd-couple-heading", "sd-houses-heading", "sd-rite-title", "sd-closing-eyebrow"]) {
      expect(html, heading).toContain(heading);
    }
  });

  it("no legacy media role is read: under TEMPLATE_SLOTS every one is empty, and the QR that remains is not rendered", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", galleryCount: 3, portraits: "PRESENT", loveStoryPhoto: "PRESENT" });
    const { media } = fixture.viewModel;
    // A TEMPLATE_SLOTS Snapshot carries no legacy media refs at all, so these
    // roles cannot leak into a frame even by mistake.
    expect(media.cover).toBeUndefined();
    expect(media.loveStoryPhoto).toBeUndefined();
    expect(media.gallery).toStrictEqual([]);
    expect(media.photoStory).toStrictEqual([]);
    expect(media.portrait).toStrictEqual({});
    // `audio` and `qr` are the semantic roles the slot model keeps, for the
    // music and gift capabilities this renderer does not have yet; neither
    // reaches the markup.
    const semantic: readonly (MediaResolution | undefined)[] = [media.audio, media.qr.groom, media.qr.bride];
    const resolved = semantic.filter((item): item is ResolvedMedia => item?.status === "RESOLVED");
    expect(resolved.length).toBeGreaterThan(0);
    for (const item of resolved) expect(html, item.url).not.toContain(item.url);
  });

  it("frames keep their approved tuned focal point; only a landscape photograph is re-centred", async () => {
    const { html } = await renderSd({ variant: "COMMON" });
    // The fixture slot photos carry no dimensions, so no frame is re-centred.
    expect(html).not.toContain("-pos:");
    expect(count(html, "--sdp-hero-size:cover")).toBe(1);
  });

  it("every decorative URL in the markup is this renderer's own immutable path", async () => {
    const { html } = await renderSd({ variant: "COMMON" });
    for (const url of [...html.matchAll(/url\(&quot;([^&]+)&quot;\)/g)].map((match) => match[1] as string)) {
      expect(url.startsWith("/renderers/wedding/se-duyen/v1/") || url.includes("fixture"), url).toBe(true);
    }
    expect(html).not.toContain("/prototypes/");
    expect(html).not.toContain("/showroom/");
  });
});

// ---------------------------------------------------------------------------
// F. The opening, and what a guest without JavaScript sees
// ---------------------------------------------------------------------------

describe("F. opening", () => {
  it("server markup starts closed, is not marked interactive, and the whole invitation is present", async () => {
    const { html } = await renderSd({ variant: "COMMON" });
    expect(html).toContain('data-phase="closed"');
    expect(html).not.toContain("data-interactive");
    // Nothing is hidden from a guest whose JavaScript never runs.
    expect(html).toContain('aria-labelledby="sd-invite-title"');
    expect(html).toContain('aria-labelledby="sd-rite-title"');
    expect(html).toContain('aria-labelledby="sd-closing-eyebrow"');
  });

  it("the box itself is the only control of the opening, and it carries an accessible name", async () => {
    // With no album there is nothing else to press anywhere in the invitation.
    const { html } = await renderSd({ variant: "COMMON", slots: {} });
    expect(count(html, "<button")).toBe(1);
    expect(html).toContain(`aria-label="${COPY.cover.openHint}"`);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });

  it("the cover text is in the accessibility tree while closed and the hero is not", async () => {
    const { html } = await renderSd({ variant: "COMMON" });
    expect(html).toMatch(/<div class="[^"]*coverTop[^"]*" aria-hidden="false"/);
    expect(html).toMatch(/<section class="[^"]*_hero_[^"]*" aria-hidden="true"/);
    // The stage itself is never hidden: the photograph lives there.
    expect(html).toMatch(/<section class="[^"]*_stage_[^"]*"><div/);
  });
});

// ---------------------------------------------------------------------------
// G. Editor manifest (SD-V1-02A)
// ---------------------------------------------------------------------------

describe("G. editor manifest", () => {
  const editor = validateTemplateEditorManifest(SE_DUYEN_V1_EDITOR_MANIFEST);

  it("validates unchanged, names this renderer and uses the template-slot media model", () => {
    expect(editor).toStrictEqual(SE_DUYEN_V1_EDITOR_MANIFEST);
    expect(editor.rendererKey).toBe(SE_DUYEN_V1_MANIFEST.compatibility.rendererKey);
    expect(editor.mediaModel).toBe("TEMPLATE_SLOTS");
  });

  it("five slots cover the direction's eight art-directed frames, the album as one ordered list", () => {
    expect(editor.mediaSlots.map((slot) => slot.key)).toStrictEqual([
      "openingPhoto",
      "portraitLead",
      "portraitAside",
      "gallery",
      "closingPhoto",
    ]);
    const gallery = editor.mediaSlots.find((slot) => slot.key === "gallery");
    expect(gallery?.cardinality).toBe("ORDERED_MULTI");
    expect(gallery?.maxCount).toBeNull();
    for (const slot of editor.mediaSlots.filter((entry) => entry.key !== "gallery")) {
      expect(slot.cardinality, slot.key).toBe("SINGLE");
      expect(slot.maxCount, slot.key).toBe(1);
    }
  });

  it("every slot key names a position, so no person-bound exception is needed", () => {
    for (const slot of editor.mediaSlots) {
      expect(TEMPLATE_EDITOR_SLOT_KEY_FORBIDDEN_WORDS.test(slot.key), slot.key).toBe(false);
    }
    expect(Object.hasOwn(TEMPLATE_EDITOR_PERSON_BOUND_SLOT_EXCEPTIONS, editor.rendererKey)).toBe(false);
  });

  it("content items are only those whose renderer section is capable", () => {
    const capabilities = SE_DUYEN_V1_MANIFEST.compatibility.sectionCapabilities;
    expect(editor.contentItems.map((item) => item.key)).toStrictEqual([
      "COUPLE",
      "EVENTS",
      "FAMILIES",
      "INVITATION_MESSAGE",
      "LOVE_STORY",
      // SD-V1-02C1: the staff affordance for the track.
      "MUSIC",
    ]);
    for (const item of editor.contentItems) {
      if (item.sectionKey !== null) expect(capabilities[item.sectionKey], item.key).toBe(true);
    }
    // Only COUPLE and EVENTS may be REQUIRED (TE-01 T10); nothing else is.
    expect(editor.contentItems.filter((item) => item.requirement === "REQUIRED").map((item) => item.key)).toStrictEqual([
      "COUPLE",
      "EVENTS",
    ]);
  });

  it("the manifest does NOT enforce the Product Owner's one-photo rule, and must not be read as if it did", () => {
    // TE-01 T10: every slot minCount is 0 and no media slot may be REQUIRED,
    // so a Project with no photograph at all passes everything expressed here.
    for (const slot of editor.mediaSlots) {
      expect(slot.minCount, slot.key).toBe(0);
      expect(slot.requirement === "RECOMMENDED" || slot.requirement === "OPTIONAL", slot.key).toBe(true);
    }
    // The strongest available signal is a readiness nudge on the opening photo.
    const opening = editor.mediaSlots.find((slot) => slot.key === "openingPhoto");
    expect(opening?.requirement).toBe("RECOMMENDED");
    expect(opening?.recommendedCount).toBe(1);
  });

  it("SD-V1-02B2: the gallery capability is real, so the editor manifest now cross-validates", () => {
    expect(SE_DUYEN_V1_MANIFEST.compatibility.sectionCapabilities.gallery).toBe(true);
    const validated = validateProductionEditorManifests([SE_DUYEN_V1_EDITOR_MANIFEST], [SE_DUYEN_V1_MANIFEST]);
    expect(validated.map((manifest) => manifest.rendererKey)).toStrictEqual(["wedding.se-duyen.v1"]);
    // Every section-linked slot and item now names a capable section.
    const capabilities = SE_DUYEN_V1_MANIFEST.compatibility.sectionCapabilities;
    for (const slot of SE_DUYEN_V1_EDITOR_MANIFEST.mediaSlots) {
      if (slot.sectionKey !== null) expect(capabilities[slot.sectionKey], slot.key).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// H. Album and its viewer (SD-V1-02B2)
// ---------------------------------------------------------------------------

describe("H. album", () => {
  const ALBUM = COPY.gallery;

  /** `--sdp-album<Frame>-image` urls in the markup, in document order. */
  function albumUrls(html: string): string[] {
    return [...html.matchAll(/--sdp-(album[A-Za-z]+)-image:url\(&quot;([^&]+)&quot;\)/g)].map(
      (match) => `${match[1] as string}=${match[2] as string}`,
    );
  }

  function galleryUrls(fixture: RendererFixture): string[] {
    return (fixture.viewModel.media.templateSlots?.gallery ?? []).map((item) =>
      item.status === "RESOLVED" ? item.url : `UNAVAILABLE:${item.mediaId}`,
    );
  }

  it("four photographs fill the four approved frames in the customer's own order", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON" });
    const urls = galleryUrls(fixture);
    expect(urls).toHaveLength(4);
    expect(albumUrls(html)).toStrictEqual([
      `albumLead=${urls[0] as string}`,
      `albumTall=${urls[1] as string}`,
      `albumSmall=${urls[2] as string}`,
      `albumFoot=${urls[3] as string}`,
    ]);
    expect(html).toContain(ALBUM.heading);
    expect(html).toContain('aria-labelledby="sd-album-heading"');
  });

  it("no photograph is repeated, and the album never borrows another frame's photo", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON" });
    const urls = albumUrls(html).map((entry) => entry.split("=")[1] as string);
    expect(new Set(urls).size).toBe(urls.length);
    // The four SINGLE slots' photographs are not among them.
    for (const slotKey of ["openingPhoto", "portraitLead", "portraitAside", "closingPhoto"] as const) {
      const single = fixture.viewModel.media.templateSlots?.[slotKey]?.[0];
      if (single?.status === "RESOLVED") expect(urls, slotKey).not.toContain(single.url);
    }
  });

  it("one photograph draws one frame, and the pair is centred on its own", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", slots: { gallery: [PHOTO.G1] } });
    expect(albumUrls(html)).toStrictEqual([`albumLead=${galleryUrls(fixture)[0] as string}`]);
    expect(html).not.toContain("--sdp-albumTall-image");
    expect(html).not.toContain("albumPair");
    // One photograph is not navigable: no stepping controls at all.
    expect(html).not.toContain("lightboxPrev");
    expect(html).not.toContain("lightboxNext");
  });

  it("two photographs draw the lead and one of the pair, which is then the solo composition", async () => {
    const { html } = await renderSd({ variant: "COMMON", slots: { gallery: [PHOTO.G1, PHOTO.G2] } });
    expect(albumUrls(html)).toHaveLength(2);
    expect(html).toContain("albumPairSolo");
    expect(html).not.toContain("--sdp-albumSmall-image");
  });

  it("an empty gallery hides the whole section", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", slots: {} });
    expect(fixture.viewModel.media.templateSlots?.gallery).toStrictEqual([]);
    expect(html).not.toContain("sd-album-heading");
    expect(html).not.toContain(ALBUM.heading);
    expect(albumUrls(html)).toStrictEqual([]);
    // And no viewer is mounted for an album that does not exist.
    expect(html).not.toContain("<dialog");
  });

  it("switching the gallery section off hides it even with photographs assigned", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", sectionSettings: { gallery: false } });
    expect(fixture.selection.effectiveSections.gallery).toBe(false);
    expect(html).not.toContain("sd-album-heading");
    expect(albumUrls(html)).toStrictEqual([]);
  });

  it("an UNAVAILABLE photograph is skipped and the frames close up: never a blank frame", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", unavailableMediaIds: [PHOTO.G2] });
    const slot = fixture.viewModel.media.templateSlots?.gallery ?? [];
    expect(slot[1]?.status).toBe("UNAVAILABLE");
    // Three photographs remain, in order, and they fill the first three frames.
    const resolved = slot.filter((item) => item.status === "RESOLVED").map((item) => (item as { url: string }).url);
    expect(albumUrls(html)).toStrictEqual([
      `albumLead=${resolved[0] as string}`,
      `albumTall=${resolved[1] as string}`,
      `albumSmall=${resolved[2] as string}`,
    ]);
    expect(html).not.toContain("--sdp-albumFoot-image");
  });

  it("the slot is unbounded: a fifth photograph is simply not drawn, and none is dropped from the order", async () => {
    const { html, fixture } = await renderSd({
      variant: "COMMON",
      slots: { gallery: [...ALBUM_IDS, PHOTO.G5] },
    });
    expect(fixture.viewModel.media.templateSlots?.gallery).toHaveLength(5);
    const urls = galleryUrls(fixture);
    expect(albumUrls(html).map((entry) => entry.split("=")[1] as string)).toStrictEqual(urls.slice(0, 4));
    expect(html).not.toContain(urls[4] as string);
  });

  it("every frame carrying a photograph is itself the control that opens it", async () => {
    const { html } = await renderSd({ variant: "COMMON" });
    // One box button plus one button per drawn frame, and the viewer's three.
    expect(count(html, 'aria-haspopup="dialog"')).toBe(4);
    for (const position of [1, 2, 3, 4]) {
      expect(html, `frame ${String(position)}`).toContain(
        `aria-label="${ALBUM.open}: ${ALBUM.imageAlt} ${String(position)} ${ALBUM.of} 4"`,
      );
    }
    expect(count(html, "photoButton")).toBe(4);
  });

  it("the viewer is a native modal dialog with an accessible name", async () => {
    const { html } = await renderSd({ variant: "COMMON" });
    expect(html).toMatch(/<dialog class="[^"]*_lightbox_[^"]*" aria-label="/);
    expect(html).toContain(`aria-label="${ALBUM.viewerLabel}"`);
    // Closed in server markup: nothing is shown over an unopened invitation.
    expect(html).not.toContain("<dialog open");
  });

  it("the pure frame assignment takes the first four RESOLVED photographs, in order", () => {
    const resolved = (id: string) => ({ status: "RESOLVED" as const, mediaId: id, url: `u:${id}`, width: null, height: null });
    const unavailable = (id: string) => ({ status: "UNAVAILABLE" as const, mediaId: id });

    expect(albumPhotos([])).toStrictEqual([]);
    expect(albumPhotos([unavailable("a"), unavailable("b")])).toStrictEqual([]);
    expect(albumPhotos([resolved("a")]).map((photo) => [photo.frame, photo.position, photo.media.mediaId])).toStrictEqual([
      ["albumLead", 1, "a"],
    ]);
    // The UNAVAILABLE one is skipped, not counted, and the rest close up.
    expect(
      albumPhotos([resolved("a"), unavailable("x"), resolved("b"), resolved("c"), resolved("d"), resolved("e")]).map(
        (photo) => [photo.frame, photo.position, photo.media.mediaId],
      ),
    ).toStrictEqual([
      ["albumLead", 1, "a"],
      ["albumTall", 2, "b"],
      ["albumSmall", 3, "c"],
      ["albumFoot", 4, "d"],
    ]);
    expect(SE_DUYEN_ALBUM_FRAMES).toStrictEqual(["albumLead", "albumTall", "albumSmall", "albumFoot"]);
  });

  it("stepping through the album wraps both ways", () => {
    expect(stepAlbum(0, 1, 4)).toBe(1);
    expect(stepAlbum(3, 1, 4)).toBe(0);
    expect(stepAlbum(0, -1, 4)).toBe(3);
    expect(stepAlbum(2, -1, 4)).toBe(1);
    // A single photograph has nowhere to step.
    expect(stepAlbum(0, 1, 1)).toBe(0);
    expect(stepAlbum(0, -1, 1)).toBe(0);
  });

  it("alt text numbers the photograph by its position in the album", () => {
    expect(albumAlt(1)).toBe(`${ALBUM.imageAlt} 1`);
    expect(albumAlt(4)).toBe(`${ALBUM.imageAlt} 4`);
  });

  it("the album comes from the slot, never from the legacy gallery role", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", galleryCount: 3 });
    // The fixture asks for legacy GALLERY rows; a TEMPLATE_SLOTS Snapshot
    // carries none, so the album can only be the slot's own photographs.
    expect(fixture.viewModel.media.gallery).toStrictEqual([]);
    expect(albumUrls(html)).toHaveLength(4);
    for (const entry of albumUrls(html)) expect(galleryUrls(fixture)).toContain(entry.split("=")[1] as string);
  });
});

// ---------------------------------------------------------------------------
// I. Run-of-show / timeline (SD-V1-02B3A)
// ---------------------------------------------------------------------------

describe("I. timeline", () => {
  const FLOW = COPY.timeline;

  /** The timeline section's markup only. */
  function flowOf(html: string): string {
    const start = html.indexOf('aria-labelledby="sd-flow-heading"');
    expect(start).toBeGreaterThan(0);
    return html.slice(start, html.indexOf("</section>", start));
  }

  /** Each step as `HH:mm|label`, in document order. */
  function steps(html: string): string[] {
    return [...flowOf(html).matchAll(/<time dateTime="([^"]+)">[^<]*<\/time><\/p><h3[^>]*>([^<]+)</g)].map(
      (match) => `${match[1] as string}|${match[2] as string}`,
    );
  }

  it("renders every configured milestone, in the builder's order, with its own hour and wording", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", timeline: "PRESENT" });
    const items = fixture.viewModel.content.timeline;
    expect(items.length).toBeGreaterThan(0);
    // The fixture supplies the rows out of order on purpose; the Snapshot
    // builder orders them and the renderer prints them exactly as given.
    expect(steps(html)).toStrictEqual(items.map((item) => `${item.time}|${item.label}`));
    expect(html).toContain(FLOW.heading);
    expect(html).toContain(FLOW.eyebrow);
  });

  it("the hour is the canonical HH:mm text, never reformatted or re-derived", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", timeline: "PRESENT" });
    const flow = flowOf(html);
    for (const item of fixture.viewModel.content.timeline) {
      expect(item.time, item.label).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      // Printed, and carried in `dateTime`, as the one stored value.
      expect(flow, item.label).toContain(`<time dateTime="${item.time}">${item.time}</time>`);
    }
  });

  it("no timeline hour is synchronised with the ceremony or either reception", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", timeline: "PRESENT" });
    const ceremonyTime = deriveEventDateTimePresentationV1(fixture.viewModel.ceremony).time;
    const matching = fixture.viewModel.content.timeline.filter((item) => item.time === ceremonyTime);
    // The fixture deliberately has a step at the ceremony's own hour.
    expect(matching.length).toBeGreaterThan(0);
    const flow = flowOf(html);
    // It gets no mark, no rite title and no special knot: a timeline hour and
    // an invitation hour are independent by Product Owner rule.
    expect(flow).not.toContain("flowStepRite");
    expect(flow).not.toContain("flowRiteMark");
    expect(flow).not.toContain(fixture.viewModel.ceremony.title);
    // It is printed with the customer's own wording, like every other step.
    for (const item of matching) expect(flow, item.label).toContain(item.label);
  });

  it("the step wording is the customer's own, never replaced by a template note", async () => {
    const { html } = await renderSd({ variant: "COMMON", timeline: "PRESENT" });
    const flow = flowOf(html);
    // The prototype's hard-coded per-step notes are not part of the contract.
    expect(flow).not.toContain("flowNote");
    expect(flow).not.toContain("Nghi thức chính của ngày vui");
    // Nor is the prototype's "these hours are illustrative" badge.
    expect(flow).not.toContain("flowBadge");
    expect(flow).not.toContain("minh hoạ");
  });

  it("an empty timeline omits the section entirely", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", timeline: "ABSENT" });
    expect(fixture.viewModel.content.timeline).toStrictEqual([]);
    expect(fixture.selection.effectiveSections.timeline).toBe(false);
    expect(html).not.toContain("sd-flow-heading");
    expect(html).not.toContain(FLOW.heading);
  });

  it("switching the timeline section off hides it even with milestones configured", async () => {
    const { html, fixture } = await renderSd({
      variant: "COMMON",
      timeline: "PRESENT",
      sectionSettings: { timeline: false },
    });
    expect(fixture.viewModel.content.timeline.length).toBeGreaterThan(0);
    expect(fixture.selection.effectiveSections.timeline).toBe(false);
    expect(html).not.toContain("sd-flow-heading");
  });

  it.each(VARIANTS)("%s shows the same run-of-show: it carries no variant rule of its own", async (variant) => {
    const { html, fixture } = await renderSd({ variant, timeline: "PRESENT" });
    expect(steps(html), variant).toStrictEqual(fixture.viewModel.content.timeline.map((item) => `${item.time}|${item.label}`));
  });

  it("the run-of-show sits between the ceremony and the album", async () => {
    const { html } = await renderSd({ variant: "COMMON", timeline: "PRESENT" });
    expect(html.indexOf("sd-rite-title")).toBeLessThan(html.indexOf("sd-flow-heading"));
    expect(html.indexOf("sd-flow-heading")).toBeLessThan(html.indexOf("sd-album-heading"));
  });

  it("the ordered list is a real list, and the ornaments are hidden from assistive technology", async () => {
    const { html } = await renderSd({ variant: "COMMON", timeline: "PRESENT" });
    const flow = flowOf(html);
    expect(flow).toMatch(/<ol class="[^"]*_flowList_/);
    expect(flow).toMatch(/<li class="[^"]*_flowStep_/);
    expect(flow).toMatch(/_flowWatermark_[^"]*" aria-hidden="true"/);
    expect(flow).toMatch(/_flowRule_[^"]*" aria-hidden="true"/);
  });
});

// ---------------------------------------------------------------------------
// J. Countdown (SD-V1-02B3B)
// ---------------------------------------------------------------------------

describe("J. countdown", () => {
  const CD = COPY.countdown;
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  /** The countdown section's markup only. */
  function cdOf(html: string): string {
    const start = html.indexOf('aria-labelledby="sd-countdown-heading"');
    expect(start).toBeGreaterThan(0);
    return html.slice(start, html.indexOf("</section>", start));
  }

  /** Each dial as `label|value`, in document order. */
  function dials(html: string): string[] {
    return [...cdOf(html).matchAll(/<dt[^>]*>([^<]+)<\/dt><dd[^>]*>([^<]+)</g)].map(
      (match) => `${match[1] as string}|${match[2] as string}`,
    );
  }

  async function ceremonyEpochMs(): Promise<number> {
    const fixture = await sdFixture({ variant: "COMMON" });
    return Date.parse(fixture.viewModel.ceremony.startsAt);
  }

  it("is absent without a clock, so no current time enters server markup", async () => {
    const { html } = await renderSd({ variant: "COMMON" });
    expect(html).not.toContain("sd-countdown-heading");
    expect(html).not.toContain(CD.heading);
  });

  it("a future ceremony shows the four approved dials, days unpadded and the rest to two digits", async () => {
    const target = await ceremonyEpochMs();
    const { html } = await renderSdWithClock({ variant: "COMMON" }, target - (3 * DAY + 4 * HOUR + 5 * MINUTE + 6 * SECOND));
    expect(dials(html)).toStrictEqual([
      `${CD.units.days}|3`,
      `${CD.units.hours}|04`,
      `${CD.units.minutes}|05`,
      `${CD.units.seconds}|06`,
    ]);
    expect(html).toContain('data-countdown="upcoming"');
    expect(html).toContain(CD.heading);
    expect(cdOf(html)).not.toContain(CD.arrived);
  });

  it("the days are left as they fall, however many there are", async () => {
    const target = await ceremonyEpochMs();
    const parts = countdownDials({ startsAt: new Date(target).toISOString(), timezone: "Asia/Ho_Chi_Minh", lunarDateDisplay: null, eventId: "x", occasionType: "THANH_HON", title: "Lễ Thành Hôn" }, { nowEpochMs: target - 123 * DAY });
    expect(parts?.[0]).toStrictEqual({ unit: "days", value: "123" });
  });

  it("the exact moment the ceremony is reached shows the arrival line, not a row of zeroes", async () => {
    const target = await ceremonyEpochMs();
    const { html } = await renderSdWithClock({ variant: "COMMON" }, target);
    expect(cdOf(html)).toContain(CD.arrived);
    expect(html).toContain('data-countdown="passed"');
    expect(dials(html)).toStrictEqual([]);
  });

  it("a past ceremony shows the same arrival line", async () => {
    const target = await ceremonyEpochMs();
    const { html } = await renderSdWithClock({ variant: "COMMON" }, target + 400 * DAY);
    expect(cdOf(html)).toContain(CD.arrived);
    expect(html).toContain('data-countdown="passed"');
    expect(dials(html)).toStrictEqual([]);
  });

  it("one second before the ceremony still counts, so the boundary is not off by one", async () => {
    const target = await ceremonyEpochMs();
    const { html } = await renderSdWithClock({ variant: "COMMON" }, target - SECOND);
    expect(dials(html)).toStrictEqual([
      `${CD.units.days}|0`,
      `${CD.units.hours}|00`,
      `${CD.units.minutes}|00`,
      `${CD.units.seconds}|01`,
    ]);
  });

  it("counts to the one canonical instant, whatever the event timezone", async () => {
    const target = await ceremonyEpochMs();
    const nowEpochMs = target - 2 * DAY;
    // The derivation is absolute-duration arithmetic on the canonical
    // instant, so the stored timezone cannot shift the remaining time.
    for (const timezone of ["Asia/Ho_Chi_Minh", "UTC", "America/New_York"]) {
      const parts = countdownDials(
        { startsAt: new Date(target).toISOString(), timezone, lunarDateDisplay: null, eventId: "x", occasionType: "THANH_HON", title: "Lễ Thành Hôn" },
        { nowEpochMs },
      );
      expect(parts, timezone).toStrictEqual([
        { unit: "days", value: "2" },
        { unit: "hours", value: "00" },
        { unit: "minutes", value: "00" },
        { unit: "seconds", value: "00" },
      ]);
    }
  });

  it("the dials are label-then-value pairs in a named live region, with the ornaments hidden", async () => {
    const target = await ceremonyEpochMs();
    const { html } = await renderSdWithClock({ variant: "COMMON" }, target - DAY);
    const cd = cdOf(html);
    expect(cd).toMatch(/<dl class="[^"]*_countdownDials_[^"]*" role="timer" aria-label="/);
    expect(cd).toContain(`aria-label="${CD.label}"`);
    expect(cd).toMatch(/<dt class="[^"]*_countdownDialLabel_/);
    expect(cd).toMatch(/_countdownGlow_[^"]*" aria-hidden="true"/);
    expect(cd).toMatch(/_countdownThread_[^"]*" aria-hidden="true"/);
    expect(SE_DUYEN_COUNTDOWN_UNITS).toStrictEqual(["days", "hours", "minutes", "seconds"]);
  });

  it("sits between the run-of-show and the album, and carries no variant rule", async () => {
    for (const variant of VARIANTS) {
      // Each variant resolves its own rite, so the target instant differs.
      const own = await sdFixture({ variant });
      const target = Date.parse(own.viewModel.ceremony.startsAt);
      const { html } = await renderSdWithClock({ variant, timeline: "PRESENT" }, target - 5 * DAY);
      expect(html.indexOf("sd-flow-heading"), variant).toBeLessThan(html.indexOf("sd-countdown-heading"));
      expect(html.indexOf("sd-countdown-heading"), variant).toBeLessThan(html.indexOf("sd-album-heading"));
      expect(dials(html), variant).toStrictEqual([
        `${CD.units.days}|5`,
        `${CD.units.hours}|00`,
        `${CD.units.minutes}|00`,
        `${CD.units.seconds}|00`,
      ]);
    }
  });

  it("the countdown section declares no motion at all, so reduced motion needs no rule", () => {
    // Comments are stripped first, because the section's own provenance note
    // talks about motion; only real declarations are checked.
    const rules = readFileSync(join(__dirname, "..", "se-duyen-v1.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const region = rules.slice(rules.indexOf(".countdown {"), rules.indexOf(".album {"));
    expect(region).toContain(".countdownDials");
    expect(/animation|transition/.test(region)).toBe(false);
  });

  it("the island owns no timer and reads no clock of its own", () => {
    const code = readFileSync(join(__dirname, "..", "interactive", "countdown.tsx"), "utf8");
    expect(/setInterval|setTimeout|requestAnimationFrame|Date\.now|new Date\b/.test(code)).toBe(false);
    expect(code).toContain("deriveCeremonyCountdownV1");
  });
});

// ---------------------------------------------------------------------------
// K. Music control (SD-V1-02C1)
// ---------------------------------------------------------------------------

describe("K. music", () => {
  const MUSIC = COPY.music;

  /** The disc's own attributes. */
  function disc(html: string): string {
    const start = html.indexOf("musicButton");
    expect(start).toBeGreaterThan(0);
    return html.slice(html.lastIndexOf("<button", start), html.indexOf("</button>", start));
  }

  it("is hidden entirely when the host built no music capability", async () => {
    const { html } = await renderSd({ variant: "COMMON" });
    expect(html).not.toContain("musicButton");
    expect(html).not.toContain(MUSIC.play);
    // Not a disabled disc, not a placeholder: no control at all.
    expect(html).not.toContain("musicIcon");
  });

  it("appears with the invitation, inside the interior, never over the box on the cover", async () => {
    const { html } = await renderSdWithMusic({ variant: "COMMON" }, stubMusic("PAUSED"));
    const interior = html.indexOf("_interior_");
    expect(interior).toBeGreaterThan(0);
    // The disc is inside the interior, which the opening holds back until the
    // box has been opened; the cover and the box come before it.
    expect(html.indexOf("musicButton")).toBeGreaterThan(interior);
    expect(html.indexOf("boxButton")).toBeLessThan(interior);
  });

  it("a paused capability shows the play label and is not pressed", async () => {
    const { html } = await renderSdWithMusic({ variant: "COMMON" }, stubMusic("PAUSED"));
    const button = disc(html);
    expect(button).toContain(`aria-label="${MUSIC.play}"`);
    expect(button).toContain('aria-pressed="false"');
    expect(button).toContain('data-music-status="paused"');
    expect(button).toContain("♪");
  });

  it("only a PLAYING status is shown as playing", async () => {
    const playing = await renderSdWithMusic({ variant: "COMMON" }, stubMusic("PLAYING"));
    const button = disc(playing.html);
    expect(button).toContain(`aria-label="${MUSIC.pause}"`);
    expect(button).toContain('aria-pressed="true"');
    expect(button).toContain("♫");
    expect(playing.html).toContain("musicButtonActive");

    // Every other status, including the two failure ones, is NOT playing.
    for (const status of ["PAUSED", "BLOCKED", "ERROR"] as const) {
      const other = await renderSdWithMusic({ variant: "COMMON" }, stubMusic(status));
      const otherButton = disc(other.html);
      expect(otherButton, status).toContain('aria-pressed="false"');
      expect(otherButton, status).toContain(`aria-label="${MUSIC.play}"`);
      expect(otherButton, status).toContain(`data-music-status="${status.toLowerCase()}"`);
      expect(other.html, status).not.toContain("musicButtonActive");
    }
  });

  it("nothing plays on render: the capability is never commanded without a tap", async () => {
    const music = stubMusic("PAUSED");
    await renderSdWithMusic({ variant: "COMMON" }, music);
    expect(music.calls).toStrictEqual([]);
  });

  it("the failure note stays silent until an explicit tap, then reports blocked, errored or faulted", () => {
    // Before any tap there is nothing to report, whatever the status says.
    for (const status of ["PAUSED", "PLAYING", "BLOCKED", "ERROR"] as const) {
      expect(musicFailureVisible(status, false, false), status).toBe(false);
    }
    // After a tap, the two failure statuses and a faulted command report.
    expect(musicFailureVisible("BLOCKED", true, false)).toBe(true);
    expect(musicFailureVisible("ERROR", true, false)).toBe(true);
    expect(musicFailureVisible("PAUSED", true, true)).toBe(true);
    // A tap that simply paused the track is not a failure.
    expect(musicFailureVisible("PAUSED", true, false)).toBe(false);
    expect(musicFailureVisible("PLAYING", true, false)).toBe(false);
  });

  it("the live region is mounted but silent in server markup, so nothing claims a fault", async () => {
    const { html } = await renderSdWithMusic({ variant: "COMMON" }, stubMusic("BLOCKED"));
    expect(html).toMatch(/<p class="[^"]*_srOnly_[^"]*" role="status">/);
    expect(html).not.toContain(MUSIC.failed);
    expect(html).not.toContain("musicNote");
  });

  it("the island holds no player, no audio element and no timer of its own", () => {
    const code = readFileSync(join(__dirname, "..", "interactive", "music-control.tsx"), "utf8");
    expect(/\bnew Audio\b|HTMLAudioElement|<audio|createMusicController|\.src\s*=/.test(code)).toBe(false);
    expect(/setInterval|setTimeout|requestAnimationFrame/.test(code)).toBe(false);
    // Playback goes through the one shared command model.
    expect(code).toContain("runMusicToggle");
  });

  it("the disc's pulse is the only motion, and it is removed under reduced motion", () => {
    const rules = readFileSync(join(__dirname, "..", "se-duyen-v1.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).toContain("animation: sdp-music-pulse");
    const reduce = rules.slice(rules.indexOf("@media (prefers-reduced-motion: reduce)", rules.indexOf("sdp-music-pulse")));
    expect(reduce).toMatch(/\.musicButtonActive \.musicIcon \{\s*animation: none;/);
  });

  it("the editor manifest offers the track, and says it does not autoplay", () => {
    const item = SE_DUYEN_V1_EDITOR_MANIFEST.contentItems.find((entry) => entry.key === "MUSIC");
    expect(item?.sectionKey).toBe("music");
    expect(item?.requirement).toBe("OPTIONAL");
    expect(item?.hint).toContain("Không tự phát");
    expect(SE_DUYEN_V1_MANIFEST.compatibility.sectionCapabilities.music).toBe(true);
  });
});
