import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS } from "../../../../../lib/domain";
import type { InvitationRendererCapabilitiesV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { buildRendererFixture } from "../../../../core/fixtures/renderer-fixture-pipeline";
import { FIXTURE_GUESTS, FIXTURE_MEDIA_IDS } from "../../../../core/fixtures/renderer-fixture-sources";
import { INITIAL_OPENING_STATE, openingReducer, type OpeningState } from "../interactive/opening-state";

vi.mock("../fonts", () => ({ ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables" }));

const { ElegantEditorialV1 } = await import("../elegant-editorial-v1");
const { ELEGANT_EDITORIAL_V1_COPY: COPY } = await import("../copy");

/**
 * RF-06D opening interaction (docs/DECISIONS.md "RF-06-0 …" P7, P13; Design
 * Baseline B5 items 2–4, Design Baseline D2, D3): pure state, initial server
 * markup, source contract and the CSS choreography / reduced-motion contract.
 * Hydrated clicks and animation events are covered by the manual harness QA
 * (no jsdom, P39).
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
    expect(openingReducer(INITIAL_OPENING_STATE, "SETTLED")).toBe(INITIAL_OPENING_STATE);
  });

  it("OPEN (the envelope tap) starts the choreography; its end settles it with the transition", () => {
    const opening = openingReducer(INITIAL_OPENING_STATE, "OPEN");
    expect(opening).toStrictEqual({ phase: "OPENING" });
    expect(openingReducer(opening, "OPEN")).toBe(opening);
    expect(openingReducer(opening, "SETTLED")).toStrictEqual({ phase: "OPENED" });
  });

  it("once opened, later actions change nothing (no re-seal, no replay)", () => {
    const opened: OpeningState = openingReducer(openingReducer(INITIAL_OPENING_STATE, "OPEN"), "SETTLED");
    for (const next of ["OPEN", "SETTLED"] as const) expect(openingReducer(opened, next)).toBe(opened);
  });

  it("is pure: the same input always gives the same frozen output", () => {
    expect(openingReducer(INITIAL_OPENING_STATE, "OPEN")).toBe(openingReducer(INITIAL_OPENING_STATE, "OPEN"));
    expect(Object.isFrozen(openingReducer(openingReducer(INITIAL_OPENING_STATE, "OPEN"), "SETTLED"))).toBe(true);
  });
});

describe("opening markup (server render / first client render)", () => {
  it.each(INVITATION_VARIANTS)("%s: sealed; the envelope is the tap target, then the Task029 hint; no skip control; no guest line", async (variant) => {
    const { viewModel, selection } = await buildRendererFixture({ variant, guest: FIXTURE_GUESTS.NORMAL });
    const html = renderToStaticMarkup(
      <ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={{}} />,
    );
    const opening = header(html);
    expect(opening).toContain('data-opening="sealed"');
    expect(opening).not.toContain("data-motion");
    // Exact copy: Task029 envelope name and hint (A). Product Owner ruling: no visible skip control.
    expect(COPY.opening.openEnvelope).toBe("Mở thiệp mời");
    expect(COPY.opening.hint).toBe("Chạm vào thiệp để mở");
    expect(COPY.opening).not.toHaveProperty("skip");
    expect(html).not.toContain("Bỏ qua");
    // Exactly one control: the envelope (wrapping the decorative artwork).
    expect(opening.match(/<button\b/g)).toHaveLength(1);
    expect(opening).toMatch(/<button type="button" class="[^"]*openingEnvelopeButton[^"]*" aria-label="Mở thiệp mời"><span[^>]*><svg[^>]*aria-hidden="true" focusable="false"/);
    expect(opening).toMatch(/<p class="[^"]*openingHint[^"]*">Chạm vào thiệp để mở<\/p><\/div>/);
    expect(opening).not.toContain("openingSkip");
    expect(opening).not.toMatch(/tabindex|role="button"|<a /);
    // The couple names (h1) are on the opening; the guest line never is (Design Baseline D1).
    expect(opening).toMatch(/<h1[^>]*>/);
    expect(opening).not.toContain(FIXTURE_GUESTS.NORMAL.displayName);
    expect(opening).not.toContain(COPY.opening.salutation);
    expect(opening).not.toContain("data-guest");
    expect(html).toContain(FIXTURE_GUESTS.NORMAL.displayName);
    // The rest of the invitation is rendered, not hidden behind the opening.
    for (const marker of ["ee-couple-heading", "ee-ceremony-heading", "ee-events-heading", "ee-closing-heading"]) {
      expect(html).toContain(marker);
    }
    expect(html).not.toMatch(/\sinert\b|aria-hidden="true"[^>]*><main|display:\s*none|data-ee-reveal/);
  });

  it("a RESOLVED cover rides the card: exactly media.cover, decorative, clipped at the pocket", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    const cover = viewModel.media.cover;
    if (cover?.status !== "RESOLVED") throw new Error("fixture cover must be RESOLVED");
    const opening = header(
      renderToStaticMarkup(<ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={{}} />),
    );
    expect(opening).toContain('data-card="cover"');
    expect(opening).toMatch(/<span class="[^"]*openingCardClip[^"]*" aria-hidden="true"><span class="[^"]*openingCard[^"]*"><img /);
    const images = [...opening.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
    expect(images).toHaveLength(1);
    expect(images[0]).toContain(`src="${cover.url}"`);
    expect(images[0]).toContain('alt=""');
  });

  it.each(INVITATION_VARIANTS)("%s: absent or UNAVAILABLE cover → no card and no image at all (Design Baseline D3)", async (variant) => {
    const { viewModel, selection } = await buildRendererFixture({ variant, unavailableMediaIds: [FIXTURE_MEDIA_IDS.COVER] });
    expect(viewModel.media.cover?.status).toBe("UNAVAILABLE");
    const opening = header(
      renderToStaticMarkup(<ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={{}} />),
    );
    expect(opening).toContain('data-card="none"');
    expect(opening).not.toMatch(/<img\b|openingCard/);
    const { cover: unavailableCover, ...mediaWithoutCover } = viewModel.media;
    expect(unavailableCover?.status).toBe("UNAVAILABLE");
    const absent = { ...viewModel, media: mediaWithoutCover };
    const noCover = header(
      renderToStaticMarkup(<ElegantEditorialV1 viewModel={absent} sections={selection.effectiveSections} capabilities={{}} />),
    );
    expect(noCover).toContain('data-card="none"');
    expect(noCover).not.toMatch(/<img\b|openingCard/);
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

  it("opens only from the envelope click, settles only on its own animationend; no timer, no persistence, no music", () => {
    expect(code.match(/onClick=\{\(\) => dispatch\("[A-Z]+"\)\}/g)).toStrictEqual(['onClick={() => dispatch("OPEN")}']);
    expect(code).not.toMatch(/SKIP|openingSkip/);
    expect(code).toMatch(/if \(event\.target === event\.currentTarget\) dispatch\("SETTLED"\);/);
    expect(code).toMatch(/onAnimationEnd=\{handleAnimationEnd\}/);
    expect(code.match(/dispatch\(/g)).toHaveLength(2);
    expect(code).not.toMatch(/setTimeout|setInterval|requestAnimationFrame|localStorage|sessionStorage|cookie|music|play\(/);
  });

  it("the card uses only a RESOLVED media.cover", () => {
    expect(code).toMatch(/const card = cover !== undefined && cover\.status === "RESOLVED" \? cover : null;/);
    expect(code.match(/<MediaImage\b/g)).toHaveLength(1);
    expect(code).toMatch(/<MediaImage media=\{card\} alt="" /);
  });

  it("after opening, focus moves to the Hero (programmatically focusable, never a tab stop); the controls leave the DOM", () => {
    expect(code).toMatch(/useEffect\(\(\) => \{\s*if \(opened\) focusHero\(stageRef\.current\);\s*\}, \[opened\]\);/);
    expect(code).toMatch(/closest\("main"\)\?\.querySelector<HTMLElement>\(`\.\$\{CSS\.escape\(styles\.hero\)\}`\)/);
    expect(code).toMatch(/hero\.tabIndex = -1;\s*hero\.focus\(\);/);
    expect(code).toMatch(/\{opened \? \(\s*<span className=\{styles\.openingEnvelopeButton\}>\{artwork\}<\/span>/);
    expect(code).toMatch(/\{sealed \? <p className=\{styles\.openingHint\}>\{COPY\.hint\}<\/p> : null\}/);
    expect(code).not.toMatch(/openingLetter/);
  });
});

describe("opening motion CSS (P13; Task029 choreography)", () => {
  function rule(selector: string): string {
    const index = css.indexOf(`${selector} {`);
    expect(index, selector).toBeGreaterThan(-1);
    return css.slice(index, css.indexOf("}", index));
  }

  it("seal → flap → card rise → dissolve, all finite, keyed on the opening phase", () => {
    expect(rule(".openingStage .envelopeSeal")).toMatch(/transition:\s*opacity 400ms[^;]*,\s*transform 400ms/);
    expect(rule(".openingStage .envelopeFlap")).toMatch(/transition: transform 850ms/);
    expect(rule('.openingStage:not([data-opening="sealed"]) .envelopeFlap')).toMatch(/transform: scaleY\(-1\);/);
    expect(rule('.openingStage[data-opening="opening"] .openingCard')).toMatch(/animation: ee-opening-card-rise 1200ms [^;]* 560ms both;/);
    expect(rule('.opening:has(.openingStage[data-opening="opening"])')).toMatch(/animation: ee-opening-dissolve 600ms [^;]* 2260ms both;/);
    expect(rule('.openingStage[data-opening="opening"]')).toMatch(/animation: ee-opening-settle 600ms linear 2260ms both;/);
    // Without a card the cover dissolves once the flap is open.
    expect(rule('.openingStage[data-opening="opening"][data-card="none"]')).toMatch(/animation-delay: 900ms;/);
    for (const name of ["ee-opening-card-rise", "ee-opening-dissolve", "ee-opening-settle", "ee-opening-hero-in"]) {
      expect(css).toContain(`@keyframes ${name} {`);
    }
    expect(css).not.toMatch(/ee-opening[^;{]*infinite/);
  });

  it("the card is clipped at the pocket opening (y 45 of 200) so it only emerges above it", () => {
    expect(rule(".openingCardClip")).toMatch(/clip-path: inset\(-400% -20% 77\.5% -20%\);/);
  });

  it("opened: the cover leaves the layout but stays in the document; only the envelope floats, only while sealed", () => {
    expect(rule('.opening:has(.openingStage[data-opening="opened"])')).toMatch(/position: absolute;[^}]*clip-path: inset\(50%\);/);
    expect(rule(".openingEnvelopeFloat")).toMatch(/animation: ee-envelope-float 4\.5s ease-in-out infinite;/);
    expect(rule('.openingStage:not([data-opening="sealed"]) .openingEnvelopeFloat')).toMatch(/animation: none;/);
  });

  it("prefers-reduced-motion: no choreography, no wait — the settle fires at once; every opening transition/animation is off", () => {
    const start = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(start).toBeGreaterThan(-1);
    const reduced = css.slice(start);
    for (const selector of [".openingStage .envelopeSeal", ".openingStage .envelopeFlap", ".opening .openingLabel"]) {
      expect(reduced).toMatch(new RegExp(`${selector.replace(/[.[\]()]/g, "\\$&")}[^{]*\\{\\s*transition: none;`, "s"));
    }
    for (const selector of [
      ".openingEnvelopeFloat",
      '.openingStage[data-opening="opening"] .openingCard',
      '.opening:has(.openingStage[data-opening="opening"])',
    ]) {
      expect(reduced).toContain(selector);
    }
    expect(reduced).toMatch(/\.openingStage\[data-opening="opening"\][^{]*\{\s*animation-duration: 1ms;\s*animation-delay: 0s;\s*\}/);
  });
});
