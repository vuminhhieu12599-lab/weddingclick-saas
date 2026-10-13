import type { MediaResolution, MediaResolver } from "../../invitation-rendering/invitation-view-model-types";

/**
 * LAUNCH-P0-04 — showroom demo imagery.
 *
 * Original abstract mood images (bokeh/silk textures, no people, no faces)
 * generated in this repository; provenance in `lib/showroom/demo/ASSETS.md`.
 * They stand in for a couple's photographs in public demos only and are never
 * a production fallback for any Project. A renderer with an entry in
 * `DEMO_LEGACY_ROLE_PHOTO_SETS` shows that fictional photography instead.
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
 * Fictional couple photography for one `LEGACY_ROLES` renderer, by media
 * role. Files live under `DEMO_MEDIA_BASE_PATH`; provenance in
 * `lib/showroom/demo/ASSETS.md`. AI-generated people (no real couple, client
 * or portfolio), so unlike the abstract mood images they may fill the
 * person-bound portrait roles.
 */
export interface DemoLegacyRolePhotoSet {
  readonly cover: DemoImage;
  readonly groomPortrait: DemoImage;
  readonly bridePortrait: DemoImage;
  /** In canonical order; the renderer lays these out by real orientation. */
  readonly photoStory: readonly DemoImage[];
  readonly loveStoryPhoto: DemoImage;
  readonly gallery: readonly DemoImage[];
}

function elegantEditorialPhoto(name: string, orientation: DemoImageOrientation = "PORTRAIT"): DemoImage {
  const [width, height] = orientation === "LANDSCAPE" ? [1448, 1086] : [1122, 1402];
  return Object.freeze({ file: `elegant-editorial/photos/${name}.webp`, width, height, orientation });
}

const EE_COVER = elegantEditorialPhoto("01-cover-couple-portrait");
const EE_SEATED = elegantEditorialPhoto("02-seated-editorial");
const EE_JOYFUL = elegantEditorialPhoto("03-joyful-couple");
/** File name says "couple", but the frame is the groom alone (`12-groom-portrait` is a byte-identical copy). */
const EE_GROOM = elegantEditorialPhoto("04-ceremony-couple");
const EE_CLOSE = elegantEditorialPhoto("05-close-couple");
const EE_GAZE = elegantEditorialPhoto("06-couple-gaze");
const EE_INTIMATE = elegantEditorialPhoto("07-couple-intimate");
const EE_PLAYFUL = elegantEditorialPhoto("08-couple-playful");
/** `11-bride-portrait` is a byte-identical copy of this file and is not used. */
const EE_BRIDE = elegantEditorialPhoto("09-bride-full-length");
const EE_WIDE = elegantEditorialPhoto("10-wide-couple", "LANDSCAPE");

/** Photo sets by exact renderer key. A renderer without one keeps the abstract mood images. */
export const DEMO_LEGACY_ROLE_PHOTO_SETS: Readonly<Record<string, DemoLegacyRolePhotoSet>> = Object.freeze({
  "wedding.elegant-editorial.v1": Object.freeze({
    cover: EE_COVER,
    groomPortrait: EE_GROOM,
    bridePortrait: EE_BRIDE,
    // Two portraits, the landscape as a full-width row, two portraits.
    photoStory: Object.freeze([EE_SEATED, EE_CLOSE, EE_WIDE, EE_GAZE, EE_INTIMATE]),
    loveStoryPhoto: EE_PLAYFUL,
    // All ten distinct frames, cover last so the gallery does not open on it.
    gallery: Object.freeze([EE_JOYFUL, EE_GAZE, EE_PLAYFUL, EE_SEATED, EE_INTIMATE, EE_CLOSE, EE_BRIDE, EE_GROOM, EE_WIDE, EE_COVER]),
  }),
});

export function lookupDemoLegacyRolePhotoSet(rendererKey: string): DemoLegacyRolePhotoSet | undefined {
  return Object.hasOwn(DEMO_LEGACY_ROLE_PHOTO_SETS, rendererKey) ? DEMO_LEGACY_ROLE_PHOTO_SETS[rendererKey] : undefined;
}

/** Every local demo image a demo may reference (mood images and photo sets). */
export function allDemoImages(): DemoImage[] {
  const photos = Object.values(DEMO_LEGACY_ROLE_PHOTO_SETS).flatMap((set) => [
    set.cover,
    set.groomPortrait,
    set.bridePortrait,
    ...set.photoStory,
    set.loveStoryPhoto,
    ...set.gallery,
  ]);
  return [...DEMO_IMAGES, ...photos];
}

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
