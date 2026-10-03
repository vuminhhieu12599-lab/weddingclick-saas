import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { classifyMediaOrientation } from "../../../../../lib/invitation-rendering/media-orientation";
import { PhotoStory, planPhotoStoryTiles } from "../sections/photo-story";

/** Adaptive Photo Story (PO): orientation from real dimensions, sequential rows, placement CSS, spacing, Gallery untouched. */

let next = 0;
function photo(width: number | null, height: number | null): ResolvedMedia {
  next += 1;
  const id = `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`;
  return { status: "RESOLVED", mediaId: id, url: `https://media.invalid/${id}`, width, height };
}
const P = () => photo(960, 1200);
const L = () => photo(1800, 1200);
const S = () => photo(1200, 1200);
const layout = (photos: ResolvedMedia[]) => planPhotoStoryTiles(photos).map((tile) => `${tile.shape[0]}:${tile.placement}`);

describe("orientation classification", () => {
  it.each([
    [800, 1200, "PORTRAIT"],
    [880, 1000, "PORTRAIT"],
    [1800, 1200, "LANDSCAPE"],
    [1120, 1000, "LANDSCAPE"],
    [1200, 1200, "SQUARE"],
    [950, 1000, "SQUARE"],
    [1080, 1000, "SQUARE"],
  ] as const)("%i × %i → %s", (width, height, expected) => {
    expect(classifyMediaOrientation(width, height)).toBe(expected);
  });

  it("null, zero or non-integer dimensions → null (no fabricated orientation)", () => {
    expect([classifyMediaOrientation(null, null), classifyMediaOrientation(1200, null), classifyMediaOrientation(0, 10), classifyMediaOrientation(1.5, 2)]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("row composition", () => {
  it.each([
    ["two portraits → one equal pair", [P(), P()], ["p:left", "p:right"]],
    ["landscape → full-width row", [L()], ["l:wide"]],
    ["portrait + landscape → centred portrait, then landscape", [P(), L()], ["p:center", "l:wide"]],
    ["landscape + portrait → landscape, then centred portrait", [L(), P()], ["l:wide", "p:center"]],
    ["portrait + portrait + landscape", [P(), P(), L()], ["p:left", "p:right", "l:wide"]],
    ["mixed P, S, L, P, L", [P(), S(), L(), P(), L()], ["p:left", "s:right", "l:wide", "p:center", "l:wide"]],
    ["odd final portrait is centred", [P(), P(), P()], ["p:left", "p:right", "p:center"]],
    ["legacy null dimensions fall back to portrait", [photo(null, null), photo(null, null), L()], ["p:left", "p:right", "l:wide"]],
  ] as const)("%s", (_name, photos, expected) => {
    expect(layout([...photos])).toEqual(expected);
  });

  it("source order is preserved exactly (never reordered to fill a gap)", () => {
    const photos = [P(), L(), P(), P(), L()];
    expect(planPhotoStoryTiles(photos).map((tile) => tile.photo.mediaId)).toEqual(photos.map((item) => item.mediaId));
  });

  it("the renderer still shows only the first five RESOLVED photos, with placement attributes, in order", () => {
    const photos = [P(), L(), S(), P(), P(), L(), P()];
    const html = renderToStaticMarkup(<PhotoStory items={photos} coupleText="A và B" />);
    const tiles = [...html.matchAll(/data-shape="(\w+)" data-placement="(\w+)"><img [^>]*src="([^"]*)"/g)];
    expect(tiles.map((m) => m[3])).toEqual(photos.slice(0, 5).map((item) => item.url));
    expect(tiles.map((m) => `${m[1][0]}:${m[2]}`)).toEqual(["p:center", "l:wide", "s:left", "p:right", "p:center"]);
  });
});

describe("CSS: Photo Story placement, Love Story → RSVP spacing, Gallery untouched", () => {
  const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8");

  it("landscape rows are full-width 3:2 with a centred focus; portrait/square tiles stay 4:5; no dense flow", () => {
    expect(css).toMatch(/\.photoStoryTile\[data-placement="wide"\] \{\s*grid-column: 1 \/ -1;\s*aspect-ratio: 3 \/ 2;\s*\}/);
    expect(css).toMatch(/\.photoStoryTile\[data-placement="wide"\] \.photoStoryImage \{\s*object-position: 50% 50%;\s*\}/);
    expect(css).toMatch(/\.photoStoryTile \{\s*min-width: 0;\s*aspect-ratio: 4 \/ 5;\s*\}/);
    expect(css).not.toMatch(/grid-auto-flow:\s*dense/);
  });

  it("only the Love Story → RSVP transition gains space, from the gutter value", () => {
    expect(css.match(/\.storyBand \+ \.rsvpSection \{/g)).toHaveLength(2);
    expect(css).toMatch(/\.storyBand \+ \.rsvpSection \{\s*margin-top: var\(--ee-gutter\);\s*\}/);
    expect(css).toMatch(/@media \(min-width: 768px\) \{\s*\.storyBand \+ \.rsvpSection \{\s*margin-top: calc\(var\(--ee-gutter\) \* 1\.5\);/);
    expect(css).toMatch(/\.storyBand \{[^}]*padding: 44px 26px;/);
    expect(css).toMatch(/\.rsvpSection \{\s*padding: 6px 26px 40px;/);
  });

  it("Gallery markup and CSS are byte-identical to the approved version", () => {
    const gallerySource = readFileSync(join(__dirname, "..", "sections", "gallery.tsx"), "utf8");
    const galleryCss = css.slice(css.indexOf(".gallery {"), css.indexOf(".galleryUnavailable {"));
    const digest = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);
    expect({ source: digest(gallerySource), css: digest(galleryCss) }).toEqual({ source: GALLERY_SOURCE_DIGEST, css: GALLERY_CSS_DIGEST });
  });
});

// Digests of the PO-approved Gallery (two-column 4:5 correction), recorded before this task's changes.
const GALLERY_SOURCE_DIGEST = "ba1fb12854028262";
const GALLERY_CSS_DIGEST = "326567ec35ae9f90";
