import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS } from "../../../../../lib/domain";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { InvitationRendererCapabilitiesV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { RendererEffectiveSections } from "../../../../../lib/invitation-rendering/renderer-selection";
import { buildRendererFixture } from "../../../../core/fixtures/renderer-fixture-pipeline";

vi.mock("../fonts", () => ({ ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables" }));

const deriveSpy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../../../../../lib/invitation-rendering/ceremony-countdown", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../lib/invitation-rendering/ceremony-countdown")>();
  return {
    ...actual,
    deriveCeremonyCountdownV1: (...args: Parameters<typeof actual.deriveCeremonyCountdownV1>) => {
      deriveSpy.calls += 1;
      return actual.deriveCeremonyCountdownV1(...args);
    },
  };
});

const { ElegantEditorialV1 } = await import("../elegant-editorial-v1");
const { ELEGANT_EDITORIAL_V1_COPY: COPY } = await import("../copy");
const { ceremonyCountdownDisplay } = await import("../interactive/countdown");

/**
 * RF-06D countdown presentation (docs/DECISIONS.md RF-05 K26–K29; "RF-06-0
 * …" P7 "Countdown", P36). The frozen RF-05C derivation itself is tested by
 * RF-05; this proves the renderer gates on the clock capability, uses that
 * helper, and presents its result faithfully.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  deriveSpy.calls = 0;
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function render(viewModel: InvitationViewModel, sections: RendererEffectiveSections, capabilities: InvitationRendererCapabilitiesV1) {
  return renderToStaticMarkup(<ElegantEditorialV1 viewModel={viewModel} sections={sections} capabilities={capabilities} />);
}

function countdownBlock(html: string): string {
  const start = html.indexOf('aria-labelledby="ee-countdown-heading"');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", start));
}

function parts(block: string): string[][] {
  return [...block.matchAll(/countdownValue[^"]*">([^<]*)<\/span><span class="[^"]*countdownLabel[^"]*">([^<]*)</g)].map(
    (match) => [match[1] as string, match[2] as string],
  );
}

async function fixture(variant: (typeof INVITATION_VARIANTS)[number] = "COMMON") {
  const { viewModel, selection } = await buildRendererFixture({ variant });
  return { viewModel, sections: selection.effectiveSections, target: Date.parse(viewModel.ceremony.startsAt) };
}

describe("capability gate (K29)", () => {
  it("no clock capability → no countdown and no derivation at all", async () => {
    const { viewModel, sections } = await fixture();
    const now = vi.spyOn(Date, "now");
    const html = render(viewModel, sections, {});
    expect(html).not.toContain("ee-countdown-heading");
    expect(html).not.toContain(COPY.countdown.heading);
    expect(deriveSpy.calls).toBe(0);
    expect(now).not.toHaveBeenCalled();
  });

  it("other capabilities alone never produce a countdown", async () => {
    const { viewModel, sections } = await fixture();
    const html = render(viewModel, sections, {
      music: { status: "PAUSED", play: async () => {}, pause: async () => {} },
      clipboard: { copyText: async () => ({ status: "SUCCESS" }) },
    });
    expect(html).not.toContain("ee-countdown-heading");
  });

  it("with a clock: rendered through the frozen RF-05C helper, reading no ambient time", async () => {
    const { viewModel, sections, target } = await fixture();
    const now = vi.spyOn(Date, "now");
    const html = render(viewModel, sections, { clock: { nowEpochMs: target - DAY } });
    expect(deriveSpy.calls).toBe(1);
    expect(now).not.toHaveBeenCalled();
    expect(countdownBlock(html)).toContain(`>${COPY.countdown.heading}</h2>`);
  });
});

describe("presentation of the frozen result (K28)", () => {
  it("future ceremony: every part unpadded (Task029, Design Baseline B5 item 12), fixed unit labels", async () => {
    const { viewModel, sections, target } = await fixture();
    const html = render(viewModel, sections, { clock: { nowEpochMs: target - (123 * DAY + 4 * HOUR + 5 * MINUTE + 6 * SECOND) } });
    const block = countdownBlock(html);
    expect(block).toContain('data-countdown="upcoming"');
    expect(block).toMatch(/<ol[^>]*role="timer"/);
    expect(parts(block)).toStrictEqual([
      ["123", COPY.countdown.units.days],
      ["4", COPY.countdown.units.hours],
      ["5", COPY.countdown.units.minutes],
      ["6", COPY.countdown.units.seconds],
    ]);
  });

  it("sub-second remainders truncate exactly like the frozen helper", async () => {
    const { viewModel, target } = await fixture();
    expect(ceremonyCountdownDisplay(viewModel.ceremony, { nowEpochMs: target - 999 })).toStrictEqual({
      state: "UPCOMING",
      parts: [
        { unit: "days", value: "0" },
        { unit: "hours", value: "0" },
        { unit: "minutes", value: "0" },
        { unit: "seconds", value: "0" },
      ],
    });
    expect(ceremonyCountdownDisplay(viewModel.ceremony, { nowEpochMs: target - 1000 })).toMatchObject({
      state: "UPCOMING",
      parts: [{ value: "0" }, { value: "0" }, { value: "0" }, { value: "1" }],
    });
  });

  it("boundary: at the exact target the fixed passed copy replaces the numbers", async () => {
    const { viewModel, sections, target } = await fixture();
    const block = countdownBlock(render(viewModel, sections, { clock: { nowEpochMs: target } }));
    expect(block).toContain('data-countdown="passed"');
    // Design Baseline D7: the passed copy takes the kicker line; the live kicker is gone.
    expect(block).toContain(`>${COPY.countdown.passed}</h2>`);
    expect(block).not.toContain(COPY.countdown.heading);
    expect(block).not.toContain("role=\"timer\"");
  });

  it("past ceremony: fixed passed copy, never negative values", async () => {
    const { viewModel, sections, target } = await fixture();
    const block = countdownBlock(render(viewModel, sections, { clock: { nowEpochMs: target + 400 * DAY } }));
    expect(block).toContain(`>${COPY.countdown.passed}</h2>`);
    expect(block).not.toMatch(/-\d|countdownValue/);
  });

  it("a new nowEpochMs is a new rendered value (each clock refresh rerenders)", async () => {
    const { viewModel, sections, target } = await fixture();
    const a = parts(countdownBlock(render(viewModel, sections, { clock: { nowEpochMs: target - 10 * SECOND } })));
    const b = parts(countdownBlock(render(viewModel, sections, { clock: { nowEpochMs: target - 9 * SECOND } })));
    expect(a[3]).toStrictEqual(["10", COPY.countdown.units.seconds]);
    expect(b[3]).toStrictEqual(["9", COPY.countdown.units.seconds]);
  });
});

describe("target is the variant's canonical ceremony (Rule of Three)", () => {
  it.each(INVITATION_VARIANTS)("%s: counts to viewModel.ceremony.startsAt only", async (variant) => {
    const { viewModel, sections, target } = await fixture(variant);
    // COMMON/GROOM: 2026-10-18 09:00, BRIDE: 2026-10-17 09:00 (Asia/Ho_Chi_Minh).
    expect(viewModel.ceremony.startsAt).toBe(variant === "BRIDE" ? "2026-10-17T02:00:00.000Z" : "2026-10-18T02:00:00.000Z");
    const block = countdownBlock(render(viewModel, sections, { clock: { nowEpochMs: target - 2 * HOUR } }));
    expect(parts(block).map(([value]) => value)).toStrictEqual(["0", "2", "0", "0"]);
    // One hour after the (earlier) BRIDE ceremony, COMMON/GROOM still count down.
    const brideTarget = Date.parse("2026-10-17T02:00:00.000Z");
    const later = countdownBlock(render(viewModel, sections, { clock: { nowEpochMs: brideTarget + HOUR } }));
    expect(later.includes(COPY.countdown.passed)).toBe(variant === "BRIDE");
  });

  it("machine timezone never changes the result (absolute duration)", async () => {
    const { viewModel, target } = await fixture();
    const before = ceremonyCountdownDisplay(viewModel.ceremony, { nowEpochMs: target - 3 * DAY - 7 * HOUR });
    vi.stubEnv("TZ", "America/Los_Angeles");
    const after = ceremonyCountdownDisplay(viewModel.ceremony, { nowEpochMs: target - 3 * DAY - 7 * HOUR });
    vi.unstubAllEnvs();
    expect(after).toStrictEqual(before);
  });

  it("a non-finite clock is a programming fault from the frozen helper, never a fabricated countdown", async () => {
    const { viewModel } = await fixture();
    expect(() => ceremonyCountdownDisplay(viewModel.ceremony, { nowEpochMs: Number.NaN })).toThrow(RangeError);
  });
});

describe("Task029 countdown presentation (Design Baseline B5 item 12, B6, D7)", () => {
  const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("exact copy: kicker \"Đếm ngược\", passed \"Ngày vui đã đến\"; \"Hẹn ngày chung vui\" is gone", async () => {
    expect(COPY.countdown.heading).toBe("Đếm ngược");
    expect(COPY.countdown.passed).toBe("Ngày vui đã đến");
    expect(JSON.stringify(COPY)).not.toContain("Hẹn ngày chung vui");
    const { viewModel, sections, target } = await fixture();
    for (const nowEpochMs of [target - DAY, target + DAY]) {
      expect(render(viewModel, sections, { clock: { nowEpochMs } })).not.toContain("Hẹn ngày chung vui");
    }
    const live = countdownBlock(render(viewModel, sections, { clock: { nowEpochMs: target - DAY } }));
    expect(live).toMatch(/<h2 id="ee-countdown-heading" class="[^"]*countdownKicker[^"]*">Đếm ngược<\/h2>/);
  });

  it("ivory section, unboxed cells with a gold top rule, kicker typography (never Great Vibes) for both states", () => {
    expect(css).toMatch(/\.countdown \{[^}]*background-color: var\(--ee-background\);/);
    const cell = /\.countdownCell \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(cell).toMatch(/border-top: 1px solid color-mix\(in srgb, var\(--ee-gold\) 50%, transparent\);/);
    expect(cell).not.toMatch(/border(-radius)?:|background/);
    const kicker = /\.countdownKicker \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(kicker).toMatch(/font-family: var\(--ee-sans\);/);
    expect(kicker).toMatch(/text-transform: uppercase;/);
    expect(css).not.toMatch(/\.countdown[A-Za-z]*[^{]*\{[^}]*var\(--ee-script\)/);
  });
});
