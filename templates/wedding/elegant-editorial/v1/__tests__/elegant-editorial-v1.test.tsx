import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS, type InvitationVariant } from "../../../../../lib/domain";
import type { InvitationRendererCapabilitiesV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { RendererEffectiveSections } from "../../../../../lib/invitation-rendering/renderer-selection";
import type { InvitationViewModel, MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { BuildSnapshotPayloadInput } from "../../../../../lib/invitation-rendering/snapshot-payload-types";
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
} from "../../../../core/fixtures/renderer-fixture-sources";

// next/font loaders only run under the Next compiler; the real configuration
// is proven by `npm run build` and by the source test in fonts-palette-copy.
vi.mock("../fonts", () => ({ ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables" }));

const { ElegantEditorialV1 } = await import("../elegant-editorial-v1");
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
    expect(h1).toContain(viewModel.people.primary.name);
    expect(h1).toContain(viewModel.people.secondary.name);
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
      COPY.message.heading,
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
      COPY.message.heading,
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
      "ee-message-heading",
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
    expect(couple.indexOf("Nguyễn Minh Khôi")).toBeLessThan(couple.indexOf("Trần Ngọc Hân"));
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
    expect(h1.indexOf("Nguyễn Minh Khôi")).toBeLessThan(h1.indexOf("Trần Ngọc Hân"));
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
    expect(h1.indexOf("Trần Ngọc Hân")).toBeLessThan(h1.indexOf("Nguyễn Minh Khôi"));
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

  it.each(INVITATION_VARIANTS)("%s: events render in ViewModel order", async (variant: InvitationVariant) => {
    const { html, viewModel } = await renderFixture({ variant });
    const events = block(html, 'aria-labelledby="ee-events-heading"');
    const positions = viewModel.events.map((event) => events.indexOf(`>${event.title}</h3>`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toStrictEqual(positions);
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

/** The Design Baseline D1 guest line paragraph. */
function guestLine(html: string): string {
  const start = html.lastIndexOf("<p", html.indexOf("data-guest="));
  return html.slice(start, html.indexOf("</p>", start) + "</p>".length);
}

describe("guest line (Design Baseline D1)", () => {
  it("personalized: exactly \"Trân trọng kính mời {displayName}\"", async () => {
    const { html } = await renderFixture({ variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL });
    const line = guestLine(html);
    expect(line).toContain('data-guest="personalized"');
    expect(line.replace(/<[^>]*>/g, "")).toBe(`Trân trọng kính mời ${FIXTURE_GUESTS.NORMAL.displayName}`);
    expect(html).not.toContain(COPY.opening.defaultGuest);
  });

  it("unpersonalized: exactly \"Trân trọng kính mời Quý khách\", no guest name", async () => {
    const { html } = await renderFixture({ variant: "GROOM" });
    const line = guestLine(html);
    expect(line).toContain('data-guest="unpersonalized"');
    expect(line.replace(/<[^>]*>/g, "")).toBe("Trân trọng kính mời Quý khách");
    for (const guest of Object.values(FIXTURE_GUESTS)) expect(html).not.toContain(guest.displayName);
  });

  it("sits immediately before the verbatim canonical message, never on the opening or the Hero", async () => {
    for (const variant of INVITATION_VARIANTS) {
      const { html, viewModel } = await renderFixture({ variant, guest: FIXTURE_GUESTS.NORMAL });
      const message = viewModel.content.invitationMessage as string;
      const section = block(html, 'aria-labelledby="ee-message-heading"');
      const afterLine = section.slice(section.indexOf(guestLine(html)) + guestLine(html).length);
      expect(afterLine).toMatch(new RegExp(`^<p class="[^"]*message[^"]*">${message}</p>$`));
      expect(block(html, "<header")).not.toMatch(/data-guest|Trân trọng kính mời|Anh Tuấn/);
      expect(block(html, 'aria-label="Save the date"')).not.toMatch(/data-guest|Trân trọng kính mời|Anh Tuấn/);
      expect(count(html, FIXTURE_GUESTS.NORMAL.displayName)).toBe(1);
    }
  });

  it("stays when the optional message section is off (the guest line is not an optional section)", async () => {
    const { html } = await renderFixture({ variant: "BRIDE", guest: FIXTURE_GUESTS.PLAYFUL, sectionSettings: { invitationMessage: false } });
    expect(html).not.toContain("ee-message-heading");
    expect(guestLine(html).replace(/<[^>]*>/g, "")).toBe(`Trân trọng kính mời ${FIXTURE_GUESTS.PLAYFUL.displayName}`);
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

  it("events show their own RF-05C local time (reception 18:00)", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    const events = block(html, 'aria-labelledby="ee-events-heading"');
    // Task029 "HH:mm - Weekday" and the dotted DD.MM.YYYY date.
    expect(events).toContain(">18:00 - Chủ Nhật<");
    expect(events).toContain(">12:00 - Thứ Bảy<");
    expect(events).toContain(">18.10.2026<");
    expect(events).toContain(">17.10.2026<");
    expect(events).not.toContain(COPY.ceremony.lunarLabel);
    expect(events).not.toContain("Nhằm ngày");
  });

  it("Design Baseline D6: COMMON tags only GROOM/BRIDE-side events; GROOM and BRIDE add no tags", async () => {
    const tags = (html: string) =>
      [...block(html, 'aria-labelledby="ee-events-heading"').matchAll(/<li class="[^"]*" data-side="(\w+)">(<p class="[^"]*eventTag[^"]*">([^<]*)<\/p>)?/g)].map(
        (match) => [match[1], match[3] ?? null],
      );
    const common = await renderFixture({ variant: "COMMON" });
    expect(tags(common.html)).toStrictEqual(
      common.viewModel.events.map((event) => [
        event.side,
        event.side === "COMMON" ? null : COPY.families.labelBySide[event.side],
      ]),
    );
    expect(tags(common.html).some(([side]) => side === "COMMON")).toBe(true);
    for (const variant of ["GROOM", "BRIDE"] as const) {
      const { html } = await renderFixture({ variant });
      expect(html, variant).not.toContain("eventTag");
    }
  });

  it("calendar: Monday-first headers, 42 cells in 6 rows, exactly one ceremony marker", async () => {
    const { html } = await renderFixture({ variant: "GROOM" });
    const calendar = block(html, 'aria-labelledby="ee-calendar-heading"');
    const headers = [...calendar.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]);
    expect(headers).toStrictEqual(["T2", "T3", "T4", "T5", "T6", "T7", "CN"]);
    expect(count(calendar, "<tr")).toBe(7);
    expect(count(calendar, "<td")).toBe(42);
    expect(count(calendar, 'data-ceremony-day="true"')).toBe(1);
    const marked = calendar.slice(calendar.indexOf('data-ceremony-day="true"'));
    expect(marked).toMatch(/^[^<]*>(<img [^>]*\/>)?<span[^>]*>18<\/span>/);
    // Monday 28 Sep 2026 is the first cell; 1 Oct 2026 (Thursday) is the fourth.
    const days = [...calendar.matchAll(/<td[^>]*data-in-month="(true|false)"[^>]*>([\s\S]*?)<\/td>/g)].map((match) => [
      match[1],
      match[2].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<span class="[^"]*srOnly[^"]*">[^<]*<\/span>/g, "").replace(/<[^>]*>/g, ""),
    ]);
    expect(days).toHaveLength(42);
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

  it("calendar: Task029 two-line intro, no visible year, production botanicals and heart", async () => {
    const { html } = await renderFixture({ variant: "GROOM" });
    const calendar = block(html, 'aria-labelledby="ee-calendar-heading"');
    expect(calendar).toMatch(/<span[^>]*>Đám cưới của chúng mình<\/span><span[^>]*>Sẽ diễn ra vào<\/span>/);
    expect(calendar.replace(/<table[\s\S]*<\/table>/, "")).not.toContain("2026");
    for (const file of ["calendar-botanical-top-left.webp", "calendar-botanical-bottom-right.webp", "calendar-heart.svg"]) {
      expect(count(calendar, `src="/renderers/wedding/elegant-editorial/v1/${file}"`), file).toBe(1);
    }
    const marked = calendar.slice(calendar.indexOf('data-ceremony-day="true"'));
    expect(marked).toMatch(/^[^>]*><img [^>]*src="\/renderers\/wedding\/elegant-editorial\/v1\/calendar-heart\.svg"[^>]*\/><span[^>]*>18<\/span>/);
  });

  it("lunar present: the exact fixed label \"Tức ngày\" beside the verbatim canonical value", async () => {
    for (const variant of INVITATION_VARIANTS) {
      const { html, viewModel } = await renderFixture({ variant });
      const lunar = viewModel.ceremony.lunarDateDisplay;
      expect(lunar).toMatch(/^Nhằm ngày \d{2} tháng \d{2} năm Bính Ngọ$/);
      expect(COPY.ceremony.lunarLabel).toBe("Tức ngày");
      const start = html.indexOf('data-lunar="present"');
      const line = html.slice(start, html.indexOf("</p>", start));
      const spans = [...line.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((match) => match[1]);
      // Two separate elements: the fixed label, then the canonical value unchanged (no parsing or rewording).
      expect(spans).toStrictEqual(["Tức ngày", lunar]);
      expect(count(html, lunar as string)).toBe(1);
      expect(count(html, "Tức ngày")).toBe(1);
      expect(html).not.toContain("Âm lịch");
    }
  });

  it("lunar null: the whole lunar line, label included, is omitted", async () => {
    for (const variant of INVITATION_VARIANTS) {
      const { html, viewModel } = await renderFixture({ variant, ceremonyLunar: "ABSENT" });
      expect(viewModel.ceremony.lunarDateDisplay).toBeNull();
      expect(html).not.toContain('data-lunar="present"');
      expect(html).not.toContain("Tức ngày");
      expect(html).not.toContain("Âm lịch");
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
  const OFF = { invitationMessage: false, loveStory: false, gallery: false, music: false, gift: false };

  it("all optional sections on", async () => {
    const { html, sections } = await renderFixture({ variant: "COMMON" });
    expect(sections).toStrictEqual({ invitationMessage: true, loveStory: true, gallery: true, music: true, gift: true });
    expect(html).toContain("Trân trọng kính mời quý khách đến chung vui cùng gia đình chúng tôi.");
    expect(html).toContain("Chúng tôi gặp nhau vào một chiều mưa.\nBa năm sau");
    expect(html).toContain('aria-labelledby="ee-gallery-heading"');
    expect(html).toContain('aria-labelledby="ee-gift-heading"');
  });

  it("each optional section can be turned off by staff settings", async () => {
    for (const key of ["invitationMessage", "loveStory", "gallery", "gift"] as const) {
      const { html, sections } = await renderFixture({ variant: "COMMON", sectionSettings: { [key]: false } });
      expect(sections[key]).toBe(false);
      const marker = {
        invitationMessage: "ee-message-heading",
        loveStory: "ee-story-heading",
        gallery: "ee-gallery-heading",
        gift: "ee-gift-heading",
      }[key];
      expect(html).not.toContain(marker);
    }
  });

  it("sections-minimal: only the non-optional blocks remain", async () => {
    const { html } = await renderFixture({ variant: "COMMON", sectionSettings: OFF });
    for (const marker of ["ee-message-heading", "ee-story-heading", "ee-gallery-heading", "ee-gift-heading"]) {
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

  it("invitation message and love story are text, never HTML", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "COMMON" });
    if (input.weddingDetails === null) throw new Error("fixture");
    input.weddingDetails = {
      ...input.weddingDetails,
      invitationMessage: "<b>đậm</b> {guest}",
      loveStory: "<script>x</script>",
    };
    const { html } = await renderSource(input);
    expect(html).toContain("&lt;b&gt;đậm&lt;/b&gt; {guest}");
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
      "Nguyễn Minh Khôi",
      " &amp; ",
      "Trần Ngọc Hân",
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
    // The UNAVAILABLE item keeps its canonical Task029 slot.
    expect([...gallery.matchAll(/data-slot="(\d)"/g)].map((match) => match[1])).toStrictEqual(["0", "1", "2"]);
  });

  it("gallery: Task029 10-slot cycle by canonical index, with the Design Baseline D9 lone-tail rule", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    const sections = selection.effectiveSections;
    const slotsFor = (total: number): string[] => {
      // Repeating the three fixture items is enough here: only slot assignment is under test.
      const gallery = Array.from({ length: total }, (_, index) => viewModel.media.gallery[index % 3] as MediaResolution);
      const html = render({ ...viewModel, media: { ...viewModel.media, gallery } }, sections);
      return [...block(html, 'aria-labelledby="ee-gallery-heading"').matchAll(/data-slot="(\d)"( data-span="full")?/g)].map(
        (match) => `${match[1]}${match[2] === undefined ? "" : "F"}`,
      );
    };
    expect(slotsFor(1)).toStrictEqual(["0"]);
    expect(slotsFor(2)).toStrictEqual(["0", "1F"]);
    expect(slotsFor(3)).toStrictEqual(["0", "1", "2"]);
    expect(slotsFor(4)).toStrictEqual(["0", "1", "2", "3F"]);
    expect(slotsFor(8)).toStrictEqual(["0", "1", "2", "3", "4", "5", "6", "7F"]);
    expect(slotsFor(12)).toStrictEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "1F"]);
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8");
    expect(css).toMatch(/\.gallery \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);[^}]*grid-auto-rows: 44px;/);
    expect(css).not.toMatch(/grid-auto-flow:\s*dense/);
  });

  it("emits only ViewModel media URLs plus the frozen Design Baseline A1 decor files", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    const srcs = [...html.matchAll(/src="([^"]*)"/g)].map((match) => match[1] as string);
    const decor = srcs.filter((src) => src.startsWith("/renderers/wedding/elegant-editorial/v1/"));
    const media = srcs.filter((src) => !decor.includes(src));
    for (const src of media) expect(src.startsWith("https://renderer-fixtures.invalid/media/"), src).toBe(true);
    expect([...new Set(decor)].sort()).toStrictEqual(
      [
        "calendar-botanical-bottom-right.webp",
        "calendar-botanical-top-left.webp",
        "calendar-heart.svg",
        "couple-floral-divider.webp",
        "ornament-fleuron.svg",
        "ornament-sparkle.svg",
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
    expect(count(gift, "<button")).toBe(2);
    expect(html).not.toMatch(/Sao chép|Đã sao chép/);
  });
});

describe("event map links", () => {
  it("renders an accessible link only where mapUrl exists", async () => {
    const { html, viewModel } = await renderFixture({ variant: "BRIDE" });
    const withMap = viewModel.events.filter((event) => event.mapUrl !== null);
    const withoutMap = viewModel.events.filter((event) => event.mapUrl === null);
    expect(withMap.length).toBeGreaterThan(0);
    expect(withoutMap.length).toBeGreaterThan(0);
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
// capability-independent RF-06D opening controls (2) and gift dialog entry
// and close buttons (2).
describe("no capability-driven UI without capabilities", () => {
  it.each(INVITATION_VARIANTS)("%s: no RSVP, music, countdown, clipboard or interactive control", async (variant) => {
    const { html, sections, viewModel } = await renderFixture({ variant, guest: FIXTURE_GUESTS.NORMAL });
    expect(sections.music).toBe(true);
    expect(viewModel.media.audio?.status).toBe("RESOLVED");
    expect(html).not.toMatch(/<(form|input|select|textarea|audio|video)\b/);
    expect(count(html, "<button")).toBe(4);
    expect(count(html, "<dialog")).toBe(1);
    expect(html).not.toMatch(/onclick|role="button"/i);
    expect(html.match(/tabindex="[^"]*"/g)).toStrictEqual(['tabindex="-1"']);
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

  // RF-06D replacement: the envelope stays decorative artwork; the opening
  // controls are the two real RF-06D buttons, never the artwork itself.
  it("the only anchors are map links; the envelope is artwork, the opening controls are real buttons", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    expect(count(html, "<a ")).toBe(count(html, COPY.events.mapLink));
    const opening = block(html, "<header");
    expect(opening).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(opening).not.toMatch(/Chạm|<a /);
    expect(opening).not.toMatch(/<svg[^>]*(tabindex|role="button")/);
    expect([...opening.matchAll(/<button type="button"[^>]*>([^<]*)<\/button>/g)].map((match) => match[1])).toStrictEqual([
      COPY.opening.open,
      COPY.opening.skip,
    ]);
  });
});

describe("content safety", () => {
  it.each(INVITATION_VARIANTS)("%s: no prototype fiction, internal fields or forbidden semantics", async (variant) => {
    const { html, viewModel } = await renderFixture({ variant, guest: FIXTURE_GUESTS.PLAYFUL });
    const canonical = JSON.stringify(viewModel);
    // "Hôn nhân là chuyện cả đời." is approved Task029 copy (Design Baseline B5 item 6), no longer fiction.
    // RF-06D-owned Task029 copy ("Đếm ngược", the tap hint) is not rendered by the static layer.
    for (const fiction of ["Đà Nẵng", "Dress code", "Đếm ngược", "Chạm vào thiệp để mở", "Hẹn ngày chung vui", "囍", "❧", "Rất hân hạnh"]) {
      if (!canonical.includes(fiction)) expect(html, fiction).not.toContain(fiction);
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
    expect(opening).toMatch(/<h1[^>]*><span[^>]*>Trần Ngọc Hân<\/span> &amp; <span[^>]*>Nguyễn Minh Khôi<\/span><\/h1>/);
    expect(opening).toContain(">17.10.2026</p>");
    expect(opening).not.toMatch(/data-guest|Trân trọng kính mời/);
  });

  it("opening envelope: the five frozen Design Baseline A1 opening files, no legacy inline envelope", async () => {
    const { html } = await renderFixture({ variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL });
    const opening = block(html, "<header");
    const envelope = opening.slice(opening.indexOf("<svg"), opening.lastIndexOf("</svg>") + "</svg>".length);
    expect(envelope).toMatch(/^<svg class="[^"]*envelope[^"]*" viewBox="0 0 300 200" aria-hidden="true" focusable="false">/);
    const hrefs = [...envelope.matchAll(/<image [^>]*href="([^"]*)"/g)].map((match) => match[1]);
    expect(hrefs).toStrictEqual(
      [
        "opening-cover-card-frame.svg",
        "opening-envelope-body.svg",
        "opening-envelope-liner.svg",
        "opening-envelope-flap.svg",
        "opening-seal-double-happiness.svg",
      ].map((file) => `/renderers/wedding/elegant-editorial/v1/${file}`),
    );
    // The RF-06D choreography hooks stay on the flap group and the seal.
    expect(envelope).toMatch(/<g class="[^"]*envelopeFlap[^"]*"><image class="[^"]*envelopeLiner/);
    expect(envelope).toMatch(/<image class="[^"]*envelopeSeal[^"]*"/);
    // The runtime cover photograph is never baked into the envelope artwork.
    expect(envelope).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.COVER));
    expect(envelope).not.toMatch(/<(rect|circle|ellipse|path)\b|envelopeSealLeaf|envelopeSealRing|envelopeSealStem|envelopeFold/);
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
      expect(couple.indexOf('data-align="start"')).toBeLessThan(couple.indexOf("couple-floral-divider.webp"));
      expect(couple.indexOf("couple-floral-divider.webp")).toBeLessThan(couple.indexOf('data-align="end"'));
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
      ">Sự hiện diện của bạn là món quà quý giá nhất. Nếu muốn gửi lời chúc mừng, gia đình xin phép nhận tại đây.</p>",
    );
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
    expect(closing).toMatch(/<p class="[^"]*closingNames[^"]*"><span[^>]*>Nguyễn Minh Khôi<\/span><span[^>]*> &amp; <\/span><span[^>]*>Trần Ngọc Hân<\/span><\/p>/);
    expect(closing).toContain(">18.10.2026</p>");
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8");
    expect(css).toMatch(/\.closingOrnament \{[^}]*filter: brightness\(0\)/);
    expect(css).not.toMatch(/\.closingLine \{[^}]*white-space/);
  });

  it("Great Vibes is used only for the couple quote and the calendar month", () => {
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const scriptRules = [...css.matchAll(/([^{}]+)\{[^{}]*var\(--ee-script\)[^{}]*\}/g)].map((match) => (match[1] as string).trim());
    // `.countdownPassed` is RF-06D-owned and deferred to the RF-06D remediation (Design Baseline D7).
    expect(scriptRules.sort()).toStrictEqual([".calendarMonth", ".countdownPassed", ".coupleQuote"]);
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
