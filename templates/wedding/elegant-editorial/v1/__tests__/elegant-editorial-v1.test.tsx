import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS, type InvitationVariant } from "../../../../../lib/domain";
import type { InvitationRendererCapabilitiesV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { RendererEffectiveSections } from "../../../../../lib/invitation-rendering/renderer-selection";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { BuildSnapshotPayloadInput } from "../../../../../lib/invitation-rendering/snapshot-payload-types";
import { deriveCeremonyMonthGridV1 } from "../../../../../lib/invitation-rendering/ceremony-month-grid";
import { createFixtureMediaResolver, fixtureMediaUrl } from "../../../../core/fixtures/fixture-media-resolver";
import {
  buildRendererFixture,
  runRendererFixturePipeline,
  type RendererFixtureOptions,
} from "../../../../core/fixtures/renderer-fixture-pipeline";
import {
  FIXTURE_GUESTS,
  FIXTURE_MEDIA_IDS,
  buildRendererFixtureSourceInput,
  FIXTURE_PHOTO_STORY_IDS,
} from "../../../../core/fixtures/renderer-fixture-sources";
import { formatCoupleDisplayName } from "../sections/display-name";

// next/font loaders only run under the Next compiler; the real configuration
// is proven by `npm run build` and by the source test in fonts-palette-copy.
vi.mock("../fonts", () => ({ ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables" }));

const { ElegantEditorialV1 } = await import("../elegant-editorial-v1");
const { Calendar } = await import("../sections/calendar");
const { ELEGANT_EDITORIAL_V1_COPY: COPY } = await import("../copy");

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

interface Rendered {
  html: string;
  viewModel: InvitationViewModel;
  sections: RendererEffectiveSections;
}

function render(viewModel: InvitationViewModel, sections: RendererEffectiveSections): string {
  return renderToStaticMarkup(<ElegantEditorialV1 viewModel={viewModel} sections={sections} capabilities={EMPTY} />);
}

async function renderFixture(options: RendererFixtureOptions): Promise<Rendered> {
  const { viewModel, selection } = await buildRendererFixture(options);
  return { html: render(viewModel, selection.effectiveSections), viewModel, sections: selection.effectiveSections };
}

async function renderSource(
  input: BuildSnapshotPayloadInput,
  unavailableMediaIds: readonly string[] = [],
): Promise<Rendered> {
  const { viewModel, selection } = await runRendererFixturePipeline(input, {
    resolver: createFixtureMediaResolver({ unavailableMediaIds }),
  });
  return { html: render(viewModel, selection.effectiveSections), viewModel, sections: selection.effectiveSections };
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/** The element text between an opening tag with `marker` and the next `</section>` / `</header>` / `</footer>`. */
/** The seal's vector 囍 engraving group: three stroke layers of paths/rects only. */
function sealMarkOf(envelope: string): string {
  const mark = envelope.match(
    /<g fill="none" stroke-width="6\.5" stroke-linecap="square" stroke-linejoin="miter" opacity="0\.9">(?:<g [^>]*>(?:<path [^>]*><\/path>|<rect [^>]*><\/rect>)+<\/g>){3}<\/g>/,
  )?.[0];
  expect(mark, "seal mark group").toBeDefined();
  return mark ?? "";
}

function block(html: string, marker: string): string {
  const start = html.indexOf(marker);
  expect(start, marker).toBeGreaterThanOrEqual(0);
  const rest = html.slice(start);
  const end = rest.search(/<\/(section|header|footer)>/);
  return end === -1 ? rest : rest.slice(0, end);
}

const ESCAPED_AMP = "&amp;";

describe("root structure and props", () => {
  it("renders one <main>, one <h1> with both names, and the renderer-scoped root", async () => {
    const { html, viewModel } = await renderFixture({ variant: "COMMON" });
    expect(count(html, "<main")).toBe(1);
    expect(count(html, "<h1")).toBe(1);
    const h1 = html.slice(html.indexOf("<h1"), html.indexOf("</h1>"));
    // Product Owner ruling: decorative names use the final two tokens of the canonical name.
    expect(h1).toContain(formatCoupleDisplayName(viewModel.people.primary.name));
    expect(h1).toContain(formatCoupleDisplayName(viewModel.people.secondary.name));
    expect(h1).not.toContain(viewModel.people.primary.name);
    expect(h1).not.toContain(viewModel.people.secondary.name);
    expect(html).toContain('data-renderer="elegant-editorial-v1"');
    expect(html).toContain("ee-test-font-variables");
  });

  it("applies the versioned green-ivory palette as root custom properties", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    expect(html).toMatch(/style="--ee-background:#faf7ef;--ee-surface:#fdfcf9;/);
    expect(html).toContain("--ee-accent:#47593f");
  });

  it("has meaningful h2 headings and h3 only below them", async () => {
    const { html } = await renderFixture({ variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL });
    for (const heading of [
      COPY.couple.heading,
      COPY.families.heading,
      "Lễ Thành Hôn",
      COPY.calendar.heading,
      COPY.events.heading,
      COPY.loveStory.heading,
      COPY.gift.heading,
      COPY.gallery.heading,
      COPY.closing.heading,
    ]) {
      expect(html).toContain(`>${heading.replaceAll("&", ESCAPED_AMP)}</h2>`);
    }
    expect(html.indexOf("<h3")).toBeGreaterThan(html.indexOf("<h2"));
  });

  // Design Baseline B5: implementation-chosen headings are accessible names
  // only; the ceremony title and the Task029 album kicker stay visible.
  it("section headings without a Task029 precedent are visually hidden accessible names", async () => {
    const { html } = await renderFixture({ variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL });
    for (const heading of [
      COPY.couple.heading,
      COPY.families.heading,
      COPY.calendar.heading,
      COPY.events.heading,
      COPY.loveStory.heading,
      COPY.gift.heading,
      COPY.closing.heading,
    ]) {
      expect(html, heading).toMatch(new RegExp(`<h2 id="ee-[a-z]+-heading" class="[^"]*srOnly[^"]*">${heading.replaceAll("&", ESCAPED_AMP)}</h2>`));
    }
    expect(html).toMatch(/<h2 id="ee-ceremony-heading" class="[^"]*ceremonyTitle[^"]*">Lễ Thành Hôn<\/h2>/);
    expect(html).toMatch(/<h2 id="ee-gallery-heading" class="[^"]*sectionKicker[^"]*">Album ảnh cưới<\/h2>/);
    expect(html).not.toContain("sectionHeading");
  });

  it("follows the frozen Design Baseline root order", async () => {
    const { html } = await renderFixture({ variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL });
    const markers = [
      "<header",
      'aria-label="Save the date"',
      "ee-couple-heading",
      "data-guest=",
      "ee-families-heading",
      "ee-ceremony-heading",
      "ee-calendar-heading",
      "ee-events-heading",
      "ornament-sparkle.svg",
      "ee-story-heading",
      "ee-gift-heading",
      "ee-gallery-heading",
      "ee-closing-heading",
    ];
    const positions = markers.map((marker) => html.indexOf(marker));
    expect(positions.every((position) => position >= 0), JSON.stringify(positions)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toStrictEqual(positions);
    // Events → ✦ → ✦: both ornaments close the events block, before the love story.
    expect(count(html, "ornament-sparkle.svg")).toBe(2);
    expect(html.lastIndexOf("ornament-sparkle.svg")).toBeLessThan(html.indexOf("ee-story-heading"));
  });

  // Micro-Checkpoint 10 Product Owner ruling: ceremony heading/date → Countdown → Calendar → cards.
  it("places the Countdown inside the ceremony band, after the ceremony heading and before the Calendar", async () => {
    for (const variant of INVITATION_VARIANTS) {
      const { viewModel, selection } = await buildRendererFixture({ variant });
      const html = renderToStaticMarkup(
        <ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={{ clock: { nowEpochMs: 0 } }} />,
      );
      const positions = ["ee-ceremony-heading", "ee-countdown-heading", "ee-calendar-heading", "ee-events-heading", 'data-tight="true"'].map(
        (marker) => html.indexOf(marker),
      );
      expect(positions.every((position) => position >= 0), `${variant} ${JSON.stringify(positions)}`).toBe(true);
      expect([...positions].sort((a, b) => a - b), variant).toStrictEqual(positions);
      expect(count(html, "ee-countdown-heading")).toBe(2);
    }
  });

  // RF-06B owns root placement of the capability-gated RSVP slot (the RF-06D
  // island test keeps only its gated rendering): Love Story < RSVP < Gift < Gallery < Closing.
  it("places the RSVP slot between Love Story and Gift when an RSVP capability is present", async () => {
    const rsvp: NonNullable<InvitationRendererCapabilitiesV1["rsvp"]> = { submit: async () => ({ status: "UNAVAILABLE" }) };
    for (const variant of INVITATION_VARIANTS) {
      const { viewModel, selection } = await buildRendererFixture({ variant, guest: FIXTURE_GUESTS.NORMAL });
      const html = renderToStaticMarkup(
        <ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={{ rsvp }} />,
      );
      const positions = ["ee-story-heading", "ee-rsvp-heading", "ee-gift-heading", "ee-gallery-heading", "ee-closing-heading"].map(
        (marker) => html.indexOf(marker),
      );
      expect(positions.every((position) => position >= 0), `${variant} ${JSON.stringify(positions)}`).toBe(true);
      expect([...positions].sort((a, b) => a - b), variant).toStrictEqual(positions);
    }
  });

  // RF-06D: the root now reads capabilities to gate its islands; two empty
  // capability objects still render identically (absence never means success).
  it("renders identical markup for EMPTY and a frozen empty copy", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "BRIDE" });
    const a = renderToStaticMarkup(
      <ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={EMPTY} />,
    );
    const b = renderToStaticMarkup(
      <ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={Object.freeze({})} />,
    );
    expect(a).toBe(b);
  });
});

describe("variants (Rule of Three)", () => {
  it("COMMON: groom first, both families, Lễ Thành Hôn, both gift sides", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    const couple = block(html, 'aria-labelledby="ee-couple-heading"');
    expect(couple.indexOf("Minh Khôi")).toBeGreaterThan(-1);
    expect(couple.indexOf("Minh Khôi")).toBeLessThan(couple.indexOf("Ngọc Hân"));
    expect(couple).not.toMatch(/Nguyễn Minh Khôi|Trần Ngọc Hân/);
    expect(couple).toContain(COPY.couple.roleBySide.GROOM);
    const families = block(html, 'aria-labelledby="ee-families-heading"');
    expect(families.indexOf(COPY.families.labelBySide.GROOM)).toBeLessThan(
      families.indexOf(COPY.families.labelBySide.BRIDE),
    );
    expect(families).toContain("Nguyễn Văn Đức");
    expect(families).toContain("Trần Quốc Việt");
    // COMMON shows every canonical event (including the bride-side Vu Quy event title); the ceremony is Thành Hôn.
    expect(html).toMatch(/id="ee-ceremony-heading"[^>]*>Lễ Thành Hôn<\/h2>/);
    const gift = block(html, 'aria-labelledby="ee-gift-heading"');
    expect(gift.indexOf('data-side="GROOM"')).toBeLessThan(gift.indexOf('data-side="BRIDE"'));
  });

  it("GROOM: groom primary, groom family first, Lễ Thành Hôn, groom gift side only", async () => {
    const { html } = await renderFixture({ variant: "GROOM" });
    const h1 = html.slice(html.indexOf("<h1"), html.indexOf("</h1>"));
    expect(h1.indexOf("Minh Khôi")).toBeGreaterThan(-1);
    expect(h1.indexOf("Minh Khôi")).toBeLessThan(h1.indexOf("Ngọc Hân"));
    const families = block(html, 'aria-labelledby="ee-families-heading"');
    expect(families.indexOf('data-side="GROOM"')).toBeLessThan(families.indexOf('data-side="BRIDE"'));
    expect(html).toMatch(/id="ee-ceremony-heading"[^>]*>Lễ Thành Hôn<\/h2>/);
    expect(html).not.toContain("Vu Quy");
    const gift = block(html, 'aria-labelledby="ee-gift-heading"');
    expect(gift).toContain('data-side="GROOM"');
    expect(gift).not.toContain('data-side="BRIDE"');
    expect(gift).not.toContain("TRAN NGOC HAN");
  });

  it("BRIDE: bride primary, bride family first, Lễ Vu Quy, bride gift side only", async () => {
    const { html } = await renderFixture({ variant: "BRIDE" });
    const h1 = html.slice(html.indexOf("<h1"), html.indexOf("</h1>"));
    expect(h1.indexOf("Ngọc Hân")).toBeGreaterThan(-1);
    expect(h1.indexOf("Ngọc Hân")).toBeLessThan(h1.indexOf("Minh Khôi"));
    const couple = block(html, 'aria-labelledby="ee-couple-heading"');
    expect(couple.indexOf(COPY.couple.roleBySide.BRIDE)).toBeLessThan(couple.indexOf(COPY.couple.roleBySide.GROOM));
    const families = block(html, 'aria-labelledby="ee-families-heading"');
    expect(families.indexOf('data-side="BRIDE"')).toBeLessThan(families.indexOf('data-side="GROOM"'));
    expect(families.indexOf(COPY.families.labelBySide.BRIDE)).toBeLessThan(
      families.indexOf(COPY.families.labelBySide.GROOM),
    );
    expect(html).toMatch(/id="ee-ceremony-heading"[^>]*>Lễ Vu Quy<\/h2>/);
    expect(html).not.toContain("Thành Hôn");
    const gift = block(html, 'aria-labelledby="ee-gift-heading"');
    expect(gift).toContain('data-side="BRIDE"');
    expect(gift).not.toContain('data-side="GROOM"');
  });

  it.each(INVITATION_VARIANTS)("%s: event cards render exactly viewModel.ceremonyCards, in order", async (variant: InvitationVariant) => {
    const { html, viewModel } = await renderFixture({ variant });
    const events = block(html, 'aria-labelledby="ee-events-heading"');
    const rendered = [...events.matchAll(/<li class="[^"]*" data-side="(\w+)">[\s\S]*?<h3 class="[^"]*eventTitle[^"]*">([^<]*)<\/h3>/g)].map(
      (match) => [match[1], match[2]],
    );
    // Visible title: the fixed v1 copy for the card's side (Product Owner ruling 7A), never event.title.
    expect(rendered).toStrictEqual(viewModel.ceremonyCards.map((card) => [card.side, COPY.events.ceremonyCardTitleBySide[card.side]]));
    expect(count(events, "<li")).toBe(viewModel.ceremonyCards.length);
  });

  it("family side labels come from explicit side, never position", async () => {
    const { viewModel, sections } = await buildRendererFixture({ variant: "BRIDE" }).then((fixture) => ({
      viewModel: fixture.viewModel,
      sections: fixture.selection.effectiveSections,
    }));
    const html = render(viewModel, sections);
    const families = block(html, 'aria-labelledby="ee-families-heading"');
    const brideColumn = families.slice(families.indexOf('data-side="BRIDE"'), families.indexOf('data-side="GROOM"'));
    expect(brideColumn).toContain(COPY.families.labelBySide.BRIDE);
    expect(brideColumn).toContain("Trần Quốc Việt");
    expect(brideColumn).not.toContain(COPY.families.labelBySide.GROOM);
  });

  it("omits a family with no canonical line instead of fabricating it", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "COMMON" });
    if (input.weddingDetails === null) throw new Error("fixture");
    input.weddingDetails = { ...input.weddingDetails, brideFather: null, brideMother: "  ", brideFamilyAddress: null };
    const { html } = await renderSource(input);
    const families = block(html, 'aria-labelledby="ee-families-heading"');
    expect(families).toContain(COPY.families.labelBySide.GROOM);
    expect(families).not.toContain(COPY.families.labelBySide.BRIDE);
  });
});

/** The two-line invitation block (Micro-Checkpoint 10). */
function invitationBlock(html: string): string {
  const start = html.lastIndexOf("<div", html.indexOf("data-guest="));
  return html.slice(start, html.indexOf("</div>", start) + "</div>".length);
}

function blockLines(html: string): string[] {
  return [...invitationBlock(html).matchAll(/<p[^>]*>(.*?)<\/p>/g)].map((m) => m[1].replace(/<[^>]*>/g, ""));
}

describe("invitation block (Micro-Checkpoint 10 Product Owner ruling)", () => {
  it("personalized: exactly \"TRÂN TRỌNG KÍNH MỜI\" + the trusted guest display name", async () => {
    const { html } = await renderFixture({ variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL });
    expect(invitationBlock(html)).toContain('data-guest="personalized"');
    expect(blockLines(html)).toStrictEqual(["TRÂN TRỌNG KÍNH MỜI", FIXTURE_GUESTS.NORMAL.displayName]);
    expect(html).not.toContain(COPY.opening.defaultGuest);
  });

  it("unpersonalized: exactly \"TRÂN TRỌNG KÍNH MỜI\" + \"Quý khách\", no guest name", async () => {
    const { html } = await renderFixture({ variant: "GROOM" });
    expect(invitationBlock(html)).toContain('data-guest="unpersonalized"');
    expect(blockLines(html)).toStrictEqual(["TRÂN TRỌNG KÍNH MỜI", "Quý khách"]);
    for (const guest of Object.values(FIXTURE_GUESTS)) expect(html).not.toContain(guest.displayName);
  });

  it("no duplicated invitation sentence: the canonical message never renders (v1 is not capable of it)", async () => {
    for (const variant of INVITATION_VARIANTS) {
      const { html, viewModel, sections } = await renderFixture({ variant, guest: FIXTURE_GUESTS.NORMAL });
      expect(sections.invitationMessage).toBe(false);
      expect(viewModel.content.invitationMessage).toContain("Trân trọng kính mời");
      expect(html).not.toContain(viewModel.content.invitationMessage as string);
      // Exactly one "kính mời" sentence on the page, in any letter case: the kicker.
      expect(html.match(/trân trọng kính mời/gi)).toStrictEqual(["TRÂN TRỌNG KÍNH MỜI"]);
      expect(html).not.toContain("ee-message-heading");
      expect(block(html, "<header")).not.toMatch(/data-guest|TRÂN TRỌNG KÍNH MỜI|Anh Tuấn/);
      expect(block(html, 'aria-label="Save the date"')).not.toMatch(/data-guest|TRÂN TRỌNG KÍNH MỜI|Anh Tuấn/);
      expect(count(html, FIXTURE_GUESTS.NORMAL.displayName)).toBe(1);
    }
  });

  it("long Vietnamese and playful names render complete, never truncated", async () => {
    for (const guest of [FIXTURE_GUESTS.LONG, FIXTURE_GUESTS.PLAYFUL]) {
      const { html } = await renderFixture({ variant: "COMMON", guest });
      expect(html).toContain(`>${guest.displayName}</span></p>`);
      expect(count(html, guest.displayName)).toBe(1);
      expect(html).not.toMatch(/…|\.\.\.<\/p>/);
    }
  });

  it("never emits guest identity, tokens or a ?guest= URL", async () => {
    const { html } = await renderFixture({ variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL });
    expect(html).not.toMatch(/[?&]guest=|token|guestId|guest_id/i);
  });
});

describe("date, time, calendar and lunar", () => {
  it("GROOM/COMMON ceremony: RF-05C parts of 2026-10-18 09:00 Asia/Ho_Chi_Minh", async () => {
    for (const variant of ["COMMON", "GROOM"] as const) {
      const { html } = await renderFixture({ variant });
      const ceremony = block(html, 'aria-labelledby="ee-ceremony-heading"');
      expect(ceremony).toContain(">Chủ Nhật<");
      expect(ceremony).toContain(">18<");
      expect(ceremony).toContain(`>${COPY.ceremony.monthPrefix} 10<`);
      expect(ceremony).toContain(">2026<");
      expect(ceremony).toContain(">09:00<");
      // Task029 dotted DD.MM.YYYY on the opening, Hero and Closing.
      expect(block(html, "<header")).toContain(">18.10.2026<");
      expect(block(html, 'aria-label="Save the date"')).toContain(">18.10.2026<");
      expect(block(html, 'aria-labelledby="ee-closing-heading"')).toContain(">18.10.2026<");
    }
  });

  it("ceremony composition: label → day | Tháng MM / YYYY → Tức ngày {lunar} → WEEKDAY · HH:mm", async () => {
    const { html, viewModel } = await renderFixture({ variant: "GROOM" });
    const ceremony = block(html, 'aria-labelledby="ee-ceremony-heading"');
    const order = [">Lễ Thành Hôn<", ">18<", ">Tháng 10<", ">2026<", ">Tức ngày<", viewModel.ceremony.lunarDateDisplay as string, ">Chủ Nhật<", ">09:00<"];
    const positions = order.map((part) => ceremony.indexOf(part));
    expect(positions.every((position) => position >= 0), JSON.stringify(positions)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toStrictEqual(positions);
    expect(ceremony).toMatch(/class="[^"]*ceremonyWeekday[^"]*">Chủ Nhật<\/span><span aria-hidden="true"> · <\/span><span>09:00<\/span>/);
  });

  it("BRIDE ceremony: 2026-10-17 09:00, Thứ Bảy", async () => {
    const { html } = await renderFixture({ variant: "BRIDE" });
    const ceremony = block(html, 'aria-labelledby="ee-ceremony-heading"');
    expect(ceremony).toContain(">Thứ Bảy<");
    expect(ceremony).toContain(">17<");
    expect(ceremony).toContain(">09:00<");
  });

  it("ceremony cards show their own event's RF-05C local time; receptions are not cards", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    const events = block(html, 'aria-labelledby="ee-events-heading"');
    // Task029 "HH:mm - Weekday" and the dotted DD.MM.YYYY date: Thành Hôn 18.10, Vu Quy 17.10, both 09:00.
    expect(events).toContain(">09:00 - Chủ Nhật<");
    expect(events).toContain(">09:00 - Thứ Bảy<");
    expect(events).toContain(">18.10.2026<");
    expect(events).toContain(">17.10.2026<");
    // The receptions (18:00 / 12:00) stay canonical events but are never ceremony cards.
    expect(events).not.toContain(">18:00 - Chủ Nhật<");
    expect(events).not.toContain(">12:00 - Thứ Bảy<");
    expect(events).not.toContain(COPY.ceremony.lunarLabel);
    expect(events).not.toContain("Âm Lịch");
  });

  // Micro-Checkpoint 7 (RF2 "Ceremony-card presentation"): one card per operational side, GROOM before BRIDE,
  // rite-derived titles. The neutral fixture sorts the bride's Vu Quy first and keeps "tại …" in the canonical titles.
  it("ceremony cards: COMMON shows Nhà Trai / Tiệc mừng lễ thành hôn then Nhà Gái / Tiệc mừng lễ vu quy, independent of canonical order and titles", async () => {
    const cards = (html: string) =>
      [...block(html, 'aria-labelledby="ee-events-heading"').matchAll(/<li class="[^"]*" data-side="(\w+)">(?:<p class="[^"]*eventTag[^"]*">([^<]*)<\/p>)?<h3 class="[^"]*eventTitle[^"]*">([^<]*)<\/h3>/g)].map(
        (match) => [match[1], match[2] ?? null, match[3]],
      );
    const common = await renderFixture({ variant: "COMMON" });
    expect(common.viewModel.events.map((event) => [event.side, event.title])).toStrictEqual([
      ["BRIDE", "Lễ Vu Quy tại tư gia nhà gái"],
      ["GROOM", "Lễ Thành Hôn tại tư gia nhà trai"],
      ["BRIDE", "Tiệc cưới nhà gái"],
      ["COMMON", "Tiệc cưới"],
    ]);
    expect(COPY.events.ceremonyCardTitleBySide).toStrictEqual({ GROOM: "Tiệc mừng lễ thành hôn", BRIDE: "Tiệc mừng lễ vu quy" });
    expect(cards(common.html)).toStrictEqual([
      ["GROOM", COPY.families.labelBySide.GROOM, "Tiệc mừng lễ thành hôn"],
      ["BRIDE", COPY.families.labelBySide.BRIDE, "Tiệc mừng lễ vu quy"],
    ]);
    // The ViewModel card keeps its RF3 business title; the canonical event titles are untouched.
    expect(common.viewModel.ceremonyCards.map((card) => card.title)).toStrictEqual(["Lễ Thành Hôn", "Lễ Vu Quy"]);
    const events = block(common.html, 'aria-labelledby="ee-events-heading"');
    expect(events).not.toMatch(/<h3[^>]*>[^<]*\btại\b/i);
    expect(events).not.toMatch(/Tiệc cưới/);
    expect(events.indexOf(">Tư gia nhà trai<")).toBeGreaterThan(events.indexOf(">Tiệc mừng lễ thành hôn<"));
    expect(events.indexOf(">Tư gia nhà gái<")).toBeGreaterThan(events.indexOf(">Tiệc mừng lễ vu quy<"));
    // GROOM / BRIDE: that side's own ceremony only, with no side tag (Design Baseline D6).
    expect(cards((await renderFixture({ variant: "GROOM" })).html)).toStrictEqual([["GROOM", null, "Tiệc mừng lễ thành hôn"]]);
    expect(cards((await renderFixture({ variant: "BRIDE" })).html)).toStrictEqual([["BRIDE", null, "Tiệc mừng lễ vu quy"]]);
    // Product Owner ruling 7A: the title is one step larger (12 → 13 px), same family and tracking.
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8");
    expect(css).toMatch(/\.eventTitle \{\s*font-family: var\(--ee-sans\);\s*font-size: 13px;\s*font-weight: 600;\s*line-height: 1\.5;\s*letter-spacing: 0\.2em;/);
  });

  it("calendar: Monday-first headers, the 42-cell grid's 5 occupied weeks for Oct 2026, exactly one ceremony marker", async () => {
    const { html, viewModel } = await renderFixture({ variant: "GROOM" });
    const calendar = block(html, 'aria-labelledby="ee-calendar-heading"');
    const headers = [...calendar.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]);
    expect(headers).toStrictEqual(["T2", "T3", "T4", "T5", "T6", "T7", "CN"]);
    // The canonical K33 grid stays 42 cells; its sixth week (2–8 Nov) has no October day, so it is not rendered.
    const grid = deriveCeremonyMonthGridV1(viewModel);
    expect(grid.cells).toHaveLength(42);
    expect(grid.cells.slice(35).every((cell) => !cell.inCeremonyMonth)).toBe(true);
    expect(count(calendar, "<tr")).toBe(1 + 5);
    expect(count(calendar, "<td")).toBe(35);
    expect(count(calendar, 'data-ceremony-day="true"')).toBe(1);
    const marked = calendar.slice(calendar.indexOf('data-ceremony-day="true"'));
    expect(marked).toMatch(/^[^<]*>(<img [^>]*\/>)?<span[^>]*>18<\/span>/);
    // Monday 28 Sep 2026 is the first cell; 1 Oct 2026 (Thursday) is the fourth.
    const days = [...calendar.matchAll(/<td[^>]*data-in-month="(true|false)"[^>]*>([\s\S]*?)<\/td>/g)].map((match) => [
      match[1],
      match[2].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<span class="[^"]*srOnly[^"]*">[^<]*<\/span>/g, "").replace(/<[^>]*>/g, ""),
    ]);
    expect(days).toHaveLength(35);
    expect(days.filter(([inMonth]) => inMonth === "true").map(([, day]) => day)).toStrictEqual(
      Array.from({ length: 31 }, (_, index) => String(index + 1)),
    );
    // Out-of-month cells keep their K33 grid position but render blank (B5 item 10).
    expect(days.slice(0, 4)).toStrictEqual([
      ["false", ""],
      ["false", ""],
      ["false", ""],
      ["true", "1"],
    ]);
    expect(days.filter(([inMonth]) => inMonth === "false").every(([, day]) => day === "")).toBe(true);
    expect(calendar).toContain(`>${COPY.calendar.monthPrefix} 10<`);
  });

  // Micro-Checkpoint 2 (presentation only): only weeks holding an in-month day render; the K33 grid stays 42 cells.
  it.each([
    ["2026-03-15T02:00:00.000Z", "March 2026 (1st is a Sunday)", 6],
    ["2026-10-18T02:00:00.000Z", "October 2026 (1st is a Thursday)", 5],
    ["2027-02-15T02:00:00.000Z", "February 2027 (1st is a Monday, 28 days)", 4],
  ] as const)("calendar %s → %s renders %i weeks of the 42-cell grid", async (startsAt, _label, weeks) => {
    const { viewModel } = await renderFixture({ variant: "GROOM" });
    const grid = deriveCeremonyMonthGridV1({ ceremony: { ...viewModel.ceremony, startsAt } });
    expect(grid.cells).toHaveLength(42);
    const calendar = renderToStaticMarkup(<Calendar grid={grid} />);
    expect(count(calendar, "<tr")).toBe(1 + weeks);
    expect(count(calendar, "<td")).toBe(weeks * 7);
    // Every rendered week holds an in-month day; every omitted week holds none.
    const rendered = [...calendar.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1).map((match) => match[1]);
    expect(rendered.every((row) => row.includes('data-in-month="true"'))).toBe(true);
    const omitted = Array.from({ length: 6 }, (_, row) => grid.cells.slice(row * 7, row * 7 + 7)).filter(
      (week) => !week.some((cell) => cell.inCeremonyMonth),
    );
    expect(omitted).toHaveLength(6 - weeks);
    expect(count(calendar, 'data-ceremony-day="true"')).toBe(1);
  });

  // Micro-Checkpoint 4: Task029 CSS values on the approved Task029 art (no production-only mask).
  it("Task029 placement: corner bouquets, floral strip overlap and the RSVP → Gift band rhythm", () => {
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = (selector: string) => {
      // A standalone rule: the selector directly follows the previous rule's closing brace.
      const match = new RegExp(`\\}\\s*${selector.replace(/[.+()[\]]/g, "\\$&")} \\{`).exec(css);
      expect(match, selector).not.toBeNull();
      const start = (match as RegExpExecArray).index;
      return css.slice(start + 1, css.indexOf("}", start + 1));
    };
    expect(rule(".calendarBotanicalStart")).toMatch(/top: -58px;\s*left: -46px;\s*$/);
    expect(rule(".calendarBotanicalEnd")).toMatch(/right: -30px;\s*bottom: -38px;\s*$/);
    expect(css).not.toMatch(/mask-image/);
    expect(rule(".coupleDivider")).toMatch(/margin: -6px auto -10px;/);
    expect(rule(".rsvpSection:has(+ .giftBlock)")).toMatch(/padding-bottom: 0;/);
    expect(rule(".rsvpSection + .giftBlock")).toMatch(/padding-top: 12px;/);
    expect(rule(".giftBlock")).toMatch(/padding: 18px 26px 40px;/);
    // Task029 6 px tab spacing; the row stops short of the 44 px close button (PO ruling: tabs beside close).
    expect(rule(".giftTabs")).toMatch(/margin: 6px 0 20px;\s*padding-right: 38px;/);
    expect(rule(".giftDialogClose")).toMatch(/top: 8px;\s*right: 10px;[\s\S]*min-width: 44px;\s*min-height: 44px;/);
  });

  it("calendar: Task029 two-line intro, no visible year, Task029 bouquets and heart", async () => {
    const { html } = await renderFixture({ variant: "GROOM" });
    const calendar = block(html, 'aria-labelledby="ee-calendar-heading"');
    expect(calendar).toMatch(/<span[^>]*>Đám cưới của chúng mình<\/span><span[^>]*>Sẽ diễn ra vào<\/span>/);
    expect(calendar.replace(/<table[\s\S]*<\/table>/, "")).not.toContain("2026");
    for (const file of ["calendar-flower-top-left.webp", "calendar-flower-bottom-right.webp", "calendar-heart.svg"]) {
      expect(count(calendar, `src="/renderers/wedding/elegant-editorial/v1/${file}"`), file).toBe(1);
    }
    const marked = calendar.slice(calendar.indexOf('data-ceremony-day="true"'));
    expect(marked).toMatch(/^[^>]*><img [^>]*src="\/renderers\/wedding\/elegant-editorial\/v1\/calendar-heart\.svg"[^>]*\/><span[^>]*>18<\/span>/);
  });

  it("lunar present: the exact fixed label \"Tức ngày\" beside the verbatim canonical value", async () => {
    for (const variant of INVITATION_VARIANTS) {
      const { html, viewModel } = await renderFixture({ variant });
      const lunar = viewModel.ceremony.lunarDateDisplay;
      // Display-ready fixture text with no prefix of its own (RF6 example form, Task029 casing).
      expect(lunar).toMatch(/^\d{2}\/\d{2} Âm Lịch$/);
      expect(COPY.ceremony.lunarLabel).toBe("Tức ngày");
      const start = html.indexOf('data-lunar="present"');
      const line = html.slice(start, html.indexOf("</p>", start));
      const spans = [...line.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((match) => match[1]);
      // Two separate elements: the fixed label, then the canonical value unchanged (no parsing or rewording).
      expect(spans).toStrictEqual(["Tức ngày", lunar]);
      expect(count(html, lunar as string)).toBe(1);
      expect(count(html, "Tức ngày")).toBe(1);
      expect(html).not.toContain("Nhằm ngày");
    }
  });

  it("lunar is passed through verbatim: an arbitrary prefixed value is never stripped or reworded (K32)", async () => {
    const { viewModel, sections } = await renderFixture({ variant: "COMMON" });
    const authored = "Nhằm ngày 09 tháng 09 năm Bính Ngọ";
    const html = render({ ...viewModel, ceremony: { ...viewModel.ceremony, lunarDateDisplay: authored } }, sections);
    const start = html.indexOf('data-lunar="present"');
    const line = html.slice(start, html.indexOf("</p>", start));
    expect([...line.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((match) => match[1])).toStrictEqual(["Tức ngày", authored]);
  });

  it("lunar null: the whole lunar line, label included, is omitted", async () => {
    for (const variant of INVITATION_VARIANTS) {
      const { html, viewModel } = await renderFixture({ variant, ceremonyLunar: "ABSENT" });
      expect(viewModel.ceremony.lunarDateDisplay).toBeNull();
      expect(html).not.toContain('data-lunar="present"');
      expect(html).not.toContain("Tức ngày");
      expect(html).not.toContain("Âm Lịch");
      expect(html).not.toContain("Nhằm ngày");
    }
  });

  it("the ceremony section renders lunarDateDisplay as-is: no lunar parsing, formatting or calculation", () => {
    const source = readFileSync(join(__dirname, "..", "sections", "ceremony.tsx"), "utf8");
    expect(source).toContain("{lunar}</span>");
    expect(source).not.toMatch(/lunar\s*\.\s*(replace|split|slice|substring|match|toUpperCase|toLowerCase|normalize|padStart)\b/);
    expect(source).not.toMatch(/\bIntl\b|toLocale|new Date|\bDate\.|parseInt|Number\(/);
  });
});

describe("section gating (props sections are the only authority)", () => {
  const OFF = { invitationMessage: false, loveStory: false, gallery: false, music: false, gift: false, timeline: false, dressCode: false, photoStory: false };

  it("all optional sections on", async () => {
    const { html, sections } = await renderFixture({ variant: "COMMON" });
    expect(sections).toStrictEqual({ invitationMessage: false, loveStory: true, gallery: true, music: true, gift: true, timeline: true, dressCode: true, photoStory: false });
    expect(html).toContain('aria-labelledby="ee-dress-code-heading"');
    expect(html).toContain('aria-labelledby="ee-timeline-heading"');
    expect(html).not.toContain("Trân trọng kính mời quý khách đến chung vui cùng gia đình chúng tôi.");
    expect(html).toContain("Chúng tôi gặp nhau vào một chiều mưa.\nBa năm sau");
    expect(html).toContain('aria-labelledby="ee-gallery-heading"');
    expect(html).toContain('aria-labelledby="ee-gift-heading"');
  });

  it("each optional section can be turned off by staff settings", async () => {
    for (const key of ["loveStory", "gallery", "gift", "timeline", "dressCode"] as const) {
      const { html, sections } = await renderFixture({ variant: "COMMON", sectionSettings: { [key]: false } });
      expect(sections[key]).toBe(false);
      const marker = {
        loveStory: "ee-story-heading",
        gallery: "ee-gallery-heading",
        gift: "ee-gift-heading",
        timeline: "ee-timeline-heading",
        dressCode: "ee-dress-code-heading",
      }[key];
      expect(html).not.toContain(marker);
    }
  });

  // Micro-Checkpoint 8 (RF7 Timeline amendment): Task029 Timeline between the Events ✦ and the tight ✦.
  it("timeline: Task029 rows in canonical order, between the Events ✦ and the tight ✦, no visible heading", async () => {
    const { html, viewModel } = await renderFixture({ variant: "COMMON" });
    expect(viewModel.content.timeline.map((item) => [item.time, item.label])).toStrictEqual([
      ["08:30", "Đón khách"],
      ["09:00", "Làm lễ"],
      ["11:00", "Khai tiệc"],
    ]);
    const timeline = block(html, 'aria-labelledby="ee-timeline-heading"');
    expect(timeline).toMatch(/<h2 id="ee-timeline-heading" class="[^"]*srOnly[^"]*">Lịch trình<\/h2>/);
    const rows = [...timeline.matchAll(/<li class="[^"]*timelineRow[^"]*"><time class="[^"]*timelineTime[^"]*" dateTime="([^"]*)">([^<]*)<\/time><span class="[^"]*timelineDot[^"]*" aria-hidden="true"><\/span><span class="[^"]*timelineLabel[^"]*">([^<]*)<\/span><\/li>/g)].map((m) => [m[1], m[2], m[3]]);
    expect(rows).toStrictEqual([
      ["08:30", "08:30", "Đón khách"],
      ["09:00", "09:00", "Làm lễ"],
      ["11:00", "11:00", "Khai tiệc"],
    ]);
    // Rhythm: Events (ending with its ✦) → Timeline → tight ✦ (the Countdown now sits above the Calendar).
    const events = html.indexOf('aria-labelledby="ee-events-heading"');
    const timelineAt = html.indexOf('aria-labelledby="ee-timeline-heading"');
    const tight = html.indexOf('data-tight="true"');
    expect(events).toBeLessThan(timelineAt);
    expect(timelineAt).toBeLessThan(tight);
    expect(count(html, "ornamentPause")).toBe(2);
    expect(count(block(html, 'aria-labelledby="ee-events-heading"'), "ornamentPause")).toBe(1);
  });

  it("timeline: any number of steps, labels as text; no rows → no section, the ✦ rhythm stays", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "BRIDE" });
    input.timelineItems = Array.from({ length: 5 }, (_, i) => ({
      id: `00000000-0000-4000-8000-00000000040${i}`,
      projectId: input.project.id,
      time: `1${i}:15`,
      label: i === 4 ? "<b>Tiễn khách</b> và chụp ảnh lưu niệm cùng toàn thể gia đình hai bên" : `Bước ${i + 1}`,
      sortOrder: 0,
    }));
    const { html } = await renderSource(input);
    const timeline = block(html, 'aria-labelledby="ee-timeline-heading"');
    expect(count(timeline, "<li")).toBe(5);
    expect(timeline).toContain("&lt;b&gt;Tiễn khách&lt;/b&gt;");
    const none = await renderFixture({ variant: "COMMON", timeline: "ABSENT" });
    expect(none.viewModel.sections.timeline).toBe(false);
    expect(none.html).not.toContain("ee-timeline-heading");
    expect(none.html).not.toMatch(/timelineRow/);
    expect(count(none.html, "ornamentPause")).toBe(2);
  });

  // Micro-Checkpoint 9 (RF7 Dress Code amendment): Task029 Dress Code between Gift and Gallery.
  it("dress code: Task029 kicker, description and ordered swatches, between Gift and Gallery", async () => {
    const { html, viewModel } = await renderFixture({ variant: "COMMON" });
    const section = block(html, 'aria-labelledby="ee-dress-code-heading"');
    expect(section).toMatch(/<h2 id="ee-dress-code-heading" class="[^"]*sectionKicker[^"]*">Dress code<\/h2>/);
    expect(section).toContain(`>${viewModel.content.dressCode?.description}</p>`);
    const colors = [...section.matchAll(/<li class="[^"]*dressCodeSwatch[^"]*" style="background-color:(#[0-9a-f]{6})">/g)].map((m) => m[1]);
    expect(colors).toStrictEqual(["#caa06a", "#7c5c42", "#e8dcc8", "#3d352b"]);
    expect(section).toMatch(/<ul class="[^"]*dressCodeSwatches[^"]*" aria-label="Bảng màu gợi ý">/);
    const gift = html.indexOf('aria-labelledby="ee-gift-heading"');
    const dress = html.indexOf('aria-labelledby="ee-dress-code-heading"');
    const gallery = html.indexOf('aria-labelledby="ee-gallery-heading"');
    expect(gift).toBeLessThan(dress);
    expect(dress).toBeLessThan(gallery);
  });

  it("dress code: any swatch count, description-only, swatches-only; absent → no band", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "GROOM" });
    input.dressCodeSwatches = Array.from({ length: 7 }, (_, i) => ({
      id: `00000000-0000-4000-8000-00000000060${i}`,
      projectId: input.project.id,
      color: `#${String(i).repeat(6)}`,
      sortOrder: i,
    }));
    const seven = block((await renderSource(input)).html, 'aria-labelledby="ee-dress-code-heading"');
    expect(count(seven, "<li")).toBe(7);
    input.dressCodeSwatches = [];
    const textOnly = block((await renderSource(input)).html, 'aria-labelledby="ee-dress-code-heading"');
    expect(textOnly).toContain("dressCodeText");
    expect(textOnly).not.toContain("<ul");
    input.dressCode = { projectId: input.project.id, description: null };
    input.dressCodeSwatches = [{ id: "00000000-0000-4000-8000-000000000611", projectId: input.project.id, color: "#caa06a", sortOrder: 0 }];
    const swatchOnly = block((await renderSource(input)).html, 'aria-labelledby="ee-dress-code-heading"');
    expect(swatchOnly).not.toContain("dressCodeText");
    expect(count(swatchOnly, "<li")).toBe(1);
    const none = await renderFixture({ variant: "COMMON", dressCode: "ABSENT" });
    expect(none.viewModel.sections.dressCode).toBe(false);
    expect(none.html).not.toContain("ee-dress-code-heading");
    expect(none.html).not.toContain("Dress code");
  });

  it("dress code CSS: Task029 values; the swatch row wraps", () => {
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8");
    expect(css).toMatch(/\.dressCode \{\s*padding: 36px 28px 40px;\s*background-color: var\(--ee-surface-sage\);\s*text-align: center;/);
    expect(css).toMatch(/\.dressCodeText \{\s*max-width: 300px;\s*margin: 0 auto 18px;[^}]*font-size: 13px;\s*line-height: 1\.8;\s*color: var\(--ee-muted\);/);
    expect(css).toMatch(/\.dressCodeSwatches \{\s*display: flex;\s*flex-wrap: wrap;\s*justify-content: center;\s*gap: 10px;/);
    expect(css).toMatch(/\.dressCodeSwatch \{[^}]*width: 30px;\s*height: 30px;\s*border-radius: 50%;\s*box-shadow: 0 0 0 1px/);
  });

  // Media batch (RF7 Photo Story / Love Story photo amendment).
  it("[media-batch] Photo Story: five orientation-aware tiles after the Countdown ✦, before the Love Story", async () => {
    const { html } = await renderFixture({ variant: "COMMON", photoStory: "PRESENT" });
    const section = block(html, 'aria-labelledby="ee-photo-story-heading"');
    const tiles = [...section.matchAll(/<div class="([^"]*)"[^>]*><img [^>]*src="([^"]*)"/g)].map((m) => [m[1].replace(/^[^_]*_+|_.*$/g, ""), m[2]]);
    expect(tiles.map(([, src]) => src)).toStrictEqual(FIXTURE_PHOTO_STORY_IDS.map((id) => fixtureMediaUrl(id)));
    // PO two-column correction: one uniform tile class, no anchor / pair / offset slots.
    expect(section.match(/<div class="[^"]*photoStoryTile[^"]*"[^>]*><img /g)).toHaveLength(5);
    expect(section).not.toMatch(/photoStory(Anchor|PairItem|OffsetRow|OffsetWide|OffsetNarrow)/);
    expect(html.indexOf('data-tight="true"')).toBeLessThan(html.indexOf("ee-photo-story-heading"));
    expect(html.indexOf("ee-photo-story-heading")).toBeLessThan(html.indexOf("ee-story-heading"));
    for (const id of [FIXTURE_MEDIA_IDS.GALLERY_1, FIXTURE_MEDIA_IDS.COVER]) expect(section).not.toContain(fixtureMediaUrl(id));
  });

  it.each([4, 3, 2, 1])("[media-batch] Photo Story with %i usable photos renders exactly that many tiles, in order", async (n) => {
    const unavailableMediaIds = FIXTURE_PHOTO_STORY_IDS.slice(n);
    const { html } = await renderFixture({ variant: "COMMON", photoStory: "PRESENT", unavailableMediaIds });
    const section = block(html, 'aria-labelledby="ee-photo-story-heading"');
    const tiles = [...section.matchAll(/<div class="[^"]*(photoStory[A-Za-z]+)[^"]*"[^>]*><img [^>]*src="([^"]*)"/g)];
    expect(tiles.map((m) => m[1])).toStrictEqual(Array.from({ length: n }, () => "photoStoryTile"));
    expect(tiles.map((m) => m[2])).toStrictEqual(FIXTURE_PHOTO_STORY_IDS.slice(0, n).map((id) => fixtureMediaUrl(id)));
  });

  it("[media-batch] Photo Story with no usable photo, or none at all, renders nothing", async () => {
    const allGone = await renderFixture({ variant: "COMMON", photoStory: "PRESENT", unavailableMediaIds: [...FIXTURE_PHOTO_STORY_IDS] });
    expect(allGone.html).not.toContain("ee-photo-story-heading");
    const none = await renderFixture({ variant: "COMMON" });
    expect(none.viewModel.sections.photoStory).toBe(false);
    expect(none.html).not.toContain("ee-photo-story-heading");
  });

  it("[media-batch] Love Story: RESOLVED photo → Task029 photo + scrim; absent / UNAVAILABLE → moss band, no image", async () => {
    const withPhoto = block((await renderFixture({ variant: "COMMON", loveStoryPhoto: "PRESENT" })).html, 'aria-labelledby="ee-story-heading"');
    expect(withPhoto).toMatch(/^[^>]*data-photo="true"/);
    expect(withPhoto).toContain(`src="${fixtureMediaUrl(FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO)}"`);
    expect(withPhoto).toMatch(/storyScrim/);
    for (const options of [{}, { loveStoryPhoto: "PRESENT" as const, unavailableMediaIds: [FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO] }]) {
      const band = block((await renderFixture({ variant: "COMMON", ...options })).html, 'aria-labelledby="ee-story-heading"');
      expect(band).not.toContain("data-photo");
      expect(band).not.toMatch(/<img |storyScrim/);
    }
  });

  it.each([0, 1, 2, 3, 4, 10, 11, 23])("[media-batch] Gallery renders every one of %i images in order as uniform tiles (no cap)", async (n) => {
    const input = buildRendererFixtureSourceInput({ variant: "COMMON", galleryCount: Math.max(n, 3) });
    input.media = input.media.filter((item) => item.mediaType !== "GALLERY" || item.sortOrder <= n).filter((item) => n > 0 || item.mediaType !== "GALLERY");
    const { html, viewModel } = await renderSource(input);
    expect(viewModel.media.gallery).toHaveLength(n);
    if (n === 0) {
      expect(html).not.toContain("ee-gallery-heading");
      return;
    }
    const gallery = block(html, 'aria-labelledby="ee-gallery-heading"');
    const items = [...gallery.matchAll(/<li class="([^"]*)"[^>]*><img [^>]*src="([^"]*)"/g)];
    expect(items.map((m) => m[2])).toStrictEqual(viewModel.media.gallery.map((item) => fixtureMediaUrl(item.mediaId)));
    // PO two-column correction: one tile class for every item, no slot/span geometry.
    expect(new Set(items.map((m) => m[1])).size).toBe(1);
    expect(gallery).not.toMatch(/data-slot|data-span/);
  });

  it("[media-batch] Photo Story and Love Story photo CSS: Task029 values (PO-corrected Photo Story frames)", () => {
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8");
    expect(css).toMatch(/\.photoStory \{\s*padding: 10px 20px 14px;\s*background-color: var\(--ee-surface\);/);
    expect(css).toMatch(/\.photoStoryGrid \{\s*display: grid;\s*grid-template-columns: 1fr 1fr;\s*gap: 10px;/);
    // PO two-column correction: every tile 4:5; an odd last tile stays one column wide, centred.
    expect(css).toMatch(/\.photoStoryTile \{\s*min-width: 0;\s*aspect-ratio: 4 \/ 5;\s*\}/);
    expect(css).toMatch(
      /\.photoStoryTile\[data-placement="center"\] \{\s*grid-column: 1 \/ -1;\s*justify-self: center;\s*width: calc\(\(100% - 10px\) \/ 2\);\s*\}/,
    );
    expect(css).toMatch(/\.photoStoryTile\[data-placement="wide"\] \{\s*grid-column: 1 \/ -1;\s*aspect-ratio: 3 \/ 2;\s*\}/);
    expect(css).not.toMatch(/photoStory(Anchor|PairItem|OffsetRow|OffsetWide|OffsetNarrow)|58fr 42fr|aspect-ratio: 100 \/ 64/);
    expect(css).toMatch(/\.photoStoryImage \{[^}]*border-radius: 6px;\s*object-fit: cover;/);
    expect(css).toMatch(/\.storyBand\[data-photo="true"\] \{\s*position: relative;\s*min-height: 420px;\s*align-items: flex-end;\s*overflow: hidden;\s*padding: 0 26px 44px;/);
  });

  it("timeline CSS: Task029 values", () => {
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8");
    expect(css).toMatch(/\.timeline \{\s*padding: 8px 28px 16px;\s*background-color: var\(--ee-background\);/);
    expect(css).toMatch(/\.timelineList \{[^}]*gap: 14px;\s*max-width: 280px;\s*margin: 0 auto;/);
    expect(css).toMatch(/\.timelineRow \{[^}]*align-items: center;\s*gap: 12px;/);
    expect(css).toMatch(/\.timelineTime \{[^}]*width: 46px;[^}]*font-size: 12px;[^}]*color: var\(--ee-bronze\);/);
    expect(css).toMatch(/\.timelineDot \{[^}]*width: 6px;\s*height: 6px;\s*border-radius: 50%;\s*background-color: var\(--ee-accent\);/);
    expect(css).toMatch(/\.timelineLabel \{[^}]*font-size: 14px;\s*color: var\(--ee-text\);\s*overflow-wrap: break-word;/);
  });

  it("sections-minimal: only the non-optional blocks remain", async () => {
    const { html } = await renderFixture({ variant: "COMMON", sectionSettings: OFF });
    for (const marker of ["ee-message-heading", "ee-story-heading", "ee-gallery-heading", "ee-gift-heading", "ee-timeline-heading", "ee-dress-code-heading"]) {
      expect(html).not.toContain(marker);
    }
    for (const marker of ["<h1", "ee-couple-heading", "ee-families-heading", "ee-ceremony-heading", "ee-calendar-heading", "ee-events-heading", "ee-closing-heading"]) {
      expect(html).toContain(marker);
    }
  });

  it("props sections override ViewModel content availability (never re-derived)", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    expect(viewModel.sections.gallery).toBe(true);
    const html = render(viewModel, { ...selection.effectiveSections, gallery: false, loveStory: false });
    expect(html).not.toContain("ee-gallery-heading");
    expect(html).not.toContain("ee-story-heading");
  });

  it("love story is text, never HTML; the (incapable) invitation message never renders", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "COMMON" });
    if (input.weddingDetails === null) throw new Error("fixture");
    input.weddingDetails = {
      ...input.weddingDetails,
      invitationMessage: "<b>đậm</b> {guest}",
      loveStory: "<script>x</script>",
    };
    const { html } = await renderSource(input);
    expect(html).not.toContain("đậm");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("media states", () => {
  it("cover RESOLVED: photo-led Hero with Save the date, inline names, dotted date and no ceremony title", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    const hero = block(html, 'data-media-state="resolved" aria-label');
    expect(hero).toContain(`src="${fixtureMediaUrl(FIXTURE_MEDIA_IDS.COVER)}"`);
    expect(hero).toMatch(/alt="Ảnh cưới của Nguyễn Minh Khôi và Trần Ngọc Hân"/);
    const texts = hero.slice(hero.indexOf(">") + 1).replace(/<[^>]*>/g, "|").split("|");
    expect(texts.filter((text) => text.trim().length > 0)).toStrictEqual([
      "Save the date",
      "Minh Khôi",
      " &amp; ",
      "Ngọc Hân",
      "18.10.2026",
    ]);
    expect(hero).toMatch(/<span class="[^"]*amp[^"]*heroAmp[^"]*"> &amp; <\/span>/);
    expect(hero).not.toContain("Lễ Thành Hôn");
  });

  it("cover UNAVAILABLE renders the Design Baseline D4 typographic hero with no image", async () => {
    const { html } = await renderFixture({ variant: "GROOM", unavailableMediaIds: [FIXTURE_MEDIA_IDS.COVER] });
    const hero = block(html, 'data-media-state="unavailable"');
    expect(hero).not.toContain("<img");
    expect(hero).toContain(COPY.hero.kicker);
    expect(hero).toContain(">Lễ Thành Hôn</p>");
    expect(hero).toContain(">18.10.2026<");
    expect(html).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.COVER));
  });

  it("cover absent renders the same typographic hero (BRIDE: Lễ Vu Quy)", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "BRIDE" });
    input.media = input.media.filter((item) => item.mediaType !== "COVER");
    const { html } = await renderSource(input);
    const hero = block(html, 'data-media-state="absent"');
    expect(hero).not.toContain("<img");
    expect(hero).toContain(COPY.hero.kicker);
    expect(hero).toContain(">Lễ Vu Quy</p>");
  });

  it("gallery RESOLVED: every item in canonical order", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    const gallery = block(html, 'aria-labelledby="ee-gallery-heading"');
    const urls = [FIXTURE_MEDIA_IDS.GALLERY_1, FIXTURE_MEDIA_IDS.GALLERY_2, FIXTURE_MEDIA_IDS.GALLERY_3].map(
      fixtureMediaUrl,
    );
    const positions = urls.map((url) => gallery.indexOf(`src="${url}"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toStrictEqual(positions);
    expect(gallery).toMatch(/alt="Ảnh cưới 1 – Nguyễn Minh Khôi và Trần Ngọc Hân"/);
  });

  it("gallery UNAVAILABLE item keeps its position as a paper tile; the section stays", async () => {
    const { html } = await renderFixture({ variant: "BRIDE", unavailableMediaIds: [FIXTURE_MEDIA_IDS.GALLERY_2] });
    const gallery = block(html, 'aria-labelledby="ee-gallery-heading"');
    const states = [...gallery.matchAll(/data-media-state="(resolved|unavailable)"/g)].map((match) => match[1]);
    expect(states).toStrictEqual(["resolved", "unavailable", "resolved"]);
    expect(gallery).toContain(COPY.gallery.unavailable);
    expect(gallery).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.GALLERY_2));
    expect(count(gallery, "<img")).toBe(2);
    // The UNAVAILABLE item keeps its canonical position as a same-shape tile.
    expect(count(gallery, "<li ")).toBe(3);
  });

  it("gallery CSS: two equal columns of 4:5 tiles; an odd last tile stays one column wide, centred; no mosaic", () => {
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8");
    expect(css).toMatch(/\.gallery \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*gap: 8px;\s*\}/);
    expect(css).toMatch(/\.galleryItem \{[^}]*aspect-ratio: 4 \/ 5;[^}]*overflow: hidden;/);
    expect(css).toMatch(
      /\.galleryItem:last-child:nth-child\(odd\) \{\s*grid-column: 1 \/ -1;\s*justify-self: center;\s*width: calc\(\(100% - 8px\) \/ 2\);\s*\}/,
    );
    expect(css).not.toMatch(/galleryItem\[data-(slot|span)|grid-auto-rows: 44px|grid-row: span|grid-auto-flow:\s*dense/);
    const gallerySource = readFileSync(join(__dirname, "..", "sections", "gallery.tsx"), "utf8");
    expect(gallerySource).not.toMatch(/GALLERY_CYCLE|LONE_TAIL|% 10|data-slot|data-span/);
  });

  it("emits only ViewModel media URLs plus the frozen Design Baseline A1 decor files", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    const srcs = [...html.matchAll(/src="([^"]*)"/g)].map((match) => match[1] as string);
    const decor = srcs.filter((src) => src.startsWith("/renderers/wedding/elegant-editorial/v1/"));
    const media = srcs.filter((src) => !decor.includes(src));
    for (const src of media) expect(src.startsWith("https://renderer-fixtures.invalid/media/"), src).toBe(true);
    expect([...new Set(decor)].sort()).toStrictEqual(
      [
        "calendar-flower-bottom-right.webp",
        "calendar-flower-top-left.webp",
        "calendar-heart.svg",
        "ornament-fleuron.svg",
        "ornament-sparkle.svg",
        "portrait-divider-floral-strip.webp",
      ].map((file) => `/renderers/wedding/elegant-editorial/v1/${file}`),
    );
    for (const match of html.matchAll(/<img [^>]*src="\/renderers\/[^"]*"[^>]*>/g)) expect(match[0]).toContain('alt=""');
    expect(html).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.AUDIO));
  });
});

describe("gift and QR", () => {
  it("QR RESOLVED shows the QR with a side-bearing alt next to the bank text", async () => {
    const { html } = await renderFixture({ variant: "GROOM" });
    const gift = block(html, 'aria-labelledby="ee-gift-heading"');
    expect(gift).toContain(`src="${fixtureMediaUrl(FIXTURE_MEDIA_IDS.QR_GROOM)}"`);
    expect(gift).toContain(`alt="${COPY.gift.qrAltPrefix} ${COPY.families.labelBySide.GROOM}"`);
    for (const text of ["Ngân hàng Hoa Sữa", "NGUYEN MINH KHOI", "9001000000001"]) expect(gift).toContain(text);
    expect(gift).not.toContain(COPY.gift.qrUnavailable);
  });

  it("QR UNAVAILABLE with bank text keeps the bank text and adds the honest note", async () => {
    const { html } = await renderFixture({ variant: "COMMON", unavailableMediaIds: [FIXTURE_MEDIA_IDS.QR_GROOM] });
    const gift = block(html, 'aria-labelledby="ee-gift-heading"');
    const groom = gift.slice(gift.indexOf('data-side="GROOM"'), gift.indexOf('data-side="BRIDE"'));
    expect(groom).toContain("9001000000001");
    expect(groom).toContain(COPY.gift.qrUnavailable);
    expect(groom).not.toContain("<img");
    const bride = gift.slice(gift.indexOf('data-side="BRIDE"'));
    expect(bride).toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.QR_BRIDE));
    expect(bride).not.toContain(COPY.gift.qrUnavailable);
  });

  it("a side with only an UNAVAILABLE QR is omitted entirely", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "COMMON" });
    if (input.weddingDetails === null) throw new Error("fixture");
    input.weddingDetails = {
      ...input.weddingDetails,
      groomBankName: null,
      groomBankAccountName: null,
      groomBankAccountNumber: null,
    };
    const { html, viewModel } = await renderSource(input, [FIXTURE_MEDIA_IDS.QR_GROOM]);
    expect(viewModel.gift.groom).toBeDefined();
    const gift = block(html, 'aria-labelledby="ee-gift-heading"');
    expect(gift).not.toContain('data-side="GROOM"');
    expect(gift).toContain('data-side="BRIDE"');
    expect(count(gift, COPY.gift.qrUnavailable)).toBe(0);
  });

  it("a QR-only side with a RESOLVED QR is shown with its QR and no bank lines", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "GROOM" });
    if (input.weddingDetails === null) throw new Error("fixture");
    input.weddingDetails = {
      ...input.weddingDetails,
      groomBankName: null,
      groomBankAccountName: null,
      groomBankAccountNumber: null,
    };
    const { html } = await renderSource(input);
    const gift = block(html, 'aria-labelledby="ee-gift-heading"');
    expect(gift).toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.QR_GROOM));
    expect(gift).not.toContain("<dl");
  });

  it("no renderable side at all: no empty gift block", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "GROOM" });
    if (input.weddingDetails === null) throw new Error("fixture");
    input.weddingDetails = {
      ...input.weddingDetails,
      groomBankName: null,
      groomBankAccountName: null,
      groomBankAccountNumber: null,
    };
    const { html, sections } = await renderSource(input, [FIXTURE_MEDIA_IDS.QR_GROOM]);
    expect(sections.gift).toBe(true);
    expect(html).not.toContain("ee-gift-heading");
  });

  // RF-06D replacement of the RF-06B "static only" assertion: the sides now
  // live in the RF-06D gift dialog; without a clipboard capability there is
  // still no copy control (interactive tests cover the dialog and copy UI).
  it("without a clipboard capability: one dialog entry point, one closed dialog, no copy control", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    const gift = block(html, 'aria-labelledby="ee-gift-heading"');
    expect(count(gift, "<dialog")).toBe(1);
    expect(gift).not.toMatch(/<dialog[^>]*\sopen/);
    // Entry point, ✕ close, and the two COMMON side tabs (RF-06D, Design Baseline B5 item 15).
    expect(count(gift, "<button")).toBe(4);
    expect(html).not.toMatch(/Sao chép|Đã sao chép/);
  });
});

describe("event map links", () => {
  it("renders an accessible link only where a ceremony card's mapUrl exists", async () => {
    const { html, viewModel } = await renderFixture({ variant: "COMMON" });
    const withMap = viewModel.ceremonyCards.map((card) => card.event).filter((event) => event.mapUrl !== null);
    expect(withMap.length).toBe(2);
    // A canonical event without a card never gets a link, map or not.
    expect(viewModel.events.some((event) => event.mapUrl === null)).toBe(true);
    expect(count(html, COPY.events.mapLink)).toBe(withMap.length);
    for (const event of withMap) {
      expect(html).toContain(`href="${event.mapUrl as string}" target="_blank" rel="noopener noreferrer"`);
    }
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((match) => match[1]);
    expect(hrefs).toStrictEqual(withMap.map((event) => event.mapUrl));
  });
});

// RF-06D replacement: with an EMPTY capabilities object the renderer still
// shows no capability-driven UI. The only interactive elements are the
// capability-independent RF-06D opening envelope control (no skip control) and
// the gift dialog entry, close and — for COMMON only — the two side tabs.
describe("no capability-driven UI without capabilities", () => {
  it.each(INVITATION_VARIANTS)("%s: no RSVP, music, countdown, clipboard or interactive control", async (variant) => {
    const { html, sections, viewModel } = await renderFixture({ variant, guest: FIXTURE_GUESTS.NORMAL });
    expect(sections.music).toBe(true);
    expect(viewModel.media.audio?.status).toBe("RESOLVED");
    expect(html).not.toMatch(/<(form|input|select|textarea|audio|video)\b/);
    expect(count(html, "<button")).toBe(variant === "COMMON" ? 5 : 3);
    expect(count(html, "<dialog")).toBe(1);
    expect(html).not.toMatch(/onclick|role="button"/i);
    // No tabindex at all in server markup: the Hero is made focusable only when the opening completes.
    expect(html).not.toMatch(/tabindex=/);
    expect(html).not.toMatch(/RSVP|Xác nhận tham dự|nhạc|music|Đếm ngược|countdown|Sao chép/i);
  });

  it("music section on with UNAVAILABLE audio: still nothing music-related", async () => {
    const { html, sections } = await renderFixture({ variant: "COMMON", unavailableMediaIds: [FIXTURE_MEDIA_IDS.AUDIO] });
    expect(sections.music).toBe(true);
    expect(html).not.toMatch(/nhạc|music|<audio/i);
  });

  it("music section off: nothing music-related", async () => {
    const { html, sections } = await renderFixture({ variant: "COMMON", sectionSettings: { music: false } });
    expect(sections.music).toBe(false);
    expect(html).not.toMatch(/nhạc|music|<audio/i);
  });

  // RF-06D (Design Baseline B5 item 2): the envelope artwork stays decorative
  // inside the envelope button. Product Owner ruling: no visible skip control.
  it("the only anchors are map links; the envelope artwork is decorative inside the RF-06D controls", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    expect(count(html, "<a ")).toBe(count(html, COPY.events.mapLink));
    const opening = block(html, "<header");
    expect(opening).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(opening).not.toMatch(/<a /);
    expect(opening).not.toMatch(/<svg[^>]*(tabindex|role="button")/);
    expect([...opening.matchAll(/<button type="button"[^>]*aria-label="([^"]*)"/g)].map((match) => match[1])).toStrictEqual([
      COPY.opening.openEnvelope,
    ]);
    expect([...opening.matchAll(/<button type="button"[^>]*>([^<]*)<\/button>/g)].map((match) => match[1])).toStrictEqual([]);
    expect(opening).not.toContain("Bỏ qua");
  });
});

describe("content safety", () => {
  it.each(INVITATION_VARIANTS)("%s: no prototype fiction, internal fields or forbidden semantics", async (variant) => {
    const { html, viewModel } = await renderFixture({ variant, guest: FIXTURE_GUESTS.PLAYFUL });
    const canonical = JSON.stringify(viewModel);
    // "Hôn nhân là chuyện cả đời." is approved Task029 copy (Design Baseline B5 item 6), no longer fiction.
    // "Đếm ngược" and "Chạm vào thiệp để mở" are approved Task029 copy rendered by RF-06D islands (B6),
    // no longer fiction; "Hẹn ngày chung vui" was implementation copy and must never appear.
    // "Dress code" is now canonical Dress Code section copy (RF7 Dress Code amendment), no longer fiction.
    for (const fiction of ["Đà Nẵng", "Hẹn ngày chung vui", "❧", "Rất hân hạnh"]) {
      if (!canonical.includes(fiction)) expect(html, fiction).not.toContain(fiction);
    }
    // P1-UX-03 follow-up: the Task029 engraved 囍 seal mark is vector strokes, never text,
    // so the glyph appears nowhere in the markup unless canonical data carries it.
    if (!canonical.includes("囍")) {
      expect(count(html, "囍")).toBe(0);
    }
    expect(html).not.toMatch(/additional_?note|additionalNote/i);
    expect(html).not.toMatch(/\bMAYBE\b|QR_COMMON|commonMediaId/);
    expect(html).not.toMatch(/prototypes|_directions|--frame-width/);
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(html).not.toContain(viewModel.template.rendererKey);
    expect(html).not.toContain(viewModel.project.code);
  });

  it("Đà Nẵng appears only where the canonical fixture data carries it", async () => {
    const { html, viewModel } = await renderFixture({ variant: "BRIDE" });
    expect(JSON.stringify(viewModel)).toContain("Đà Nẵng");
    const hero = block(html, 'aria-label="Save the date"');
    expect(hero).not.toContain("Đà Nẵng");
    const opening = block(html, "<header");
    expect(opening).not.toContain("Đà Nẵng");
  });

  it("additional_note never reaches the ViewModel or the markup", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "COMMON" });
    const withNote = { ...input, weddingDetails: { ...input.weddingDetails, additionalNote: "GHI CHÚ NỘI BỘ" } };
    const { html } = await renderSource(withNote as BuildSnapshotPayloadInput);
    expect(html).not.toContain("GHI CHÚ NỘI BỘ");
  });
});

describe("Task029 static sections (Design Baseline B5)", () => {
  it("opening: Task029 label, one-line names with an inline &, dotted date, no guest line", async () => {
    const { html } = await renderFixture({ variant: "BRIDE", guest: FIXTURE_GUESTS.NORMAL });
    const opening = block(html, "<header");
    expect(opening).toContain(">Thiệp Mời Cưới</p>");
    expect(opening).toMatch(/<h1[^>]*><span[^>]*>Ngọc Hân<\/span> &amp; <span[^>]*>Minh Khôi<\/span><\/h1>/);
    expect(opening).toContain(">17.10.2026</p>");
    expect(opening).not.toMatch(/data-guest|Trân trọng kính mời/);
  });

  it("opening envelope: the approved Task029 body/flap/seal rasters on the card frame, no legacy envelope", async () => {
    const { html } = await renderFixture({ variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL });
    const opening = block(html, "<header");
    const envelope = opening.slice(opening.indexOf("<svg"), opening.lastIndexOf("</svg>") + "</svg>".length);
    expect(envelope).toMatch(/^<svg class="[^"]*envelope[^"]*" viewBox="0 0 300 200" aria-hidden="true" focusable="false">/);
    const hrefs = [...envelope.matchAll(/<image [^>]*href="([^"]*)"/g)].map((match) => match[1]);
    expect(hrefs).toStrictEqual(
      [
        "opening-cover-card-frame.svg",
        "opening-envelope-body.webp",
        "opening-envelope-flap.webp",
        "opening-envelope-seal.webp",
      ].map((file) => `/renderers/wedding/elegant-editorial/v1/${file}`),
    );
    // Task029 assembly on the 3:2 canvas: full-canvas body, offset 95.89% flap, 22% seal at 50% / 71%.
    expect(envelope).toMatch(/envelopeBody[^"]*" href="[^"]*opening-envelope-body\.webp" x="0" y="0" width="300" height="200"/);
    expect(envelope).toMatch(/envelopeFlapFace[^"]*" href="[^"]*opening-envelope-flap\.webp" x="6\.24" y="-14\.64" width="287\.67" height="191\.78"/);
    expect(envelope).toMatch(/envelopeSealFace[^"]*" href="[^"]*opening-envelope-seal\.webp" x="117" y="109" width="66" height="66"/);
    // The RF-06D choreography hooks stay on the flap group and the seal group.
    expect(envelope).toMatch(/<g class="[^"]*envelopeFlap[^"]*"><image class="[^"]*envelopeFlapFace/);
    expect(envelope).toMatch(/<g class="[^"]*envelopeSeal[^"]*"><image class="[^"]*envelopeSealFace/);
    expect(envelope).not.toMatch(/envelopeLiner|opening-envelope-[a-z]+\.svg|opening-seal-double-happiness/);
    // The runtime cover photograph is never baked into the envelope artwork.
    expect(envelope).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.COVER));
    // The only vector shapes are the seal's 囍 engraving; no legacy hand-drawn envelope.
    const withoutSealMark = envelope.replace(sealMarkOf(envelope), "");
    expect(withoutSealMark).not.toMatch(/<(rect|circle|ellipse|path)\b|envelopeSealLeaf|envelopeSealRing|envelopeSealStem|envelopeFold/);
  });

  // P1-UX-03 follow-up: the 囍 on the approved blank seal raster was system-font <text> placed
  // by dominant-baseline="central", so it sat off-centre on iOS. It is now repository-authored
  // vector geometry at fixed coordinates, independent of any installed font.
  it("opening seal: the 囍 engraving is font-independent vector geometry inside the animated seal group", async () => {
    const { html } = await renderFixture({ variant: "GROOM", guest: FIXTURE_GUESTS.NORMAL });
    const opening = block(html, "<header");
    const envelope = opening.slice(opening.indexOf("<svg"), opening.lastIndexOf("</svg>") + "</svg>".length);
    const sealGroup = envelope.slice(envelope.search(/<g class="[^"]*envelopeSeal[^"]*"><image/));
    // Exactly the approved raster, unchanged position/size, then the engraving in the same group.
    expect([...sealGroup.matchAll(/<image [^>]*href="([^"]*)"/g)].map((match) => match[1])).toStrictEqual([
      "/renderers/wedding/elegant-editorial/v1/opening-envelope-seal.webp",
    ]);
    const mark = sealMarkOf(envelope);
    expect(sealGroup).toContain(mark);
    expect(sealGroup.indexOf(mark)).toBeGreaterThan(sealGroup.indexOf("opening-envelope-seal.webp"));
    // No glyph, font or baseline dependency anywhere in the envelope artwork.
    expect(envelope).not.toMatch(/<text\b|<tspan\b|囍|font-family|font-size|dominant-baseline|text-anchor/);
    // Three layers (light lower edge, dark shadow, cut) of the same geometry, centred on (150, 142).
    const layers = [...mark.matchAll(/<g transform="translate\(139 ([\d.]+)\) scale\(0\.22\)" stroke="(#[0-9a-f]{6})"/g)];
    expect(layers.map((match) => [match[1], match[2]])).toStrictEqual([
      ["132.66", "#ffecbe"],
      ["130.66", "#46300c"],
      ["131.66", "#7a5a24"],
    ]);
    expect(count(mark, "<path ")).toBe(3);
    expect(count(mark, "<rect ")).toBe(12);
  });

  // Micro-Checkpoint 6 (RF7 Product Owner amendment): Task029 portrait blocks from media.portrait only.
  it("couple portraits: primary then secondary portrait block by explicit side, exact runtime URLs, never cover/gallery", async () => {
    for (const [variant, first, second] of [
      ["COMMON", "GROOM", "BRIDE"],
      ["GROOM", "GROOM", "BRIDE"],
      ["BRIDE", "BRIDE", "GROOM"],
    ] as const) {
      const { html } = await renderFixture({ variant, portraits: "PRESENT" });
      const couple = block(html, 'aria-labelledby="ee-couple-heading"');
      const blocks = [...couple.matchAll(/<div class="[^"]*couplePortraitBlock[^"]*" data-align="(start|end)" data-side="(\w+)">/g)].map((m) => [m[1], m[2]]);
      expect(blocks, variant).toStrictEqual([
        ["start", first],
        ["end", second],
      ]);
      expect(couple).not.toContain("couplePlate");
      const images = [...couple.matchAll(/<img [^>]*class="[^"]*couplePortrait[^"]*"[^>]*>/g)].map((m) => m[0]);
      const idFor = { GROOM: FIXTURE_MEDIA_IDS.PORTRAIT_GROOM, BRIDE: FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE } as const;
      expect(images.map((img) => /src="([^"]*)"/.exec(img)?.[1]), variant).toStrictEqual([
        fixtureMediaUrl(idFor[first]),
        fixtureMediaUrl(idFor[second]),
      ]);
      expect(images[0]).toContain(`alt="${first === "GROOM" ? "Ảnh chân dung chú rể Minh Khôi" : "Ảnh chân dung cô dâu Ngọc Hân"}"`);
      expect(images[0]).toMatch(/width="900" height="1200" loading="lazy"/);
      // Order inside the band: quote → primary block → floral strip → secondary block.
      expect(couple.indexOf("coupleQuote")).toBeLessThan(couple.indexOf('data-align="start"'));
      expect(couple.indexOf('data-align="start"')).toBeLessThan(couple.indexOf("portrait-divider-floral-strip.webp"));
      expect(couple.indexOf("portrait-divider-floral-strip.webp")).toBeLessThan(couple.indexOf('data-align="end"'));
      for (const other of [FIXTURE_MEDIA_IDS.COVER, FIXTURE_MEDIA_IDS.GALLERY_1, FIXTURE_MEDIA_IDS.GALLERY_2, FIXTURE_MEDIA_IDS.GALLERY_3]) {
        expect(couple).not.toContain(fixtureMediaUrl(other));
      }
    }
  });

  it("couple portraits: no portrait referenced → the typographic plates only, with no image frame", async () => {
    const { html, viewModel } = await renderFixture({ variant: "COMMON" });
    expect(viewModel.media.portrait).toStrictEqual({});
    const couple = block(html, 'aria-labelledby="ee-couple-heading"');
    expect(couple).not.toMatch(/couplePortrait/);
    expect(count(couple, "<img")).toBe(1); // the floral strip only
    expect(count(couple, "couplePlate")).toBe(2);
  });

  it("couple portraits: an UNAVAILABLE portrait falls back to that side's plate; the other side keeps its portrait", async () => {
    const { html } = await renderFixture({
      variant: "COMMON",
      portraits: "PRESENT",
      unavailableMediaIds: [FIXTURE_MEDIA_IDS.PORTRAIT_GROOM],
    });
    const couple = block(html, 'aria-labelledby="ee-couple-heading"');
    expect(couple).toMatch(/<div class="[^"]*couplePlate[^"]*" data-align="start" data-side="GROOM"><p[^>]*>Chú Rể<\/p><p[^>]*>Minh Khôi<\/p><\/div>/);
    expect(couple).toMatch(/<div class="[^"]*couplePortraitBlock[^"]*" data-align="end" data-side="BRIDE"><img /);
    expect(couple).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.PORTRAIT_GROOM));
    expect(count(couple, "<img")).toBe(2); // floral strip + bride portrait
  });

  it("couple portraits: Task029 portrait block CSS", () => {
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = (selector: string) => {
      const match = new RegExp(`\\}\\s*${selector.replace(/[.+()[\]="]/g, "\\$&")} \\{`).exec(css);
      expect(match, selector).not.toBeNull();
      const start = (match as RegExpExecArray).index;
      return css.slice(start + 1, css.indexOf("}", start + 1));
    };
    expect(rule(".couplePortraitBlock")).toMatch(/display: flex;\s*align-items: flex-end;\s*padding: 26px 24px 12px;/);
    expect(rule('.couplePortraitBlock[data-align="end"]')).toMatch(/flex-direction: row-reverse;\s*padding: 4px 24px 30px;/);
    expect(rule(".couplePortrait")).toMatch(/width: 62%;[\s\S]*aspect-ratio: 3 \/ 4;\s*object-fit: cover;/);
    expect(rule(".couplePortraitPlate")).toMatch(/padding: 0 16px 18px;/);
    expect(rule('.couplePortraitBlock[data-align="end"] .couplePortraitPlate')).toMatch(/align-items: flex-end;\s*text-align: right;/);
  });

  it("couple: Task029 quote, primary plate left, floral divider, secondary plate right, by explicit side", async () => {
    for (const [variant, first, second] of [
      ["COMMON", "GROOM", "BRIDE"],
      ["GROOM", "GROOM", "BRIDE"],
      ["BRIDE", "BRIDE", "GROOM"],
    ] as const) {
      const { html } = await renderFixture({ variant });
      const couple = block(html, 'aria-labelledby="ee-couple-heading"');
      expect(couple).toContain(">Hôn nhân là chuyện cả đời.</span>");
      expect(couple).toContain(">Yêu người vừa ý, cưới người mình thương.</span>");
      const plates = [...couple.matchAll(/data-align="(start|end)" data-side="(\w+)"><p[^>]*>([^<]*)<\/p>/g)].map((match) => [
        match[1],
        match[2],
        match[3],
      ]);
      expect(plates, variant).toStrictEqual([
        ["start", first, COPY.couple.roleBySide[first]],
        ["end", second, COPY.couple.roleBySide[second]],
      ]);
      expect(couple.indexOf('data-align="start"')).toBeLessThan(couple.indexOf("portrait-divider-floral-strip.webp"));
      expect(couple.indexOf("portrait-divider-floral-strip.webp")).toBeLessThan(couple.indexOf('data-align="end"'));
    }
    expect(COPY.couple.roleBySide).toStrictEqual({ GROOM: "Chú Rể", BRIDE: "Cô Dâu" });
  });

  it("families: fleuron ornament, parents only (no family address), central divider only between two columns", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    const families = block(html, 'aria-labelledby="ee-families-heading"');
    expect(count(families, 'src="/renderers/wedding/elegant-editorial/v1/ornament-fleuron.svg"')).toBe(1);
    expect(families).not.toContain("Đường Hoa Sữa");
    expect(families).not.toContain("Đường Phượng Vĩ");
    expect(count(families, "familyDivider")).toBe(1);
    expect(families.indexOf('data-side="BRIDE"')).toBeLessThan(families.indexOf("familyDivider"));
  });

  it("love story: dark band, gold quote mark and verbatim text, no visible heading or card", async () => {
    const { html, viewModel } = await renderFixture({ variant: "GROOM" });
    const story = block(html, 'aria-labelledby="ee-story-heading"');
    expect(html).toMatch(/<section class="[^"]*storyBand[^"]*" aria-labelledby="ee-story-heading">/);
    expect(story).toContain(`>${viewModel.content.loveStory as string}</p>`);
    expect(story).toMatch(/<h2 id="ee-story-heading" class="[^"]*srOnly/);
    expect(story).not.toMatch(/<img|background-image/);
  });

  it("gift: the Task029 note, no visible heading", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    const gift = block(html, 'aria-labelledby="ee-gift-heading"');
    expect(gift).toContain(
      ">Sự hiện diện của bạn là món quà quý giá nhất. Nếu muốn gửi quà chúc mừng, gia đình xin phép nhận tại đây.</p>",
    );
    expect(html).not.toContain("gửi lời chúc mừng");
    expect(gift).toMatch(/<h2 id="ee-gift-heading" class="[^"]*srOnly/);
  });

  it("closing: gold fleuron, one flowing Task029 paragraph, inline names and dotted date", async () => {
    const { html } = await renderFixture({ variant: "GROOM" });
    const closing = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    expect(closing).toContain('src="/renderers/wedding/elegant-editorial/v1/ornament-fleuron.svg"');
    expect(closing).toContain(
      ">Sự hiện diện của bạn là niềm hạnh phúc trọn vẹn nhất trong ngày cưới của chúng tôi. Xin chân thành cảm ơn.</p>",
    );
    expect(COPY.closing.line).not.toMatch(/\n/);
    expect(closing).toMatch(/<p class="[^"]*closingNames[^"]*"><span[^>]*>Minh Khôi<\/span><span[^>]*> &amp; <\/span><span[^>]*>Ngọc Hân<\/span><\/p>/);
    expect(closing).toContain(">18.10.2026</p>");
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8");
    expect(css).toMatch(/\.closingOrnament \{[^}]*filter: brightness\(0\)/);
    expect(css).not.toMatch(/\.closingLine \{[^}]*white-space/);
  });

  it("Great Vibes is used only for the couple quote and the calendar month", () => {
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const scriptRules = [...css.matchAll(/([^{}]+)\{[^{}]*var\(--ee-script\)[^{}]*\}/g)].map((match) => (match[1] as string).trim());
    // Design Baseline D7: the countdown passed state is not Great Vibes (RF-06D remediation).
    expect(scriptRules.sort()).toStrictEqual([".calendarMonth", ".coupleQuote"]);
  });
});

describe("determinism", () => {
  it("renders byte-identical markup for the same inputs", async () => {
    const a = await renderFixture({ variant: "COMMON", guest: FIXTURE_GUESTS.LONG });
    const b = await renderFixture({ variant: "COMMON", guest: FIXTURE_GUESTS.LONG });
    expect(a.html).toBe(b.html);
  });

  it("does not mutate the ViewModel or sections", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "BRIDE", guest: FIXTURE_GUESTS.NORMAL });
    const before = JSON.stringify({ viewModel, sections: selection.effectiveSections });
    render(Object.freeze(viewModel), Object.freeze(selection.effectiveSections));
    expect(JSON.stringify({ viewModel, sections: selection.effectiveSections })).toBe(before);
  });
});
