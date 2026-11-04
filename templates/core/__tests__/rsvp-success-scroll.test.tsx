import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * WC-RSVP-MOBILE-SCROLL-01 — the recorded response is brought into view
 * (docs/DECISIONS.md "WC-RSVP-MOBILE-SCROLL-01 …").
 *
 * THE DEFECT. Se Duyên's RSVP card is taller than a phone screen and its
 * submit button is the last control on it, so a guest taps it with the top
 * of the card far above the viewport. The SUCCESS branch is a much shorter
 * card, and nothing moved the page: the collapse left the thank-you above
 * the screen and the wedding-gift envelope that follows it in view, so a
 * guest on 360–430px could not see that the response had been recorded.
 *
 * HOW THE SUCCESS STATE AND ITS EFFECT ARE REACHED HERE. The phase lives in
 * the island's own `useReducer` and the repository has no DOM test
 * environment, so these tests substitute the three hooks that hold the
 * phase, the card ref and the effect, then render the island for real
 * through `react-dom/server` and run the effect it registered against a
 * recording stand-in for the card. Everything asserted below is therefore
 * the island's actual SUCCESS markup and its actual effect body, not a regex
 * over its source. The capability is never called, and neither the showroom
 * demo nor the internal harness is touched: both keep answering the honest
 * `UNAVAILABLE` (P30/P33), so no surface can ever claim a false success.
 */

const hooks = vi.hoisted(() => ({
  /** `null` → the real `useReducer`; otherwise the phase the island starts in. */
  phase: null as string | null,
  /** `undefined` → the real `useRef(null)`; otherwise what `doneCardRef` holds. */
  card: undefined as unknown,
  /** Every effect the island registered while rendering, in registration order. */
  effects: [] as (() => void)[],
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const useReducer = (reducer: unknown, init: unknown, ...rest: unknown[]) =>
    hooks.phase !== null && init === "IDLE"
      ? [hooks.phase, () => {}]
      : (actual.useReducer as (...args: unknown[]) => unknown)(reducer, init, ...rest);
  // The island's one null-initialized ref is the thank-you card's.
  const useRef = (init: unknown) =>
    hooks.card !== undefined && init === null ? { current: hooks.card } : (actual.useRef as (value: unknown) => unknown)(init);
  const useEffect = (effect: () => void) => {
    hooks.effects.push(effect);
  };
  return { ...actual, useReducer, useRef, useEffect } as unknown as typeof actual;
});

afterEach(() => {
  hooks.phase = null;
  hooks.card = undefined;
  hooks.effects.length = 0;
});

/** A stand-in for the card element, recording exactly what the island asks of it. */
function recordingCard() {
  const calls: { readonly method: string; readonly arg: unknown }[] = [];
  return {
    calls,
    scrollIntoView: (arg: unknown) => calls.push({ method: "scrollIntoView", arg }),
    focus: (arg: unknown) => calls.push({ method: "focus", arg }),
  };
}

type RsvpIsland = { Rsvp: (props: { rsvp: { submit: unknown } }) => React.ReactNode };

const WEDDING = join(__dirname, "..", "..", "wedding");

interface Version {
  readonly label: string;
  readonly dir: string;
  readonly css: string;
  readonly island: () => Promise<RsvpIsland>;
}

/** Both published Se Duyên versions; v2 is v1's RSVP card with its own copy and stylesheet. */
const VERSIONS: readonly Version[] = [
  {
    label: "se-duyen v1",
    dir: "se-duyen/v1",
    css: "se-duyen-v1.module.css",
    island: async () => (await import("../../wedding/se-duyen/v1/interactive/rsvp")) as unknown as RsvpIsland,
  },
  {
    label: "se-duyen v2",
    dir: "se-duyen/v2",
    css: "se-duyen-v2.module.css",
    island: async () => (await import("../../wedding/se-duyen/v2/interactive/rsvp")) as unknown as RsvpIsland,
  },
];

const CASES = VERSIONS.map((version) => [version.label, version] as const);

/** Every settled outcome that is NOT a recorded response, plus the two unsettled ones. */
const NOT_SUCCESS = ["IDLE", "PENDING", "INVALID", "UNAVAILABLE", "FAILED"] as const;

/** Renders the island at `phase` and returns its markup; the capability is never called. */
async function render(version: Version, phase: string | null): Promise<string> {
  hooks.phase = phase;
  const { Rsvp } = await version.island();
  const rsvp = { submit: vi.fn(async () => ({ status: "SUCCESS" }) as const) };
  const html = renderToStaticMarkup(<Rsvp rsvp={rsvp} />);
  expect(rsvp.submit, "rendering must never submit").not.toHaveBeenCalled();
  return html;
}

/** Renders at `phase` with a recording card, runs every registered effect, returns the calls. */
async function runEffects(version: Version, phase: string | null) {
  const card = recordingCard();
  hooks.card = card;
  await render(version, phase);
  expect(hooks.effects.length, "the island registered its effect").toBeGreaterThan(0);
  for (const effect of hooks.effects) effect();
  return card.calls;
}

/** The open tag carrying `tabindex="-1"`, whatever the attribute order. */
function tabbableTagOf(html: string): string {
  const at = html.indexOf('tabindex="-1"');
  expect(at, 'no element carries tabindex="-1"').toBeGreaterThan(-1);
  const open = html.lastIndexOf("<", at);
  return html.slice(open, html.indexOf(">", at) + 1);
}

const cssOf = (version: Version) => readFileSync(join(WEDDING, version.dir, version.css), "utf8");

// ---------------------------------------------------------------------------
// A. The defect: a recorded response collapses the card it was answered on
// ---------------------------------------------------------------------------

describe("A. the SUCCESS card is a collapse of the form", () => {
  it.each(CASES)("%s drops the whole form once the response is recorded", async (_label, version) => {
    const form = await render(version, null);
    expect(form).toContain("<form");
    expect(form).toContain("<input");
    expect(form).toContain("<textarea");

    const done = await render(version, "SUCCESS");
    // Nothing a guest answers on survives, which is why the card shortens.
    expect(done).not.toContain("<form");
    expect(done).not.toContain("<input");
    expect(done).not.toContain("<textarea");
    expect(done).toContain("rsvpDone");
  });
});

// ---------------------------------------------------------------------------
// B. The target: the thank-you card is what the island can move to
// ---------------------------------------------------------------------------

describe("B. the thank-you card is the scroll and focus target", () => {
  it.each(CASES)("%s gives the recorded-response card a script-only focus target", async (_label, version) => {
    const html = await render(version, "SUCCESS");
    const tag = tabbableTagOf(html);
    // The target is the card itself, so the whole thank-you comes into view
    // with it — not just the edit action at its foot.
    expect(tag).toContain("rsvpCard");
    expect(tag.startsWith("<div")).toBe(true);
    // -1 keeps it out of the tab order: it is reachable by script only.
    expect(html.match(/tabindex="-1"/g)).toHaveLength(1);
    expect(html).not.toContain('tabindex="0"');
  });

  it.each(CASES)("%s adds no focus target and no tab stop before SUCCESS", async (_label, version) => {
    for (const phase of NOT_SUCCESS) {
      const html = await render(version, phase === "IDLE" ? null : phase);
      expect(html, phase).not.toContain("tabindex");
    }
  });
});

// ---------------------------------------------------------------------------
// C. The behaviour: only a recorded response moves the page
// ---------------------------------------------------------------------------

describe("C. the island moves the page on SUCCESS and on nothing else", () => {
  it.each(CASES)("%s brings the card into view and takes focus, in that order", async (_label, version) => {
    const calls = await runEffects(version, "SUCCESS");
    expect(calls.map((call) => call.method)).toStrictEqual(["scrollIntoView", "focus"]);
    // `nearest` scrolls only as far as it must, so a screen the collapse
    // never pushed the card off does not jump. No `behavior` is passed, so
    // the scroll is the platform's instant one under every motion
    // preference (the stylesheets set no `scroll-behavior: smooth`).
    expect(calls[0]?.arg).toStrictEqual({ block: "nearest" });
    // Focus must not scroll a second time: the scroll above already placed the card.
    expect(calls[1]?.arg).toStrictEqual({ preventScroll: true });
  });

  it.each(CASES)("%s moves nothing on an unsettled, invalid, unavailable or failed submission", async (_label, version) => {
    for (const phase of NOT_SUCCESS) {
      const calls = await runEffects(version, phase === "IDLE" ? null : phase);
      expect(calls, phase).toStrictEqual([]);
      hooks.effects.length = 0;
    }
  });

  it.each(CASES)("%s is safe when the card is not mounted", async (_label, version) => {
    // The real `useRef(null)`: `current` is null, as it is on the very first
    // render and after the edit action returns to the form.
    await render(version, "SUCCESS");
    expect(() => {
      for (const effect of hooks.effects) effect();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// D. Where the scroll lands
// ---------------------------------------------------------------------------

describe("D. the stylesheets give the card its gap and no smooth scrolling", () => {
  it.each(CASES)("%s leaves room above the card it scrolls to", (_label, version) => {
    const css = cssOf(version);
    const gap = /\.rsvpCard \{[^}]*scroll-margin-top:\s*(\d+)px/.exec(css);
    expect(gap, "no .rsvpCard rule carries scroll-margin-top").not.toBeNull();
    expect(Number((gap as RegExpExecArray)[1])).toBeGreaterThan(0);
  });

  it.each(CASES)("%s never asks for smooth scrolling, so the restore is instant", (_label, version) => {
    expect(cssOf(version)).not.toMatch(/scroll-behavior/);
  });
});
