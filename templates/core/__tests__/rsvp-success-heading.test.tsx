import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * WC-UI-P0-01 — the recorded-response heading, across all eight published
 * renderer versions, plus the Se Duyên envelope's close control
 * (docs/DECISIONS.md "WC-UI-P0-01 …").
 *
 * PART A. "Xác nhận tham dự" is the form's invitation to answer. Left large
 * on screen after the answer is stored it reads as "you are attending",
 * which is simply false for a NOT_ATTENDING response. It therefore steps out
 * of sight once the response is recorded — and only then — and its text
 * becomes the neutral "Đã ghi nhận hồi âm", so a screen reader is not told
 * "confirm your attendance" over a NOT_ATTENDING answer either. The element,
 * its id and its heading level are never dropped, so each section keeps an
 * accessible name and every `aria-labelledby` keeps a live target.
 *
 * HOW THE SUCCESS STATE IS REACHED HERE. The phase lives in each island's
 * own `useReducer`, and the repository has no DOM test environment, so these
 * tests substitute the two hooks that hold the phase and the success recap
 * and then render the island for real through `react-dom/server`. Everything
 * asserted below is therefore the islands' actual SUCCESS markup, not a
 * regex over their source. The capability is never called.
 */

const hooks = vi.hoisted(() => ({
  /** `null` → the real `useReducer`; otherwise the phase every island starts in. */
  phase: null as string | null,
  /** `null` → the real `useState`; otherwise the success recap. */
  recap: null as unknown,
  /** `true` → `useState(false)` (the envelope's `open`) starts open. */
  open: false,
  /** `true` → every hook answers without a renderer, so an island can be called directly. */
  detached: false,
  /** Every value passed to the forced `open` setter. */
  openCalls: [] as unknown[],
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const useReducer = (reducer: unknown, init: unknown, ...rest: unknown[]) =>
    hooks.phase !== null && init === "IDLE"
      ? [hooks.phase, () => {}]
      : (actual.useReducer as (...args: unknown[]) => unknown)(reducer, init, ...rest);
  const useState = (init: unknown) => {
    if (hooks.recap !== null && init === null) return [hooks.recap, () => {}];
    if (hooks.open && init === false) return [true, (value: unknown) => hooks.openCalls.push(value)];
    return hooks.detached ? [init, () => {}] : (actual.useState as (value: unknown) => unknown)(init);
  };
  const useId = () => (hooks.detached ? "wcui" : actual.useId());
  return { ...actual, useReducer, useState, useId } as unknown as typeof actual;
});

const capability = () => ({ submit: vi.fn(async () => ({ status: "SUCCESS" }) as const) });

/** Copy as `react-dom/server` writes it into markup. */
const escaped = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

afterEach(() => {
  hooks.phase = null;
  hooks.recap = null;
  hooks.open = false;
  hooks.detached = false;
  hooks.openCalls.length = 0;
});

const WEDDING = join(__dirname, "..", "..", "wedding");
const cssOf = (dir: string, file: string) => readFileSync(join(WEDDING, dir, file), "utf8");
const islandOf = (dir: string, name: string) => readFileSync(join(WEDDING, dir, "interactive", name), "utf8");

/** The class attribute of the heading element carrying `id`, whatever the attribute order. */
function headingClassOf(html: string, id: string): string {
  const at = html.indexOf(`id="${id}"`);
  expect(at, `no element with id="${id}"`).toBeGreaterThan(-1);
  const open = Math.max(html.lastIndexOf("<h2", at), html.lastIndexOf("<h3", at));
  expect(open, `id="${id}" is not on an h2/h3`).toBeGreaterThan(-1);
  const tag = html.slice(open, html.indexOf(">", at > open ? Math.max(at, open) : open) + 1);
  const className = /class="([^"]*)"/.exec(tag);
  expect(className, `heading ${id} has no class: ${tag}`).not.toBeNull();
  return (className as RegExpExecArray)[1] as string;
}

/** Every island's props are the same frozen one: the RSVP capability (K15). */
type RsvpIsland = { Rsvp: (props: { rsvp: { submit: unknown } }) => ReactNode };
type EnvelopeIsland = {
  GiftEnvelope: (props: { panels: readonly GiftPanelLike[]; clipboard: undefined }) => ReactNode;
};
interface GiftPanelLike {
  readonly side: "GROOM" | "BRIDE";
  readonly qr: undefined;
  readonly rows: readonly { readonly key: "bankName" | "accountName" | "accountNumber"; readonly value: string }[];
}

const island = async <T,>(load: Promise<unknown>): Promise<T> => (await load) as T;

/** The heading element carrying `id`, open tag through close tag. */
function headingElementOf(html: string, id: string): string {
  const at = html.indexOf(`id="${id}"`);
  expect(at, `no element with id="${id}"`).toBeGreaterThan(-1);
  const open = Math.max(html.lastIndexOf("<h2", at), html.lastIndexOf("<h3", at));
  const tag = html.slice(open + 1, open + 3);
  const close = html.indexOf(`</${tag}>`, at);
  expect(close, `heading ${id} is not closed`).toBeGreaterThan(-1);
  return html.slice(open, close + tag.length + 3);
}

interface Published {
  readonly label: string;
  readonly dir: string;
  readonly css: string;
  readonly headingId: string;
  /** The class the heading keeps while the form is still answerable. */
  readonly displayClass: string;
  /** Every heading string a guest reads before answering. */
  readonly headingText: readonly string[];
  /** The neutral name the section keeps once the answer is stored. */
  readonly successHeading: string;
  /** Copy that invites an answer and must not outlive the form. */
  readonly formOnlyText?: string;
  /** Said only after the server confirmed the response. */
  readonly successText: readonly string[];
  /** The "edit my answer" action. */
  readonly editText: string;
  readonly island: () => Promise<RsvpIsland>;
}

const EE = await import("../../wedding/elegant-editorial/v1/copy");
const VH1 = await import("../../wedding/vietnamese-heritage/v1/copy");
const VH2 = await import("../../wedding/vietnamese-heritage/v2/copy");
const RM1 = await import("../../wedding/romantic-minimal/v1/copy");
const OWS1 = await import("../../wedding/our-wedding-story/v1/copy");
const OWS2 = await import("../../wedding/our-wedding-story/v2/copy");
const SD1 = await import("../../wedding/se-duyen/v1/copy");
const SD2 = await import("../../wedding/se-duyen/v2/copy");

const PUBLISHED: readonly Published[] = [
  {
    label: "elegant-editorial v1",
    dir: "elegant-editorial/v1",
    css: "elegant-editorial-v1.module.css",
    headingId: "ee-rsvp-heading",
    displayClass: "rsvpHeading",
    headingText: [EE.ELEGANT_EDITORIAL_V1_COPY.rsvp.heading, EE.ELEGANT_EDITORIAL_V1_COPY.rsvp.headingSecondLine],
    successHeading: EE.ELEGANT_EDITORIAL_V1_COPY.rsvp.successHeading,
    successText: [EE.ELEGANT_EDITORIAL_V1_COPY.rsvp.success.thanks],
    editText: EE.ELEGANT_EDITORIAL_V1_COPY.rsvp.edit,
    island: () => island<RsvpIsland>(import("../../wedding/elegant-editorial/v1/interactive/rsvp")),
  },
  {
    label: "vietnamese-heritage v1",
    dir: "vietnamese-heritage/v1",
    css: "vietnamese-heritage-v1.module.css",
    headingId: "vh-rsvp-heading",
    displayClass: "rsvpTitle",
    headingText: [VH1.VIETNAMESE_HERITAGE_V1_COPY.rsvp.heading, VH1.VIETNAMESE_HERITAGE_V1_COPY.rsvp.headingSecondLine],
    successHeading: VH1.VIETNAMESE_HERITAGE_V1_COPY.rsvp.successHeading,
    successText: [VH1.VIETNAMESE_HERITAGE_V1_COPY.rsvp.successThanks],
    editText: VH1.VIETNAMESE_HERITAGE_V1_COPY.rsvp.edit,
    island: () => island<RsvpIsland>(import("../../wedding/vietnamese-heritage/v1/interactive/rsvp")),
  },
  {
    label: "vietnamese-heritage v2",
    dir: "vietnamese-heritage/v2",
    css: "vietnamese-heritage-v2.module.css",
    headingId: "vh-rsvp-heading",
    displayClass: "rsvpTitle",
    headingText: [VH2.VIETNAMESE_HERITAGE_V2_COPY.rsvp.heading, VH2.VIETNAMESE_HERITAGE_V2_COPY.rsvp.headingSecondLine],
    successHeading: VH2.VIETNAMESE_HERITAGE_V2_COPY.rsvp.successHeading,
    successText: [VH2.VIETNAMESE_HERITAGE_V2_COPY.rsvp.successThanks],
    editText: VH2.VIETNAMESE_HERITAGE_V2_COPY.rsvp.edit,
    island: () => island<RsvpIsland>(import("../../wedding/vietnamese-heritage/v2/interactive/rsvp")),
  },
  {
    label: "romantic-minimal v1",
    dir: "romantic-minimal/v1",
    css: "romantic-minimal-v1.module.css",
    headingId: "rm-rsvp-heading",
    displayClass: "rsvpTitle",
    headingText: [RM1.ROMANTIC_MINIMAL_V1_COPY.rsvp.heading, RM1.ROMANTIC_MINIMAL_V1_COPY.rsvp.headingSecondLine],
    successHeading: RM1.ROMANTIC_MINIMAL_V1_COPY.rsvp.successHeading,
    successText: [RM1.ROMANTIC_MINIMAL_V1_COPY.rsvp.successThanks],
    editText: RM1.ROMANTIC_MINIMAL_V1_COPY.rsvp.edit,
    island: () => island<RsvpIsland>(import("../../wedding/romantic-minimal/v1/interactive/rsvp")),
  },
  {
    label: "our-wedding-story v1",
    dir: "our-wedding-story/v1",
    css: "our-wedding-story-v1.module.css",
    headingId: "ows-rsvp-heading",
    displayClass: "rsvpTitle",
    headingText: [OWS1.OUR_WEDDING_STORY_V1_COPY.rsvp.title],
    successHeading: OWS1.OUR_WEDDING_STORY_V1_COPY.rsvp.successHeading,
    formOnlyText: OWS1.OUR_WEDDING_STORY_V1_COPY.rsvp.intro,
    successText: [OWS1.OUR_WEDDING_STORY_V1_COPY.rsvp.doneTitle],
    editText: OWS1.OUR_WEDDING_STORY_V1_COPY.rsvp.edit,
    island: () => island<RsvpIsland>(import("../../wedding/our-wedding-story/v1/interactive/rsvp")),
  },
  {
    label: "our-wedding-story v2",
    dir: "our-wedding-story/v2",
    css: "our-wedding-story-v2.module.css",
    headingId: "ows-rsvp-heading",
    displayClass: "rsvpTitle",
    headingText: [OWS2.OUR_WEDDING_STORY_V2_COPY.rsvp.title],
    successHeading: OWS2.OUR_WEDDING_STORY_V2_COPY.rsvp.successHeading,
    formOnlyText: OWS2.OUR_WEDDING_STORY_V2_COPY.rsvp.intro,
    successText: [OWS2.OUR_WEDDING_STORY_V2_COPY.rsvp.doneTitle],
    editText: OWS2.OUR_WEDDING_STORY_V2_COPY.rsvp.edit,
    island: () => island<RsvpIsland>(import("../../wedding/our-wedding-story/v2/interactive/rsvp")),
  },
  {
    label: "se-duyen v1",
    dir: "se-duyen/v1",
    css: "se-duyen-v1.module.css",
    headingId: "sd-rsvp-heading",
    displayClass: "rsvpHeading",
    headingText: [SD1.SE_DUYEN_V1_COPY.rsvp.heading],
    successHeading: SD1.SE_DUYEN_V1_COPY.rsvp.successHeading,
    successText: [SD1.SE_DUYEN_V1_COPY.rsvp.thanks, SD1.SE_DUYEN_V1_COPY.rsvp.recorded],
    editText: SD1.SE_DUYEN_V1_COPY.rsvp.again,
    island: () => island<RsvpIsland>(import("../../wedding/se-duyen/v1/interactive/rsvp")),
  },
  {
    label: "se-duyen v2",
    dir: "se-duyen/v2",
    css: "se-duyen-v2.module.css",
    headingId: "sd-rsvp-heading",
    displayClass: "rsvpHeading",
    headingText: [SD2.SE_DUYEN_V2_COPY.rsvp.heading],
    successHeading: SD2.SE_DUYEN_V2_COPY.rsvp.successHeading,
    successText: [SD2.SE_DUYEN_V2_COPY.rsvp.thanks, SD2.SE_DUYEN_V2_COPY.rsvp.recorded],
    editText: SD2.SE_DUYEN_V2_COPY.rsvp.again,
    island: () => island<RsvpIsland>(import("../../wedding/se-duyen/v2/interactive/rsvp")),
  },
];

const RECAPS = [
  { label: "NOT_ATTENDING", recap: { attendance: "NOT_ATTENDING" as const, name: "Em và sự cô đơn", message: null, partySize: 0 } },
  { label: "ATTENDING", recap: { attendance: "ATTENDING" as const, name: "Anh Hiếu và gia đình", message: "Chúc mừng!", partySize: 2 } },
] as const;

async function render(entry: Published, phase: string | null, recap: unknown): Promise<string> {
  hooks.phase = phase;
  hooks.recap = recap;
  const { Rsvp } = await entry.island();
  const rsvp = capability();
  const html = renderToStaticMarkup(<Rsvp rsvp={rsvp} />);
  // Rendering must never submit (P30/P32).
  expect(rsvp.submit).not.toHaveBeenCalled();
  return html;
}

it("exactly the eight published renderer versions are covered", () => {
  expect(PUBLISHED).toHaveLength(8);
  expect(new Set(PUBLISHED.map((entry) => entry.dir)).size).toBe(8);
  // Every heading a guest answers under really does promise attendance.
  for (const entry of PUBLISHED) {
    expect(entry.headingText.join(" ").toLowerCase(), entry.label).toContain("xác nhận tham dự");
  }
});

describe("A: before SUCCESS the form heading is untouched", () => {
  it.each(PUBLISHED.map((entry) => [entry.label, entry] as const))("%s", async (_label, entry) => {
    const html = await render(entry, null, null);
    expect(headingClassOf(html, entry.headingId)).toContain(`_${entry.displayClass}_`);
    expect(headingClassOf(html, entry.headingId)).not.toContain("_srOnly_");
    for (const text of entry.headingText) expect(html).toContain(escaped(text));
    expect(html).not.toContain(escaped(entry.successHeading));
    // Still the answerable form, with everything that invites an answer.
    expect(html).toContain("<form");
    if (entry.formOnlyText !== undefined) expect(html).toContain(escaped(entry.formOnlyText));
    for (const text of entry.successText) expect(html).not.toContain(escaped(text));
    expect(html).not.toContain(escaped(entry.editText));
  });
});

describe("A: after SUCCESS the heading is out of sight but still the section's name", () => {
  for (const { label: outcome, recap } of RECAPS) {
    it.each(PUBLISHED.map((entry) => [entry.label, entry] as const))(`%s · ${outcome}`, async (_label, entry) => {
      const html = await render(entry, "SUCCESS", recap);

      // Visually hidden — it can no longer imply attendance.
      const className = headingClassOf(html, entry.headingId);
      expect(className).toContain("_srOnly_");
      expect(className).not.toContain(`_${entry.displayClass}_`);

      // Never unmounted: the element and its id survive, so the section
      // keeps an accessible name and aria-labelledby keeps a live target —
      // but that name no longer claims the guest is attending.
      const heading = headingElementOf(html, entry.headingId);
      expect(heading).toContain(escaped(entry.successHeading));
      expect(html).not.toContain(escaped(entry.headingText[0] as string));
      // Nothing left on screen still asks for an answer.
      if (entry.formOnlyText !== undefined) expect(html).not.toContain(escaped(entry.formOnlyText));
      for (const id of [...html.matchAll(/aria-labelledby="([^"]+)"/g)].flatMap((match) => (match[1] as string).split(" "))) {
        expect(html, `aria-labelledby="${id}" has no target`).toContain(`id="${id}"`);
      }

      // The recorded-response UI and the edit action are exactly as before.
      for (const text of entry.successText) expect(html).toContain(escaped(text));
      expect(html).toContain(escaped(entry.editText));
      expect(html).toContain('role="status"');
      // No form to answer again until the guest asks for one.
      expect(html).not.toContain("<form");
    });
  }

  it.each(PUBLISHED.map((entry) => [entry.label, entry] as const))(
    "%s: the sr-only class really hides the heading visually",
    (_label, entry) => {
      const css = cssOf(entry.dir, entry.css);
      const block = css.slice(css.indexOf(".srOnly {"), css.indexOf("}", css.indexOf(".srOnly {")));
      expect(block).toMatch(/position:\s*absolute/);
      expect(block).toMatch(/width:\s*1px/);
      expect(block).toMatch(/height:\s*1px/);
      expect(block).toMatch(/overflow:\s*hidden/);
      expect(block).toMatch(/clip(-path)?:/);
      // Hidden, never removed from the accessibility tree.
      expect(block).not.toMatch(/display:\s*none|visibility:\s*hidden/);
    },
  );

  it.each(PUBLISHED.map((entry) => [entry.label, entry] as const))(
    "%s: nothing about the capability, the API or the state machine moved",
    (_label, entry) => {
      const island = islandOf(entry.dir, "rsvp.tsx");
      // Comments stripped: several islands document the endpoint the
      // capability happens to use, which is not the island reaching for it.
      const code = island.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code).not.toMatch(/fetch\(|responseKey|\/api\/|supabase/i);
      expect(code).toMatch(/rsvpPhaseReducer/);
      // Both heading classes still exist in the island: the display one for
      // the answerable form, the sr-only one for the recorded response. Which
      // one each phase actually renders is asserted on the markup above.
      expect(code, entry.label).toMatch(new RegExp(`styles\\.${entry.displayClass}\\b`));
      expect(code, entry.label).toMatch(/styles\.srOnly\b/);
    },
  );
});

// ---------------------------------------------------------------------------
// PART B — the Se Duyên envelope's own close control
// ---------------------------------------------------------------------------

const ENVELOPES = [
  { label: "se-duyen v1", dir: "se-duyen/v1", css: "se-duyen-v1.module.css", copy: SD1.SE_DUYEN_V1_COPY, island: () => island<EnvelopeIsland>(import("../../wedding/se-duyen/v1/interactive/gift-envelope")) },
  { label: "se-duyen v2", dir: "se-duyen/v2", css: "se-duyen-v2.module.css", copy: SD2.SE_DUYEN_V2_COPY, island: () => island<EnvelopeIsland>(import("../../wedding/se-duyen/v2/interactive/gift-envelope")) },
] as const;

const PANELS: readonly GiftPanelLike[] = [
  {
    side: "GROOM" as const,
    qr: undefined,
    rows: [
      { key: "bankName" as const, value: "Vietcombank" },
      { key: "accountName" as const, value: "NGUYEN VAN AN" },
      { key: "accountNumber" as const, value: "0123456789" },
    ],
  },
];

type Envelope = (typeof ENVELOPES)[number];

async function envelopeMarkup(entry: Envelope, open: boolean): Promise<string> {
  hooks.open = open;
  const { GiftEnvelope } = await entry.island();
  return renderToStaticMarkup(<GiftEnvelope panels={PANELS} clipboard={undefined} />);
}

/** Every element in the tree, so a control can be found and invoked without a DOM. */
function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child as ReactNode));
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [element, ...elements(element.props.children)];
}

describe("B: open, the Se Duyên envelope hint is the close control", () => {
  it.each(ENVELOPES.map((entry) => [entry.label, entry] as const))(
    "%s: closed, it is still only a caption",
    async (_label, entry) => {
      const html = await envelopeMarkup(entry, false);
      expect(html).toMatch(/_giftHint_[^"]*" aria-hidden="true"/);
      expect(html).toContain(entry.copy.gift.openHint);
      expect(html).not.toContain(entry.copy.gift.closeHint);
      expect(html).not.toContain("_giftHintClose_");
      // Exactly one control: the envelope itself.
      expect(html.match(/<button/g)).toHaveLength(1);
    },
  );

  it.each(ENVELOPES.map((entry) => [entry.label, entry] as const))(
    "%s: open, it is a real button with the same caption, reachable by keyboard",
    async (_label, entry) => {
      const html = await envelopeMarkup(entry, true);
      const at = html.indexOf("_giftHintClose_");
      expect(at, "no close control").toBeGreaterThan(-1);
      const tag = html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
      // A native button: focusable and Enter/Space-activated with no extra code.
      expect(tag.startsWith("<button")).toBe(true);
      expect(tag).toContain('type="button"');
      // Same caption, same typography: it also carries .giftHint.
      expect(tag).toMatch(/_giftHint_/);
      // A focusable control must never be hidden from assistive technology.
      expect(tag).not.toContain("aria-hidden");
      expect(tag).not.toContain("tabindex");
      expect(tag).not.toContain("disabled");
      expect(html).toContain(entry.copy.gift.closeHint);
      expect(html).not.toContain(entry.copy.gift.openHint);
      // The envelope control is still there and still says "fold it back".
      expect(html).toContain(`aria-label="${entry.copy.gift.closeHint}"`);
      expect(html.match(/<button/g)).toHaveLength(2);
      // The stage is open, which is what every open/close transition keys off.
      expect(html).toContain('data-open="true"');
    },
  );

  it.each(ENVELOPES.map((entry) => [entry.label, entry] as const))(
    "%s: activating it folds the envelope through the same open state as the envelope button",
    async (_label, entry) => {
      hooks.open = true;
      hooks.detached = true;
      const { GiftEnvelope } = await entry.island();
      const tree = GiftEnvelope({ panels: PANELS, clipboard: undefined });
      const controls = elements(tree).filter(
        (element) => typeof (element.props as { className?: string }).className === "string" &&
          ((element.props as { className: string }).className.includes("_giftHintClose_")),
      );
      expect(controls).toHaveLength(1);
      const control = controls[0] as ReactElement<{ onClick?: () => void }>;
      expect(control.type).toBe("button");
      expect(typeof control.props.onClick).toBe("function");
      (control.props.onClick as () => void)();
      // Closed through the one `open` state the flap, mouth, seal and slip
      // transitions all read, so the closing animation is the envelope's own.
      expect(hooks.openCalls).toStrictEqual([false]);
    },
  );

  it.each(ENVELOPES.map((entry) => [entry.label, entry] as const))(
    "%s: the control is a reset, not a new visible button style, and adds no animation",
    (_label, entry) => {
      const css = cssOf(entry.dir, entry.css);
      const block = css.slice(css.indexOf(".giftHintClose {"), css.indexOf("}", css.indexOf(".giftHintClose {")));
      expect(block).toMatch(/background:\s*none/);
      expect(block).toMatch(/border:\s*0/);
      expect(block).toMatch(/padding:\s*0/);
      expect(block).toMatch(/cursor:\s*pointer/);
      // It must not restate anything .giftHint already owns, or the two
      // rules would fight over the caption's look depending on their order.
      for (const property of ["margin", "font-size", "font-weight", "letter-spacing", "text-indent", "text-transform", "color"]) {
        expect(block, property).not.toMatch(new RegExp(`(^|[;{\\s])${property}\\s*:`));
      }
      // Keyboard focus is visible, with the envelope's own ring.
      expect(css).toMatch(/\.giftHintClose:focus-visible \{\s*outline: 2px solid rgba\(228, 200, 138, 0\.9\);/);
      // No new animation, transition, overlay or chrome.
      for (const property of ["animation", "transition", "box-shadow", "position", "z-index", "width", "height"]) {
        expect(block, property).not.toMatch(new RegExp(`(^|[;{\\s])${property}\\s*:`));
      }
      const island = islandOf(entry.dir, "gift-envelope.tsx");
      expect(island).not.toMatch(/@keyframes|setTimeout|requestAnimationFrame/);
      expect(island.match(/setOpen\(/g)).toHaveLength(2);
    },
  );
});
