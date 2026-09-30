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
  return [...block.matchAll(/countdownValue[^"]*">([^<]*)<\/span><span class="[^"]*countdownUnit[^"]*">([^<]*)</g)].map(
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
  it("future ceremony: days unpadded, hours/minutes/seconds two digits, fixed unit labels", async () => {
    const { viewModel, sections, target } = await fixture();
    const html = render(viewModel, sections, { clock: { nowEpochMs: target - (123 * DAY + 4 * HOUR + 5 * MINUTE + 6 * SECOND) } });
    const block = countdownBlock(html);
    expect(block).toContain('data-countdown="upcoming"');
    expect(block).toMatch(/<ol[^>]*role="timer"/);
    expect(parts(block)).toStrictEqual([
      ["123", COPY.countdown.units.days],
      ["04", COPY.countdown.units.hours],
      ["05", COPY.countdown.units.minutes],
      ["06", COPY.countdown.units.seconds],
    ]);
  });

  it("sub-second remainders truncate exactly like the frozen helper", async () => {
    const { viewModel, target } = await fixture();
    expect(ceremonyCountdownDisplay(viewModel.ceremony, { nowEpochMs: target - 999 })).toStrictEqual({
      state: "UPCOMING",
      parts: [
        { unit: "days", value: "0" },
        { unit: "hours", value: "00" },
        { unit: "minutes", value: "00" },
        { unit: "seconds", value: "00" },
      ],
    });
    expect(ceremonyCountdownDisplay(viewModel.ceremony, { nowEpochMs: target - 1000 })).toMatchObject({
      state: "UPCOMING",
      parts: [{ value: "0" }, { value: "00" }, { value: "00" }, { value: "01" }],
    });
  });

  it("boundary: at the exact target the fixed passed copy replaces the numbers", async () => {
    const { viewModel, sections, target } = await fixture();
    const block = countdownBlock(render(viewModel, sections, { clock: { nowEpochMs: target } }));
    expect(block).toContain('data-countdown="passed"');
    expect(block).toContain(`>${COPY.countdown.passed}</p>`);
    expect(block).not.toContain("role=\"timer\"");
  });

  it("past ceremony: fixed passed copy, never negative values", async () => {
    const { viewModel, sections, target } = await fixture();
    const block = countdownBlock(render(viewModel, sections, { clock: { nowEpochMs: target + 400 * DAY } }));
    expect(block).toContain(`>${COPY.countdown.passed}</p>`);
    expect(block).not.toMatch(/-\d|countdownValue/);
  });

  it("a new nowEpochMs is a new rendered value (each clock refresh rerenders)", async () => {
    const { viewModel, sections, target } = await fixture();
    const a = parts(countdownBlock(render(viewModel, sections, { clock: { nowEpochMs: target - 10 * SECOND } })));
    const b = parts(countdownBlock(render(viewModel, sections, { clock: { nowEpochMs: target - 9 * SECOND } })));
    expect(a[3]).toStrictEqual(["10", COPY.countdown.units.seconds]);
    expect(b[3]).toStrictEqual(["09", COPY.countdown.units.seconds]);
  });
});

describe("target is the variant's canonical ceremony (Rule of Three)", () => {
  it.each(INVITATION_VARIANTS)("%s: counts to viewModel.ceremony.startsAt only", async (variant) => {
    const { viewModel, sections, target } = await fixture(variant);
    // COMMON/GROOM: 2026-10-18 09:00, BRIDE: 2026-10-17 09:00 (Asia/Ho_Chi_Minh).
    expect(viewModel.ceremony.startsAt).toBe(variant === "BRIDE" ? "2026-10-17T02:00:00.000Z" : "2026-10-18T02:00:00.000Z");
    const block = countdownBlock(render(viewModel, sections, { clock: { nowEpochMs: target - 2 * HOUR } }));
    expect(parts(block).map(([value]) => value)).toStrictEqual(["0", "02", "00", "00"]);
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
