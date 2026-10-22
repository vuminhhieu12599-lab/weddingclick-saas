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
import type { BuildSnapshotPayloadInput } from "../../../../../lib/invitation-rendering/snapshot-payload-types";
import { createFixtureMediaResolver } from "../../../../core/fixtures/fixture-media-resolver";
import { runRendererFixturePipeline, type RendererFixture } from "../../../../core/fixtures/renderer-fixture-pipeline";
import {
  FIXTURE_GUESTS,
  buildRendererFixtureSourceInput,
  type RendererFixtureSourceOptions,
} from "../../../../core/fixtures/renderer-fixture-sources";
import {
  createProductionCompatibilityRegistry,
  type ProductionCompatibilityRegistryV1,
} from "../../../../core/production-renderer-manifests";
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
}

function sdSource(options: RendererFixtureSourceOptions, invitationMessage: string | null | undefined): BuildSnapshotPayloadInput {
  const input = buildRendererFixtureSourceInput(options);
  const { design, compatibility } = SE_DUYEN_V1_MANIFEST;
  const details = input.weddingDetails as NonNullable<BuildSnapshotPayloadInput["weddingDetails"]>;
  return {
    ...input,
    ...(invitationMessage === undefined ? {} : { weddingDetails: { ...details, invitationMessage } }),
    design: {
      ...input.design,
      paletteKey: design.palettes[0] as string,
      fontPresetKey: design.fontPresets[0] as string,
      effectPresetKey: design.effectPresets[0] as string,
    },
    templateVersion: { ...input.templateVersion, rendererKey: compatibility.rendererKey },
  };
}

async function sdFixture(options: SdOptions): Promise<RendererFixture> {
  const { guest, invitationMessage, unavailableMediaIds, ...sourceOptions } = options;
  return runRendererFixturePipeline(sdSource(sourceOptions, invitationMessage), {
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
  it("the opening photograph is the Project's resolved cover, painted on the card that grows", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON" });
    const cover = fixture.viewModel.media.cover;
    expect(cover?.status).toBe("RESOLVED");
    expect(html).toContain(`--sdp-hero-image:url(&quot;${(cover as { url: string }).url}&quot;)`);
    expect(count(html, "--sdp-hero-image")).toBe(1);
  });

  it("an UNAVAILABLE cover omits the frame: no broken image, no demo photograph, and the box still opens", async () => {
    const fixture = await sdFixture({ variant: "COMMON" });
    const coverId = (fixture.viewModel.media.cover as { mediaId: string }).mediaId;
    const { html, fixture: degraded } = await renderSd({ variant: "COMMON", unavailableMediaIds: [coverId] });
    expect(degraded.viewModel.media.cover?.status).toBe("UNAVAILABLE");
    expect(html).not.toContain("--sdp-hero-image");
    expect(html).not.toContain("photoSlot");
    // The control and the sequence are untouched.
    expect(html).toContain("boxButton");
    expect(html).toContain("openingClock");
  });

  it("the couple frame uses the love-story photo when there is one, and is omitted when there is not", async () => {
    const withPhoto = await renderSd({ variant: "COMMON", loveStoryPhoto: "PRESENT" });
    const photo = withPhoto.fixture.viewModel.media.loveStoryPhoto;
    expect(photo?.status).toBe("RESOLVED");
    expect(withPhoto.html).toContain(`--sdp-coupleMain-image:url(&quot;${(photo as { url: string }).url}&quot;)`);

    const without = await renderSd({ variant: "COMMON", loveStoryPhoto: "ABSENT" });
    expect(without.fixture.viewModel.media.loveStoryPhoto).toBeUndefined();
    expect(without.html).not.toContain("--sdp-coupleMain-image");
  });

  it("no gallery, QR, audio or portrait media is ever reached by this slice", async () => {
    const { html, fixture } = await renderSd({ variant: "COMMON", galleryCount: 3, portraits: "PRESENT" });
    const slots: readonly (MediaResolution | undefined)[] = [
      ...fixture.viewModel.media.gallery,
      fixture.viewModel.media.portrait.groom,
      fixture.viewModel.media.portrait.bride,
      fixture.viewModel.media.qr.groom,
      fixture.viewModel.media.qr.bride,
      fixture.viewModel.media.audio,
    ];
    const unreached = slots.filter((item): item is ResolvedMedia => item?.status === "RESOLVED");
    expect(unreached.length).toBeGreaterThan(0);
    for (const item of unreached) expect(html, item.url).not.toContain(item.url);
  });

  it("every decorative URL in the markup is this renderer's own immutable path", async () => {
    const { html } = await renderSd({ variant: "COMMON", loveStoryPhoto: "PRESENT" });
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
