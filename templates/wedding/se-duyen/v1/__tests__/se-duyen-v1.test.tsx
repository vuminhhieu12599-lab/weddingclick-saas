import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InvitationVariant } from "../../../../../lib/domain";
import { deriveEventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type {
  InvitationViewModel,
  MediaResolution,
  ResolvedMedia,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { InvitationRendererCapabilitiesV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
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
import {
  PRODUCTION_EDITOR_MANIFEST_ERROR_MESSAGES,
  validateProductionEditorManifests,
} from "../../../../core/production-editor-manifests";
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

/** Fixture PHOTO ids for the four SINGLE slots; distinct, so a repeat is visible. */
const PHOTO = Object.freeze({
  OPENING: "00000000-0000-4000-8000-0000000007d1",
  LEAD: "00000000-0000-4000-8000-0000000007d2",
  ASIDE: "00000000-0000-4000-8000-0000000007d3",
  CLOSING: "00000000-0000-4000-8000-0000000007d4",
});

type SlotKey = "openingPhoto" | "portraitLead" | "portraitAside" | "closingPhoto";
type SlotAssignments = Partial<Record<SlotKey, readonly string[]>>;

const ALL_SLOTS: SlotAssignments = Object.freeze({
  openingPhoto: [PHOTO.OPENING],
  portraitLead: [PHOTO.LEAD],
  portraitAside: [PHOTO.ASIDE],
  closingPhoto: [PHOTO.CLOSING],
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

  it("the sections SD-V1-01 cannot render are never effective, whatever the staff settings say", async () => {
    const fixture = await sdFixture({
      variant: "COMMON",
      sectionSettings: { gallery: true, music: true, gift: true, timeline: true },
    });
    const effective = fixture.selection.effectiveSections;
    for (const key of ["gallery", "music", "gift", "timeline", "dressCode", "photoStory"] as const) {
      expect(effective[key], key).toBe(false);
    }
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
  /** Every `--sdp-<stem>-image` url in the markup, in document order. */
  function frameUrls(html: string): string[] {
    return [...html.matchAll(/--sdp-([A-Za-z]+)-image:url\(&quot;([^&]+)&quot;\)/g)].map(
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
    for (const slotKey of ["openingPhoto", "portraitLead", "portraitAside", "closingPhoto"] as const) {
      expect(fixture.viewModel.media.templateSlots?.[slotKey], slotKey).toStrictEqual([]);
    }
    expect(frameUrls(html)).toStrictEqual([]);
    for (const heading of ["sd-invite-title", "sd-couple-heading", "sd-houses-heading", "sd-rite-title", "sd-closing-eyebrow"]) {
      expect(html, heading).toContain(heading);
    }
  });

  it("no legacy media role is read: not cover, love-story, portrait, gallery, QR or audio", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", galleryCount: 3, portraits: "PRESENT", loveStoryPhoto: "PRESENT" });
    const { media } = fixture.viewModel;
    const legacy: readonly (MediaResolution | undefined)[] = [
      media.cover,
      media.loveStoryPhoto,
      ...media.gallery,
      ...media.photoStory,
      media.portrait.groom,
      media.portrait.bride,
      media.qr.groom,
      media.qr.bride,
      media.audio,
    ];
    const resolved = legacy.filter((item): item is ResolvedMedia => item?.status === "RESOLVED");
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

  it("the box itself is the only control, and it carries an accessible name", async () => {
    const { html } = await renderSd({ variant: "COMMON" });
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

  it("registration is still gated: the gallery slot names a section this renderer is not capable of", () => {
    expect(SE_DUYEN_V1_MANIFEST.compatibility.sectionCapabilities.gallery).toBe(false);
    expect(() => validateProductionEditorManifests([SE_DUYEN_V1_EDITOR_MANIFEST], [SE_DUYEN_V1_MANIFEST])).toThrow(
      PRODUCTION_EDITOR_MANIFEST_ERROR_MESSAGES.SLOT_SECTION_NOT_CAPABLE,
    );
  });
});
