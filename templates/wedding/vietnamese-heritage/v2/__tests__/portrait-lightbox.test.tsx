import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V2_COPY as COPY } from "../copy";
import { PortraitLightbox, portraitAlt, resolvedPortraits, stepPortrait } from "../interactive/portrait-lightbox";

/**
 * VH-V2-UI-03 portrait viewer. The approved composition (row, frames,
 * dominant centre, slot positions) stays covered by
 * vietnamese-heritage-v2.test.tsx; this file covers the open controls, the
 * viewer and the cluster-only sequence.
 */
const CEREMONIAL = COPY.ceremonial;

function resolved(n: number): MediaResolution {
  return { status: "RESOLVED", mediaId: `p${String(n)}`, url: `https://media.invalid/${String(n)}.jpg`, width: 900, height: 1200 };
}
const unavailable: MediaResolution = { status: "UNAVAILABLE", mediaId: "gone" };

const render = (cluster: readonly MediaResolution[]) => renderToStaticMarkup(<PortraitLightbox cluster={cluster} />);
const opens = (html: string) =>
  [...html.matchAll(/<button type="button" class="[^"]*portraitOpen[^"]*" aria-haspopup="dialog" aria-label="([^"]*)"/g)].map((m) => m[1]);

describe("VH-V2-UI-03 portrait open controls", () => {
  it("each portrait opens the viewer, keeping the approved row, positions and dominant centre", () => {
    const html = render([resolved(1), resolved(2), resolved(3)]);
    expect(html).toMatch(/portraitRow[^"]*" data-count="3"/);
    expect([...html.matchAll(/data-position="(\d)"/g)].map((m) => m[1])).toStrictEqual(["1", "2", "3"]);
    expect(html).toMatch(/data-position="2" data-emphasis="center"/);
    expect(opens(html)).toStrictEqual([`${CEREMONIAL.portraitOpen} 1`, `${CEREMONIAL.portraitOpen} 2`, `${CEREMONIAL.portraitOpen} 3`]);
    // Thumbnails are in the server markup, so the cluster is visible without JavaScript.
    expect(html.match(/<img /g)).toHaveLength(3);
  });

  it("an UNAVAILABLE slot is skipped, never opened and never substituted", () => {
    const html = render([resolved(1), unavailable, resolved(3)]);
    expect(html).toMatch(/portraitRow[^"]*" data-count="2"/);
    // Each kept portrait keeps its own slot position (1 and 3, never renumbered to 1 and 2),
    // and with two photos neither is the dominant centre.
    expect([...html.matchAll(/data-position="(\d)"/g)].map((m) => m[1])).toStrictEqual(["1", "3"]);
    expect(opens(html)).toStrictEqual([`${CEREMONIAL.portraitOpen} 1`, `${CEREMONIAL.portraitOpen} 3`]);
    expect(html).not.toContain("data-emphasis");
    expect(html).not.toContain("gone");
    expect(resolvedPortraits([unavailable, resolved(2)]).map((entry) => entry.media.mediaId)).toStrictEqual(["p2"]);
  });

  it("no resolved portrait → nothing at all, not an empty row or viewer", () => {
    expect(render([])).toBe("");
    expect(render([unavailable])).toBe("");
  });

  it("the viewer is a closed native dialog of its own, never the album's", () => {
    const html = render([resolved(1)]);
    const dialog = html.slice(html.indexOf("<dialog"), html.indexOf("</dialog>") + 9);
    expect(dialog).toMatch(new RegExp(`^<dialog class="[^"]*portraitViewer[^"]*" aria-label="${CEREMONIAL.portraitViewerLabel}"></dialog>$`));
    expect(html).not.toMatch(/albumOpen|"[^"]*viewerStage/);
  });

  it("alt text keeps the slot position, never the viewer position", () => {
    expect(portraitAlt(3)).toBe(`${CEREMONIAL.portraitAlt} 3`);
  });
});

describe("VH-V2-UI-03 viewer sequence", () => {
  it("navigation wraps inside the cluster only", () => {
    expect(stepPortrait(0, -1, 3)).toBe(2);
    expect(stepPortrait(2, 1, 3)).toBe(0);
    // One photo stays on itself; the arrows are not rendered at all (source contract below).
    expect(stepPortrait(0, 1, 1)).toBe(0);
  });
});

describe("VH-V2-UI-03 source contract", () => {
  const dir = join(__dirname, "..");
  const code = readFileSync(join(dir, "interactive", "portrait-lightbox.tsx"), "utf8");

  it("opens the exact portrait, ✕/backdrop close at once, Escape via native close, arrows, focus back to the opener", () => {
    expect(code).toMatch(/onClick=\{\(event\) => openAt\(slotPosition, event\.currentTarget\)\}/);
    expect(code).toMatch(/const at = sequence\.findIndex\(\(photo\) => photo\.position === slotPosition\);/);
    expect(code).toMatch(/if \(open && !dialog\.open\) dialog\.showModal\(\);/);
    expect(code).toMatch(/function requestClose\(\) \{[\s\S]*?dialog\.close\(\);\s*finishClose\(\);/);
    expect(code).toMatch(/aria-label=\{COPY\.portraitClose\} onClick=\{requestClose\}/);
    expect(code).toMatch(/if \(event\.target === event\.currentTarget\) requestClose\(\);/);
    expect(code).toMatch(/function handleNativeClose\(\) \{\s*if \(dialogRef\.current\?\.open === true\) return;\s*if \(open\) finishClose\(\);/);
    expect(code).toMatch(/openerRef\.current\?\.focus\(\{ preventScroll: true \}\);/);
    expect(code).toMatch(/event\.key === "ArrowRight"[\s\S]*?step\(1\)[\s\S]*?event\.key === "ArrowLeft"[\s\S]*?step\(-1\)/);
    // A single portrait hides the arrows; the count is the viewer position.
    expect(code).toMatch(/const navigable = sequence\.length > 1;/);
    expect(code).toMatch(/\{navigable \? \(/);
    expect(code).toMatch(/\{String\(\(position \?\? 0\) \+ 1\)\} \/ \{String\(sequence\.length\)\}/);
    const executable = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(executable).not.toMatch(/figcaption|download|share|fetch|localStorage|sessionStorage/);
  });

  it("the viewer shows the whole photograph, is reachable on a phone, and leaves the album lightbox alone", () => {
    const css = readFileSync(join(dir, "vietnamese-heritage-v2.module.css"), "utf8");
    expect(css).toMatch(/\.portraitViewerImage \{[^}]*object-fit: contain;/);
    expect(css).toMatch(/\.portraitViewer::backdrop \{\s*background: color-mix\(/);
    expect(css).toMatch(/\.portraitViewerClose,\n\.portraitViewerNav \{[^}]*width: 44px;\s*height: 44px;/);
    // The approved portrait composition is unchanged.
    expect(css).toMatch(/\.portraitPhoto \{[^}]*aspect-ratio: 3 \/ 4\.2;\s*object-fit: cover;/);
    expect(css).toMatch(/\.portraitFrame\[data-emphasis="center"\] \.portraitPhoto \{\s*aspect-ratio: 3 \/ 4\.3;\s*\}/);
    // The album lightbox keeps its own classes and rules.
    expect(css).toMatch(/\.viewerImage \{[^}]*object-fit: contain;/);
    expect(readFileSync(join(dir, "interactive", "gallery-lightbox.tsx"), "utf8")).toContain("export function GalleryLightbox(");
  });
});
