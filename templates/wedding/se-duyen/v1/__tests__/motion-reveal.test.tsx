import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  revealDelaysMs,
  startSectionReveal,
  type RevealElement,
  type RevealEnvironment,
} from "../../../../../lib/invitation-rendering/section-reveal-controller";

/**
 * SD-V1-MOTION-01 — the Se Duyên interior scroll reveal, "Tơ Hồng Khai
 * Duyên".
 *
 * What these tests defend is not the look of the motion but the three
 * promises underneath it: nothing a guest must read can ever be left
 * invisible; the approved resting design is unchanged; and the frozen box
 * opening is out of reach.
 */

// next/font loaders only run under the Next compiler; `npm run build` proves the real configuration.
vi.mock("../fonts", () => ({ SE_DUYEN_V1_FONT_VARIABLES_CLASS_NAME: "sd-test-font-variables" }));

const { SD_REVEAL_ATTRIBUTE, SD_REVEAL_STAGGER_MAX_STEPS, SD_REVEAL_STAGGER_MS, SD_REVEAL_TARGET_CLASSES, SD_REVEAL_TARGETS, SD_REVEAL_VARIANTS, SectionReveal, panelVariant } =
  await import("../interactive/section-reveal");
const { default: styles } = await import("../se-duyen-v1.module.css");

/** The island resolves every target through the CSS module; so does this test. */
const cls = (name: string): string => (styles as Record<string, string>)[name] ?? name;

const SD1 = join(process.cwd(), "templates", "wedding", "se-duyen", "v1");
const cssCode = readFileSync(join(SD1, "se-duyen-v1.module.css"), "utf8");

/** Just the SD-V1-MOTION-01 stylesheet section: everything from its banner on. */
const revealCss = cssCode.slice(cssCode.indexOf("SD-V1-MOTION-01 — interior scroll reveal"));
/**
 * The same section with all prose removed, so a comment can never be read as
 * a rule. The slice above starts inside the banner comment, so that banner's
 * remainder is dropped first, then any later comment.
 */
const revealRules = revealCss.slice(revealCss.indexOf("*/") + 2).replace(/\/\*[\s\S]*?\*\//g, "");
/** Rules only: keyframe steps (`from`, `58%`) are not selectors. */
const revealSelectorSource = revealRules.replace(/ {2}@keyframes[\s\S]*?\n {2}\}/g, "");

// ---------------------------------------------------------------------------
// Minimal fake DOM (the node test environment has none)
// ---------------------------------------------------------------------------

class FakeElement implements RevealElement {
  parentElement: FakeElement | null = null;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly properties = new Map<string, string>();
  order = 0;
  readonly style = {
    setProperty: (name: string, value: string) => void this.properties.set(name, value),
    removeProperty: (name: string) => void this.properties.delete(name),
  };

  constructor(readonly classNames: readonly string[]) {}

  get previousElementSibling(): FakeElement | null {
    const siblings = this.parentElement?.children ?? [];
    return siblings[siblings.indexOf(this) - 1] ?? null;
  }

  append(...children: FakeElement[]): this {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
    renumber(rootOf(this));
    return this;
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  matches(selectors: string) {
    return selectors.split(",").some((selector) => this.classNames.includes(selector.trim().replace(/^\./, "")));
  }
  querySelectorAll(selectors: string): FakeElement[] {
    const found: FakeElement[] = [];
    const visit = (node: FakeElement) => {
      for (const child of node.children) {
        if (child.matches(selectors)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  compareDocumentPosition(other: RevealElement) {
    return (other as FakeElement).order > this.order ? 4 : 2;
  }
}

function rootOf(node: FakeElement): FakeElement {
  return node.parentElement === null ? node : rootOf(node.parentElement);
}

function renumber(root: FakeElement) {
  let next = 0;
  const visit = (node: FakeElement) => {
    node.order = next++;
    node.children.forEach(visit);
  };
  visit(root);
}

const el = (name: string) => new FakeElement([cls(name)]);
const mark = (node: FakeElement) => node.getAttribute(SD_REVEAL_ATTRIBUTE);
const delayOf = (node: FakeElement) => node.properties.get("--sd-reveal-delay");

type Entry = { target: RevealElement; isIntersecting: boolean; boundingClientRect: { bottom: number } };

function fakeEnvironment() {
  const io = { callback: null as null | ((entries: Entry[]) => void), observed: new Set<RevealElement>(), disconnected: false };
  const environment: RevealEnvironment = {
    IntersectionObserver: class {
      constructor(callback: (entries: Entry[]) => void) {
        io.callback = callback;
      }
      observe(target: RevealElement) {
        io.observed.add(target);
      }
      unobserve(target: RevealElement) {
        io.observed.delete(target);
      }
      disconnect() {
        io.disconnected = true;
      }
    } as unknown as RevealEnvironment["IntersectionObserver"],
  };
  const report = (isIntersecting: boolean, bottom: number, targets: FakeElement[]) =>
    io.callback?.(targets.map((target) => ({ target, isIntersecting, boundingClientRect: { bottom } })));
  return { environment, io, enter: (...targets: FakeElement[]) => report(true, 500, targets), report };
}

const OPTIONS = {
  attribute: SD_REVEAL_ATTRIBUTE,
  delayProperty: "--sd-reveal-delay",
  staggerMs: SD_REVEAL_STAGGER_MS,
  maxStaggerSteps: SD_REVEAL_STAGGER_MAX_STEPS,
  rootMargin: "0px 0px -40px 0px",
};

const start = (column: FakeElement, environment: RevealEnvironment) =>
  startSectionReveal(column as unknown as RevealElement, environment, SD_REVEAL_TARGETS, OPTIONS);

describe("SD-V1-MOTION-01 reveal controller", () => {
  it("without IntersectionObserver nothing is ever marked, so nothing is ever hidden", () => {
    const lead = el("couplePhotoMain");
    const column = new FakeElement([cls("interior")]).append(lead);
    const controller = start(column, {});
    expect(mark(lead)).toBeNull();
    controller.rescan();
    expect(mark(lead)).toBeNull();
    controller.stop();
  });

  it("the two portraits meet: the lead swings in from the left, the aside answers from the right", () => {
    const lead = el("couplePhotoMain");
    const aside = el("couplePhotoAside");
    const column = new FakeElement([cls("interior")]).append(new FakeElement([cls("coupleFrames")]).append(lead, aside));
    const { environment, enter } = fakeEnvironment();
    start(column, environment);
    expect(mark(lead)).toBe("lead");
    expect(mark(aside)).toBe("aside");
    enter(lead, aside);
    expect(mark(lead)).toBe("lead shown");
    expect(mark(aside)).toBe("aside shown");
    // The lead is first in the DOM, so it also leads the stagger.
    expect(delayOf(lead)).toBe("0ms");
    expect(delayOf(aside)).toBe(`${String(SD_REVEAL_STAGGER_MS)}ms`);
  });

  it("panels arrive from their own side by DOM position alone, never by reading a side", () => {
    // COMMON: two houses and two rite cards part left and right.
    const first = el("house");
    const second = el("house");
    const cardA = el("ritePartyRow");
    const cardB = el("ritePartyRow");
    const column = new FakeElement([cls("interior")]).append(
      new FakeElement([cls("housesGrid")]).append(first, second),
      new FakeElement([cls("riteParties")]).append(cardA, cardB),
    );
    const { environment } = fakeEnvironment();
    start(column, environment);
    expect([mark(first), mark(second)]).toStrictEqual(["panelLeft", "panelRight"]);
    expect([mark(cardA), mark(cardB)]).toStrictEqual(["panelLeft", "panelRight"]);

    // GROOM / BRIDE: a single house or card simply arrives from the left.
    const only = el("house");
    const solo = new FakeElement([cls("interior")]).append(new FakeElement([cls("housesGrid")]).append(only));
    start(solo, fakeEnvironment().environment);
    expect(mark(only)).toBe("panelLeft");

    // The rule is positional: the island never reads a side, a label or a
    // variant, so it cannot change what COMMON, GROOM or BRIDE mean.
    const islandSource = readFileSync(join(SD1, "interactive", "section-reveal.tsx"), "utf8");
    expect(islandSource).not.toMatch(/data-side|["']GROOM["']|["']BRIDE["']|["']COMMON["']/);
    expect(typeof panelVariant).toBe("function");
  });

  it("reveals once, keeps its variant, and is never replayed", () => {
    const step = el("flowStep");
    const column = new FakeElement([cls("interior")]).append(step);
    const { environment, io, enter } = fakeEnvironment();
    start(column, environment);
    enter(step);
    expect(mark(step)).toBe("knot shown");
    expect(io.observed.has(step)).toBe(false);
    enter(step);
    expect(mark(step)).toBe("knot shown");
  });

  it("a target already scrolled past is revealed, never left hidden (fast scroll, or a jump down the page)", () => {
    const sign = el("closingSign");
    const column = new FakeElement([cls("interior")]).append(sign);
    const { environment, report } = fakeEnvironment();
    start(column, environment);
    // Not intersecting, and entirely above the viewport.
    report(false, -240, [sign]);
    expect(mark(sign)).toBe("foil shown");
  });

  it("staggers each batch in document order, restarts at 0 per batch and caps the wait", () => {
    const rows = Array.from({ length: 9 }, () => el("coupleRow"));
    const column = new FakeElement([cls("interior")]).append(...rows);
    const { environment, enter } = fakeEnvironment();
    start(column, environment);
    // Reported out of order; the controller sorts by document position.
    enter(...[...rows].reverse());
    expect(rows.map(delayOf)).toStrictEqual(
      revealDelaysMs(rows.length, SD_REVEAL_STAGGER_MS, SD_REVEAL_STAGGER_MAX_STEPS).map((ms) => `${String(ms)}ms`),
    );
    // Capped: nothing waits longer than the cap, however long the batch.
    expect(delayOf(rows[8] as FakeElement)).toBe(`${String(SD_REVEAL_STAGGER_MAX_STEPS * SD_REVEAL_STAGGER_MS)}ms`);
  });

  it("rescan picks up the late countdown, and stop removes every mark and delay", () => {
    const column = new FakeElement([cls("interior")]);
    const { environment, enter, io } = fakeEnvironment();
    const controller = start(column, environment);
    const dial = el("countdownDial");
    column.append(new FakeElement([cls("countdownDials")]).append(dial));
    expect(mark(dial)).toBeNull();
    controller.rescan();
    expect(mark(dial)).toBe("scale");
    enter(dial);
    expect(mark(dial)).toBe("scale shown");
    controller.stop();
    expect(mark(dial)).toBeNull();
    expect(delayOf(dial)).toBeUndefined();
    expect(io.disconnected).toBe(true);
  });
});

describe("SD-V1-MOTION-01 no-JS and server markup", () => {
  it("the island is inert: one hidden anchor, and no section ever writes a reveal attribute", () => {
    expect(renderToStaticMarkup(<SectionReveal hasCountdown={false} />)).toBe("<span hidden=\"\"></span>");

    // The attribute exists in exactly one source file: the island that owns it.
    const sources = [
      ...readdirSync(SD1).map((name) => join(SD1, name)),
      ...readdirSync(join(SD1, "sections")).map((name) => join(SD1, "sections", name)),
      ...readdirSync(join(SD1, "interactive")).map((name) => join(SD1, "interactive", name)),
    ].filter((file) => /\.tsx?$/.test(file));
    const writers = sources.filter((file) => readFileSync(file, "utf8").includes("data-sd-reveal"));
    expect(writers.map((file) => file.slice(SD1.length + 1))).toStrictEqual(["interactive/section-reveal.tsx"]);
  });

  it("the island is held back until the opening finishes, so the reveal is never spent behind the closed box", async () => {
    // While the box is closed the interior is `display: none`; every element
    // in it then reports a zero rectangle, which an IntersectionObserver
    // reports as already scrolled past. Mounted then, the whole invitation
    // would reveal at once behind the box and nothing would animate again.
    const { OpeningStage } = await import("../interactive/opening-stage");
    const probe = <i data-probe="motion" />;
    const markup = renderToStaticMarkup(
      <OpeningStage primaryName="A" secondaryName="B" weekday="Chủ Nhật" fullDate="05.12.2027" photo={undefined} photoAlt="" interiorMotion={probe}>
        <p>interior</p>
      </OpeningStage>,
    );
    // The opening always starts closed, so the anchor is not in the markup...
    expect(markup).toContain("interior");
    expect(markup).not.toContain("data-probe");
    // ...and it is the final phase alone that mounts it.
    const stage = readFileSync(join(SD1, "interactive", "opening-stage.tsx"), "utf8");
    expect(stage).toMatch(/phase === "hero" \? interiorMotion : null/);
    // The static renderer hands it over; it never sits loose in `children`.
    const root = readFileSync(join(SD1, "se-duyen-v1.tsx"), "utf8");
    expect(root).toMatch(/interiorMotion=\{<SectionReveal hasCountdown=/);
  });

  it("every declared target is a real stylesheet class, so no reveal silently animates nothing", () => {
    // A mistyped name resolves to itself and would then match nothing in the
    // document; a real one resolves to the module's own scoped class.
    expect(SD_REVEAL_TARGET_CLASSES.length).toBe(SD_REVEAL_TARGETS.length);
    for (const name of SD_REVEAL_TARGET_CLASSES) {
      expect(cls(name), name).not.toBe(name);
      expect(cssCode, name).toMatch(new RegExp(`\\.${name}[\\s,{:[]`));
    }
    // All six creative sections of the brief are represented.
    for (const required of ["inviteCard", "couplePhotoMain", "couplePhotoAside", "house", "riteTitle", "flowList", "flowStep", "albumLead", "closingPhoto", "closingSign"]) {
      expect(SD_REVEAL_TARGET_CLASSES, required).toContain(required);
    }
  });
});

describe("SD-V1-MOTION-01 stylesheet contract", () => {
  it("every reveal rule lives under prefers-reduced-motion: no-preference, so reduced motion is readable and still", () => {
    const noPreference = [...revealRules.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g)].map((match) => match[0]);
    expect(noPreference).toHaveLength(1);
    const inside = (noPreference[0] as string).match(/data-sd-reveal/g) ?? [];
    const all = revealRules.match(/data-sd-reveal/g) ?? [];
    // Not one pending state, entrance or keyframe sits outside that query.
    expect(inside.length).toBe(all.length);
    expect(all.length).toBeGreaterThan(SD_REVEAL_VARIANTS.length);
    // The reveal section adds no `reduce` block: there is nothing to undo.
    expect(revealRules).not.toMatch(/prefers-reduced-motion: reduce/);
  });

  it("every variant has both a pending state and an entrance, and no entrance can get stuck", () => {
    for (const variant of SD_REVEAL_VARIANTS) {
      expect(revealRules, `${variant} pending`).toMatch(new RegExp(`\\[data-sd-reveal="${variant}"\\]`));
      expect(revealRules, `${variant} shown`).toMatch(new RegExp(`\\[data-sd-reveal="${variant} shown"\\]`));
    }
    // `backwards` only: the settled state is always the element's own approved
    // style, so a finished entrance can never hold a target at opacity 0.
    expect(revealRules).not.toMatch(/\bforwards\b/);
    expect(revealRules).not.toMatch(/\binfinite\b/);
    const fills = [...revealRules.matchAll(/animation:[^;]+;/g)].map((match) => match[0]);
    expect(fills.length).toBeGreaterThan(0);
    for (const rule of fills) expect(rule, rule).toMatch(/\bbackwards\b/);
    // Every keyframe name the entrances use is defined in this same section.
    for (const name of fills.flatMap((rule) => [...rule.matchAll(/animation:\s*([\w-]+)/g)].map((match) => match[1] as string))) {
      expect(revealRules, name).toMatch(new RegExp(`@keyframes ${name} \\{`));
    }
  });

  it("the frozen box opening is out of reach: every reveal selector is scoped to the interior column", () => {
    const selectors = [...revealSelectorSource.matchAll(/^ {2}([^{}@\n][^{}\n]*)\{/gm)].map((match) => (match[1] as string).trim());
    expect(selectors.length).toBeGreaterThan(20);
    for (const selector of selectors) {
      for (const part of selector.split(",")) {
        expect(part.trim(), selector).toMatch(/^\.interior\b/);
      }
    }
    // The opening stage's own classes are never named here.
    for (const frozen of ["\\.root", "\\.stage", "\\.boxArt", "\\.boxLid", "\\.photoSlot", "\\.hero\\b", "\\.coverNames", "\\.openingClock"]) {
      expect(revealRules, frozen).not.toMatch(new RegExp(frozen));
    }
  });

  it("only compositor properties move, so no reveal can shift the layout or cause overflow", () => {
    const declarations = [...revealRules.matchAll(/^\s+([a-z-]+):/gm)].map((match) => match[1] as string);
    const allowed = new Set([
      "opacity",
      "translate",
      "scale",
      "rotate",
      "transform",
      "transform-origin",
      "animation",
      "box-shadow",
      "background-image",
      "background-repeat",
      "background-size",
      "background-position",
      "content",
      "position",
      "inset",
      "pointer-events",
      "--sd-reveal-delay",
      "--sd-tilt",
    ]);
    for (const property of new Set(declarations)) {
      expect(allowed.has(property) || property.startsWith("--"), property).toBe(true);
    }
    // Nothing that reflows: no size, spacing, font or layout property at all.
    expect(revealRules).not.toMatch(/^\s+(width|height|margin|padding|top|left|right|bottom|font-size|display|gap|flex)\s*:/m);
  });

  it("the frozen opening's approved motion above is untouched", () => {
    const frozen = cssCode.slice(0, cssCode.indexOf("SD-V1-MOTION-01 — interior scroll reveal"));
    // The two approved loops and the opening's own keyframes, exactly as before.
    expect((frozen.match(/@keyframes/g) ?? [])).toHaveLength(5);
    expect((frozen.match(/\binfinite\b/g) ?? [])).toHaveLength(2);
    expect(frozen).toMatch(/@keyframes sdp-opening-clock \{/);
  });
});
