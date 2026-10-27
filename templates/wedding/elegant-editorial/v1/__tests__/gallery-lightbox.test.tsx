import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";

vi.mock("../fonts", () => ({ ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables" }));

const { GalleryLightbox, photoAlt, stepViewer, viewerSequence } = await import("../interactive/gallery-lightbox");
const { ELEGANT_EDITORIAL_V1_COPY: COPY } = await import("../copy");

/**
 * EE-V1-UI-01 album lightbox. The grid itself (two columns, 4:5 crop,
 * canonical order, `UNAVAILABLE` tile) is covered by
 * elegant-editorial-v1.test.tsx and the photo-story digest guard; this file
 * covers only the open controls, the viewer and the sequence rules.
 */
const COUPLE = "Gia Huy & Khánh Linh";

function resolved(n: number): MediaResolution {
  return { status: "RESOLVED", mediaId: `m${String(n)}`, url: `https://media.invalid/${String(n)}.jpg`, width: 1200, height: 1500 };
}
const unavailable: MediaResolution = { status: "UNAVAILABLE", mediaId: "gone" };

const render = (gallery: readonly MediaResolution[]) => renderToStaticMarkup(<GalleryLightbox gallery={gallery} coupleText={COUPLE} />);

describe("EE-V1-UI-01 album open controls", () => {
  it("every RESOLVED tile opens the viewer; an UNAVAILABLE tile stays non-interactive", () => {
    const html = render([resolved(1), unavailable, resolved(2)]);
    const opens = [...html.matchAll(/<button type="button" class="[^"]*galleryOpen[^"]*" aria-haspopup="dialog" aria-label="([^"]*)"/g)];
    // One control per RESOLVED tile, labelled by canonical album position (1 and 3 here, not 1 and 2).
    expect(opens.map((match) => match[1])).toStrictEqual([`${COPY.gallery.open} 1`, `${COPY.gallery.open} 3`]);
    expect(html).toContain(COPY.gallery.unavailable);
    // The unavailable tile has no control of its own.
    expect(html.match(/<button/g)).toHaveLength(2);
    // Thumbnails are in the server markup, so the album is visible without JavaScript.
    expect(html.match(/<img /g)).toHaveLength(2);
  });

  it("alt text keeps the canonical position and the couple, never the viewer position", () => {
    expect(photoAlt(2, COUPLE)).toBe(`${COPY.gallery.imageAlt} 3 – ${COUPLE}`);
    // The markup escapes the "&" in the couple line, so match the attribute itself.
    expect(render([unavailable, resolved(1)])).toContain(`alt="${COPY.gallery.imageAlt} 2 – Gia Huy &amp; Khánh Linh"`);
  });

  it("the viewer is a closed native dialog until a tile is opened", () => {
    const html = render([resolved(1), resolved(2)]);
    const dialog = html.slice(html.indexOf("<dialog"), html.indexOf("</dialog>") + 9);
    expect(dialog).toMatch(new RegExp(`^<dialog class="[^"]*galleryViewer[^"]*" aria-label="${COPY.gallery.viewerLabel}"></dialog>$`));
    expect(dialog).not.toMatch(/galleryViewerClose|galleryViewerNav|galleryViewerCount/);
  });

  it("an empty album renders the grid and the viewer, and opens nothing", () => {
    const html = render([]);
    expect(html).not.toMatch(/<button|<img /);
    expect(viewerSequence([])).toStrictEqual([]);
  });
});

describe("EE-V1-UI-01 viewer sequence", () => {
  it("only RESOLVED items, in canonical order, each keeping its album index", () => {
    expect(viewerSequence([unavailable, resolved(1), unavailable, resolved(2)]).map((photo) => photo.index)).toStrictEqual([1, 3]);
  });

  it("navigation wraps in both directions", () => {
    expect(stepViewer(0, -1, 3)).toBe(2);
    expect(stepViewer(2, 1, 3)).toBe(0);
    expect(stepViewer(0, 1, 3)).toBe(1);
    // A single photo always stays on itself.
    expect(stepViewer(0, 1, 1)).toBe(0);
    expect(stepViewer(0, -1, 1)).toBe(0);
  });
});

describe("EE-V1-UI-01 source contract", () => {
  const code = readFileSync(join(__dirname, "..", "interactive", "gallery-lightbox.tsx"), "utf8");

  it("opens the exact photo, ✕/backdrop close at once, Escape via native close, arrows, focus back to the opener", () => {
    expect(code).toMatch(/onClick=\{\(event\) => openAt\(index, event\.currentTarget\)\}/);
    expect(code).toMatch(/const at = sequence\.findIndex\(\(photo\) => photo\.index === index\);/);
    expect(code).toMatch(/if \(open && !dialog\.open\) dialog\.showModal\(\);/);
    expect(code).toMatch(/function requestClose\(\) \{[\s\S]*?dialog\.close\(\);\s*finishClose\(\);/);
    expect(code).toMatch(/aria-label=\{COPY\.close\} onClick=\{requestClose\}/);
    expect(code).toMatch(/if \(event\.target === event\.currentTarget\) requestClose\(\);/);
    expect(code).toMatch(/function handleNativeClose\(\) \{\s*if \(dialogRef\.current\?\.open === true\) return;\s*if \(open\) finishClose\(\);/);
    expect(code).toMatch(/openerRef\.current\?\.focus\(\{ preventScroll: true \}\);/);
    expect(code).toMatch(/event\.key === "ArrowRight"[\s\S]*?step\(1\)[\s\S]*?event\.key === "ArrowLeft"[\s\S]*?step\(-1\)/);
    // Previous / next exist only with more than one photo; the count is the viewer position.
    expect(code).toMatch(/const navigable = sequence\.length > 1;/);
    expect(code).toMatch(/\{navigable \? \(/);
    expect(code).toMatch(/\{String\(\(position \?\? 0\) \+ 1\)\} \/ \{String\(sequence\.length\)\}/);
    // No caption, download, share or zoom; nothing is fetched or stored.
    const executable = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(executable).not.toMatch(/figcaption|download|share|fetch|localStorage|sessionStorage/);
  });

  it("the viewer shows the whole photograph and is reachable on a phone", () => {
    const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8");
    expect(css).toMatch(/\.galleryViewerImage \{[^}]*object-fit: contain;/);
    expect(css).toMatch(/\.galleryViewer::backdrop \{\s*background-color: color-mix\(/);
    // Touch targets: the ✕ and the arrows are 44px.
    expect(css).toMatch(/\.galleryViewerClose,\n\.galleryViewerNav \{[^}]*width: 44px;\s*height: 44px;/);
    // The approved grid rules are untouched by the viewer.
    expect(css).toMatch(/\.gallery \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*gap: 8px;\s*\}/);
  });
});
