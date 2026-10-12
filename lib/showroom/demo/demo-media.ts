import type { MediaResolution, MediaResolver } from "../../invitation-rendering/invitation-view-model-types";

/**
 * LAUNCH-P0-04 — showroom demo imagery.
 *
 * Original abstract mood images (bokeh/silk textures, no people, no faces)
 * generated in this repository; provenance in `lib/showroom/demo/ASSETS.md`.
 * They stand in for a couple's photographs in public demos only and are never
 * a production fallback for any Project. Swapping in licensed demo
 * photography means replacing files/dimensions in this one list.
 */

export const DEMO_MEDIA_BASE_PATH = "/showroom/demo/";

export type DemoImageOrientation = "PORTRAIT" | "LANDSCAPE" | "SQUARE";

export interface DemoImage {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly orientation: DemoImageOrientation;
}

export const DEMO_IMAGES: readonly DemoImage[] = Object.freeze([
  { file: "mood-champagne-portrait.webp", width: 900, height: 1200, orientation: "PORTRAIT" },
  { file: "mood-blush-bokeh-portrait.webp", width: 900, height: 1200, orientation: "PORTRAIT" },
  { file: "mood-sage-bokeh-portrait.webp", width: 900, height: 1200, orientation: "PORTRAIT" },
  { file: "mood-blush-silk-portrait.webp", width: 900, height: 1200, orientation: "PORTRAIT" },
  { file: "mood-dusk-bokeh-portrait.webp", width: 900, height: 1200, orientation: "PORTRAIT" },
  { file: "mood-champagne-landscape.webp", width: 1200, height: 900, orientation: "LANDSCAPE" },
  { file: "mood-blush-bokeh-landscape.webp", width: 1200, height: 900, orientation: "LANDSCAPE" },
  { file: "mood-blush-bokeh-square.webp", width: 1000, height: 1000, orientation: "SQUARE" },
  { file: "mood-gold-silk-square.webp", width: 1000, height: 1000, orientation: "SQUARE" },
] as const satisfies readonly DemoImage[]);

/**
 * Deterministic demo `MediaResolver` over the frozen RF-03 contract: every
 * demo media id resolves to its local image. An unknown id is a demo bug and
 * throws (never a guessed URL, never storage).
 */
export function createDemoMediaResolver(imageById: ReadonlyMap<string, DemoImage>): MediaResolver {
  return Object.freeze({
    async resolveMedia(mediaId: string): Promise<MediaResolution> {
      const image = imageById.get(mediaId);
      if (image === undefined) {
        throw new Error("Showroom demo media id has no demo image");
      }
      return {
        status: "RESOLVED",
        mediaId,
        url: `${DEMO_MEDIA_BASE_PATH}${image.file}`,
        width: image.width,
        height: image.height,
      };
    },
  });
}
