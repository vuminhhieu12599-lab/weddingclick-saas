import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS } from "../../../../../lib/domain";
import type { InvitationRendererCapabilitiesV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { buildRendererFixture } from "../../../../core/fixtures/renderer-fixture-pipeline";
import { FIXTURE_GUESTS } from "../../../../core/fixtures/renderer-fixture-sources";
import { INITIAL_OPENING_STATE, openingReducer, type OpeningState } from "../interactive/opening-state";

vi.mock("../fonts", () => ({ ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables" }));

const { ElegantEditorialV1 } = await import("../elegant-editorial-v1");
const { ELEGANT_EDITORIAL_V1_COPY: COPY } = await import("../copy");

/**
 * RF-06D opening interaction (docs/DECISIONS.md "RF-06-0 …" P7, P13):
 * pure state, initial server markup and the CSS reduced-motion contract.
 * Hydrated clicks are covered by the manual harness QA (no jsdom, P39).
 */

const V1_DIR = join(__dirname, "..");
const css = readFileSync(join(V1_DIR, "elegant-editorial-v1.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function header(html: string): string {
  return html.slice(html.indexOf("<header"), html.indexOf("</header>"));
}

describe("opening state (pure)", () => {
  it("starts SEALED; nothing opens without an explicit action", () => {
    expect(INITIAL_OPENING_STATE).toStrictEqual({ phase: "SEALED" });
    expect(Object.isFrozen(INITIAL_OPENING_STATE)).toBe(true);
  });

  it("OPEN plays the transition; SKIP opens instantly", () => {
    expect(openingReducer(INITIAL_OPENING_STATE, "OPEN")).toStrictEqual({ phase: "OPENED", motion: "TRANSITION" });
    expect(openingReducer(INITIAL_OPENING_STATE, "SKIP")).toStrictEqual({ phase: "OPENED", motion: "INSTANT" });
  });

  it("once opened, later actions change nothing (no re-seal, no replay)", () => {
    for (const first of ["OPEN", "SKIP"] as const) {
      const opened: OpeningState = openingReducer(INITIAL_OPENING_STATE, first);
      for (const next of ["OPEN", "SKIP"] as const) expect(openingReducer(opened, next)).toBe(opened);
    }
  });

  it("is pure: the same input always gives the same frozen output", () => {
    expect(openingReducer(INITIAL_OPENING_STATE, "OPEN")).toBe(openingReducer(INITIAL_OPENING_STATE, "OPEN"));
    expect(Object.isFrozen(openingReducer(INITIAL_OPENING_STATE, "SKIP"))).toBe(true);
  });
});

describe("opening markup (server render / first client render)", () => {
  it.each(INVITATION_VARIANTS)("%s: sealed envelope, explicit open + skip buttons, no guest line on the opening", async (variant) => {
    const { viewModel, selection } = await buildRendererFixture({ variant, guest: FIXTURE_GUESTS.NORMAL });
    const html = renderToStaticMarkup(
      <ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={{}} />,
    );
    const opening = header(html);
    expect(opening).toContain('data-opening="sealed"');
    expect(opening).not.toContain("data-motion");
    expect(opening).toMatch(/role="group" aria-label="Mở thiệp mời"/);
    expect([...opening.matchAll(/<button type="button"[^>]*>([^<]*)<\/button>/g)].map((match) => match[1])).toStrictEqual([
      COPY.opening.open,
      COPY.opening.skip,
    ]);
    // Content is semantically present before any interaction: the couple names (h1) are on the
    // opening. The guest line is never on the opening (frozen Design Baseline D1); its placement
    // before the invitation message is RF-06B static composition, asserted in elegant-editorial-v1.test.tsx.
    expect(opening).toMatch(/<h1[^>]*>/);
    expect(opening).not.toContain(FIXTURE_GUESTS.NORMAL.displayName);
    expect(opening).not.toContain(COPY.opening.salutation);
    expect(opening).not.toContain("data-guest");
    expect(html).toContain(FIXTURE_GUESTS.NORMAL.displayName);
    // The envelope stays decorative and never focusable.
    expect(opening).toMatch(/<svg[^>]*aria-hidden="true" focusable="false"/);
    // The rest of the invitation is rendered, not hidden behind the opening.
    for (const marker of ["ee-couple-heading", "ee-ceremony-heading", "ee-events-heading", "ee-closing-heading"]) {
      expect(html).toContain(marker);
    }
    expect(html).not.toMatch(/\sinert\b|aria-hidden="true"[^>]*><main|display:\s*none/);
  });

  it("the letter is the programmatic focus target after opening, never a tab stop", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    const opening = header(
      renderToStaticMarkup(<ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={{}} />),
    );
    expect(opening).toMatch(/<div class="[^"]*openingLetter[^"]*" tabindex="-1">/);
    expect(opening.match(/tabindex="[^"]*"/g)).toStrictEqual(['tabindex="-1"']);
  });

  it("rendering the opening never starts music, reads time or schedules a timer", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "GROOM" });
    const play = vi.fn(async () => {});
    const pause = vi.fn(async () => {});
    const capabilities: InvitationRendererCapabilitiesV1 = { music: { status: "PAUSED", play, pause } };
    const now = vi.spyOn(Date, "now");
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const interval = vi.spyOn(globalThis, "setInterval");
    renderToStaticMarkup(
      <ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={capabilities} />,
    );
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
  });
});

describe("opening source contract", () => {
  const island = readFileSync(join(V1_DIR, "interactive", "opening-interaction.tsx"), "utf8");
  const code = island.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("opens only from the two explicit click handlers, with no timer and no persistence", () => {
    expect(code.match(/onClick=\{\(\) => dispatch\("(OPEN|SKIP)"\)\}/g)).toStrictEqual([
      'onClick={() => dispatch("OPEN")}',
      'onClick={() => dispatch("SKIP")}',
    ]);
    expect(code.match(/dispatch\(/g)).toHaveLength(2);
    expect(code).not.toMatch(/setTimeout|setInterval|requestAnimationFrame|localStorage|sessionStorage|cookie|music|play\(/);
  });

  it("moves focus to the letter only after opening (controls leave the DOM)", () => {
    expect(code).toMatch(/useEffect\(\(\) => \{\s*if \(opened\) letterRef\.current\?\.focus\(\);\s*\}, \[opened\]\);/);
    expect(code).toMatch(/\{opened \? null : \(/);
  });
});

describe("opening motion CSS (P13)", () => {
  it("the flap transition is finite and keyed on the opened state", () => {
    expect(css).toMatch(/\.openingStage \.envelopeFlap \{[^}]*transition: transform 900ms/);
    expect(css).toMatch(/\.openingStage\[data-opening="opened"\] \.envelopeFlap \{[^}]*transform: scaleY\(-0\.6\);/);
    expect(css).not.toMatch(/\binfinite\b|@keyframes|animation\s*:/);
  });

  it("skip has no transition at all", () => {
    const rule = /((?:\.openingStage\[data-motion="instant"\] [^,{]+,?\s*)+)\{\s*transition: none;\s*\}/.exec(css);
    expect(rule).not.toBeNull();
    for (const part of ["envelopeFlap", "envelopeSeal", "envelopeSealRing", "envelopeSealLeaf", "envelopeSealStem"]) {
      expect(rule?.[1]).toContain(`.openingStage[data-motion="instant"] .${part}`);
    }
  });

  it("prefers-reduced-motion removes the flap and seal transitions (no wait before content)", () => {
    const start = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(start).toBeGreaterThan(-1);
    const reduced = css.slice(start);
    for (const part of ["envelopeFlap", "envelopeSeal", "envelopeSealRing", "envelopeSealLeaf", "envelopeSealStem"]) {
      expect(reduced).toContain(`.openingStage .${part}`);
    }
    expect(reduced).toContain(".openingButton");
    expect(reduced).toMatch(/transition: none;/);
  });
});
