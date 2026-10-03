import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InvitationRendererCapabilitiesV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { buildRendererFixture } from "../../../../core/fixtures/renderer-fixture-pipeline";

/**
 * Motion pass + PO motion correction: one-shot reveal controller, directional
 * portraits, bouquets, gallery pattern, stagger, late mounts, markers, CSS
 * layout safety (no decoration clipping, unchanged calendar footprint),
 * photo framing and reduced motion.
 */

vi.mock("../fonts", () => ({ ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables" }));

const { default: styles } = await import("../elegant-editorial-v1.module.css");
const { ElegantEditorialV1 } = await import("../elegant-editorial-v1");
const {
  REVEAL_STAGGER_MAX_STEPS,
  REVEAL_STAGGER_MS,
  REVEAL_TARGET_CLASSES,
  revealDelaysMs,
  startSectionReveal,
} = await import("../interactive/section-reveal");
type RevealElement = Parameters<typeof startSectionReveal>[0];
type RevealEnvironment = Parameters<typeof startSectionReveal>[1];

const cls = (name: string): string => (styles as Record<string, string>)[name] ?? name;

// ---------------------------------------------------------------------------
// Minimal fake DOM (node test environment has no DOM)
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

  constructor(readonly classNames: readonly string[], attributes: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(attributes)) this.attributes.set(key, value);
  }

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

const el = (name: string, attributes?: Record<string, string>) => new FakeElement([cls(name)], attributes);

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
  const enter = (...targets: FakeElement[]) => report(true, 500, targets);
  return { environment, io, enter, report };
}

const reveal = (node: FakeElement) => node.getAttribute("data-ee-reveal");

// ---------------------------------------------------------------------------

describe("reveal controller", () => {
  it("without IntersectionObserver nothing is ever marked (content stays visible)", () => {
    const column = el("column").append(el("timelineRow"), el("galleryItem"));
    startSectionReveal(column, {});
    expect(column.children.map(reveal)).toEqual([null, null]);
  });

  it("groom portrait enters from the left, bride portrait from the right (from the block's data-align)", () => {
    const groomPortrait = el("couplePortrait");
    const bridePortrait = el("couplePortrait");
    const column = el("column").append(
      el("couplePortraitBlock", { "data-align": "start" }).append(groomPortrait, el("couplePortraitPlate")),
      el("couplePortraitBlock", { "data-align": "end" }).append(bridePortrait),
      el("couplePlate", { "data-align": "end" }),
    );
    startSectionReveal(column, fakeEnvironment().environment);
    expect([reveal(groomPortrait), reveal(bridePortrait)]).toEqual(["left", "right"]);
    expect(reveal(column.children[2])).toBe("right");
    expect(reveal(column.children[0])).toBeNull();
  });

  it("calendar: the stage holding the bouquets is never a target; card, bouquets, month and day are", () => {
    const start = el("calendarBotanicalStart");
    const end = el("calendarBotanicalEnd");
    const card = el("calendarCard").append(start, end, el("calendarMonth"), el("calendarCeremonyDay"));
    const stage = el("calendarStage").append(card);
    const column = el("column").append(stage);
    startSectionReveal(column, fakeEnvironment().environment);
    expect(reveal(stage)).toBeNull();
    expect([card, start, end, ...card.children.slice(2)].map(reveal)).toEqual(["card", "bloom-start", "bloom-end", "headline", "pop"]);
  });

  it("stronger variants for ceremony cards, countdown units, timeline parts, story and swatches", () => {
    const names = ["eventCard", "countdownCell", "timelineTime", "timelineDot", "timelineLabel", "storyPhoto", "dressCodeSwatch", "ceremonyTitle"];
    const column = el("column").append(...names.map((name) => el(name)));
    startSectionReveal(column, fakeEnvironment().environment);
    expect(column.children.map(reveal)).toEqual(["card", "card", "left", "pop", "right", "zoom", "pop", "headline"]);
  });

  it("reveals once (keeping its variant) and is never replayed", () => {
    const row = el("timelineRow");
    const column = el("column").append(row);
    const { environment, io, enter, report } = fakeEnvironment();
    startSectionReveal(column, environment);
    enter(row);
    expect(reveal(row)).toBe("rise shown");
    expect(io.observed.has(row)).toBe(false);
    report(false, 500, [row]);
    expect(reveal(row)).toBe("rise shown");
  });

  it("a target already scrolled past (fast scroll) is revealed, never left hidden", () => {
    const item = el("galleryItem");
    const column = el("column").append(item);
    const { environment, report } = fakeEnvironment();
    startSectionReveal(column, environment);
    report(false, 1200, [item]);
    expect(reveal(item)).toBe("left");
    report(false, -10, [item]);
    expect(reveal(item)).toBe("left shown");
  });

  it("staggers a batch in document order, restarts at 0 for each batch, and caps the delay", () => {
    const rows = [el("timelineRow"), el("timelineRow"), el("timelineRow")];
    const column = el("column").append(...rows);
    const { environment, enter } = fakeEnvironment();
    startSectionReveal(column, environment);
    enter(rows[2], rows[0]);
    expect(rows[0].properties.get("--ee-reveal-delay")).toBe("0ms");
    expect(rows[2].properties.get("--ee-reveal-delay")).toBe(`${REVEAL_STAGGER_MS}ms`);
    enter(rows[1]);
    expect(rows[1].properties.get("--ee-reveal-delay")).toBe("0ms");
    expect(Math.max(...revealDelaysMs(30))).toBe(REVEAL_STAGGER_MAX_STEPS * REVEAL_STAGGER_MS);
  });

  it("gallery: every item at any count (>10) enters from its own column's side; a far-down batch starts at 0", () => {
    const items = Array.from({ length: 23 }, () => el("galleryItem"));
    const column = el("column").append(el("gallery").append(...items));
    const { environment, enter } = fakeEnvironment();
    startSectionReveal(column, environment);
    expect(items.slice(0, 5).map(reveal)).toEqual(["left", "right", "left", "right", "left"]);
    expect(items.every((item) => reveal(item) !== null)).toBe(true);
    enter(items[20], items[21]);
    expect(items[20].properties.get("--ee-reveal-delay")).toBe("0ms");
  });

  it("Photo Story tiles follow their placement: left → left, right → right, centred → card, landscape row → image", () => {
    const tiles = ["left", "right", "center", "wide"].map((placement) => el("photoStoryTile", { "data-placement": placement }));
    const column = el("column").append(el("photoStoryGrid").append(...tiles));
    startSectionReveal(column, fakeEnvironment().environment);
    expect(tiles.map(reveal)).toEqual(["left", "right", "card", "image"]);
  });

  it("rescan picks up a late countdown; nodes inside a handled target (RSVP state changes) are not replayed; stop cleans up", () => {
    const card = el("rsvpCard");
    const band = el("ceremonyBand");
    const column = el("column").append(band, card);
    const { environment, io, enter } = fakeEnvironment();
    const controller = startSectionReveal(column, environment);
    enter(card);
    const cell = el("countdownCell");
    band.append(cell);
    const partySize = el("rsvpField");
    card.append(partySize);
    controller.rescan();
    expect(reveal(cell)).toBe("card");
    expect(reveal(partySize)).toBeNull();
    controller.stop();
    expect([reveal(card), reveal(cell)]).toEqual([null, null]);
    expect(card.properties.size).toBe(0);
    expect(io.disconnected).toBe(true);
  });
});

describe("renderer markers", () => {
  it("every section renders its targets in the unchanged section order; server markup carries no hidden state", async () => {
    const { viewModel, selection } = await buildRendererFixture({
      variant: "COMMON",
      portraits: "PRESENT",
      photoStory: "PRESENT",
      loveStoryPhoto: "PRESENT",
      galleryCount: 23,
    });
    const capabilities: InvitationRendererCapabilitiesV1 = Object.freeze({
      rsvp: Object.freeze({ submit: async () => Object.freeze({ status: "UNAVAILABLE" as const }) }),
    });
    const html = renderToStaticMarkup(
      <ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={capabilities} />,
    );
    const orderedMarkers = [
      "couplePortrait", "guestLine", "familyName", "ceremonyTitle", "calendarBotanicalStart", "eventCard", "timelineRow",
      "photoStoryTile", "storyCard", "rsvpField", "giftIntro", "dressCodeSwatch", "galleryItem", "closingNames",
    ];
    const positions = orderedMarkers.map((name) => html.indexOf(cls(name)));
    expect(positions.every((position) => position > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html.split(`class="${cls("galleryItem")}"`).length - 1).toBe(23);
    expect(html).not.toContain("data-ee-reveal");
  });
});

describe("CSS layout and motion safety", () => {
  const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8");
  const source = readFileSync(join(__dirname, "..", "interactive", "section-reveal.tsx"), "utf8");
  const revealBlock = css.slice(css.indexOf("/* Section reveal"), css.indexOf("/* Reduced motion"));
  const reducedBlock = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  /** The standalone rule `selector { … }` (not a member of a grouped selector list). */
  const rule = (selector: string) => {
    for (let at = css.indexOf(`\n${selector} {`); at !== -1; at = css.indexOf(`\n${selector} {`, at + 1)) {
      if (css[at - 1] !== ",") return css.slice(at, css.indexOf("}", at) + 1);
    }
    return "";
  };

  it("every reveal target is a real class of the CSS module", () => {
    for (const name of REVEAL_TARGET_CLASSES) expect(css, name).toMatch(new RegExp(`\\.${name}\\b`));
  });

  it("settled reveals never clip: only the `image` variant keeps a clip, on its own box", () => {
    const shown = rule('.column [data-ee-reveal~="shown"]');
    expect(shown).not.toMatch(/clip-path:/);
    expect(revealBlock.match(/clip-path: inset\(0 0 0 0\)/g)).toHaveLength(1);
    expect(revealBlock).toMatch(/\[data-ee-reveal="image shown"\] \{\s*clip-path: inset\(0 0 0 0\);\s*\}/);
  });

  it("calendar footprint and bouquet offsets are unchanged", () => {
    expect(rule(".calendarStage")).toMatch(/margin: 0 calc\(-1 \* var\(--ee-gutter\)\);\s*padding: 34px 0 44px;/);
    expect(rule(".calendarBotanicalStart")).toMatch(/top: -58px;\s*left: -46px;/);
    expect(rule(".calendarBotanicalEnd")).toMatch(/right: -30px;\s*bottom: -38px;/);
    expect(rule(".calendarCard")).toMatch(/max-width: 260px;\s*margin: 0 auto;\s*padding: 26px 22px 22px;/);
  });

  it("motion uses no layout properties, no transform override and no loop", () => {
    expect(revealBlock).not.toMatch(/\b(width|height|top|left|margin|padding|gap|filter|box-shadow)\s*:|transform\s*:|infinite/);
  });

  it("people photos are top-biased in their cover frames; the Hero cover is unchanged", () => {
    expect(css).toMatch(/--ee-photo-focus: 50% 22%;/);
    for (const name of [".couplePortrait", ".photoStoryImage", ".storyPhoto", ".galleryImage"]) {
      expect(rule(name), name).toMatch(/object-fit: cover;\s*object-position: var\(--ee-photo-focus\);/);
    }
    expect(rule(".heroImage")).not.toMatch(/object-position/);
  });

  it("reduced motion shows every mark at once and stops the Hero and gift-dialog animations", () => {
    expect(reducedBlock).toMatch(/\.column \[data-ee-reveal\] \{\s*opacity: 1;\s*translate: none;\s*scale: none;\s*rotate: none;\s*clip-path: none;\s*transition: none;/);
    expect(reducedBlock).toMatch(/\+ \.hero :is\(\.heroImage, \.heroKicker, \.heroNames, \.heroCeremony, \.heroDate\)/);
    expect(reducedBlock).toMatch(/\.giftDialog\[open\] :is\(\.giftPanel, \.giftQr\) \{\s*animation: none;/);
  });

  it("the island has no scroll listener, timer, network, storage, globals or business access", () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(
      /addEventListener|setTimeout|setInterval|requestAnimationFrame|fetch\(|localStorage|\bwindow\b|\bdocument\b|MutationObserver|matchMedia|supabase|service_role|"SUCCESS"|token/i,
    );
  });
});
