import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS, type InvitationVariant } from "../../../../../lib/domain";
import type { InvitationRendererCapabilitiesV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { RendererEffectiveSections } from "../../../../../lib/invitation-rendering/renderer-selection";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
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

describe("guest line", () => {
  it("personalized: salutation + displayName", async () => {
    const { html } = await renderFixture({ variant: "COMMON", guest: FIXTURE_GUESTS.NORMAL });
    const opening = block(html, "<header");
    expect(opening).toContain(COPY.opening.salutation);
    expect(opening).toContain(FIXTURE_GUESTS.NORMAL.displayName);
    expect(opening).toContain('data-guest="personalized"');
    expect(opening).not.toContain(COPY.opening.defaultGuest);
  });

  it("unpersonalized: fixed v1 copy, no guest name", async () => {
    const { html } = await renderFixture({ variant: "GROOM" });
    const opening = block(html, "<header");
    expect(opening).toContain(COPY.opening.salutation);
    expect(opening).toContain(COPY.opening.defaultGuest);
    expect(opening).toContain('data-guest="unpersonalized"');
    for (const guest of Object.values(FIXTURE_GUESTS)) expect(html).not.toContain(guest.displayName);
  });

  it("long Vietnamese and playful names render complete, never truncated", async () => {
    for (const guest of [FIXTURE_GUESTS.LONG, FIXTURE_GUESTS.PLAYFUL]) {
      const { html } = await renderFixture({ variant: "COMMON", guest });
      expect(html).toContain(`>${guest.displayName}</p>`);
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
      expect(block(html, "<header")).toContain("18 . 10 . 2026");
    }
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
    expect(events).toContain(">18:00<");
    expect(events).toContain("18/10/2026");
    expect(events).toContain("17/10/2026");
    expect(events).not.toContain(COPY.ceremony.lunarLabel);
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
    expect(marked).toMatch(/^[^<]*>(<svg[\s\S]*?<\/svg>)?<span[^>]*>18<\/span>/);
    // Monday 28 Sep 2026 is the first cell; 1 Oct 2026 (Thursday) is the fourth.
    const days = [...calendar.matchAll(/<td[^>]*data-in-month="(true|false)"[^>]*>([\s\S]*?)<\/td>/g)].map((match) => [
      match[1],
      match[2].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<span class="[^"]*srOnly[^"]*">[^<]*<\/span>/g, "").replace(/<[^>]*>/g, ""),
    ]);
    expect(days).toHaveLength(42);
    expect(days.filter(([inMonth]) => inMonth === "true").map(([, day]) => day)).toStrictEqual(
      Array.from({ length: 31 }, (_, index) => String(index + 1)),
    );
    expect(days.slice(0, 4)).toStrictEqual([
      ["false", "28"],
      ["false", "29"],
      ["false", "30"],
      ["true", "1"],
    ]);
    expect(calendar).toContain(`>${COPY.calendar.monthPrefix} 10<`);
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
  it("cover RESOLVED renders the runtime URL with a meaningful alt", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    const hero = block(html, 'data-media-state="resolved" aria-label');
    expect(hero).toContain(`src="${fixtureMediaUrl(FIXTURE_MEDIA_IDS.COVER)}"`);
    expect(hero).toMatch(/alt="Ảnh cưới của Nguyễn Minh Khôi và Trần Ngọc Hân"/);
  });

  it("cover UNAVAILABLE renders the honest typographic hero with no image", async () => {
    const { html } = await renderFixture({ variant: "GROOM", unavailableMediaIds: [FIXTURE_MEDIA_IDS.COVER] });
    const hero = block(html, 'data-media-state="unavailable"');
    expect(hero).not.toContain("<img");
    expect(hero).toContain(COPY.hero.kicker);
    expect(html).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.COVER));
  });

  it("cover absent renders the same typographic hero", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "GROOM" });
    input.media = input.media.filter((item) => item.mediaType !== "COVER");
    const { html } = await renderSource(input);
    const hero = block(html, 'data-media-state="absent"');
    expect(hero).not.toContain("<img");
    expect(hero).toContain(COPY.hero.kicker);
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
  });

  it("no media URL other than the ViewModel's is ever emitted", async () => {
    const { html } = await renderFixture({ variant: "COMMON" });
    const srcs = [...html.matchAll(/src="([^"]*)"/g)].map((match) => match[1]);
    for (const src of srcs) expect(src.startsWith("https://renderer-fixtures.invalid/media/")).toBe(true);
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
    for (const fiction of ["Đà Nẵng", "Dress code", "Đếm ngược", "Chạm vào thiệp để mở", "囍", "❧", "Hôn nhân là chuyện cả đời"]) {
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
