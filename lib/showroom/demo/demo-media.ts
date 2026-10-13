import type { MediaResolution, MediaResolver } from "../../invitation-rendering/invitation-view-model-types";
import { PRODUCTION_RENDERER_MANIFESTS } from "../../../templates/core/production-renderer-manifests";

/**
 * LAUNCH-P0-04 — showroom demo imagery.
 *
 * Original abstract mood images (bokeh/silk textures, no people, no faces)
 * generated in this repository; provenance in `lib/showroom/demo/ASSETS.md`.
 * They stand in for a couple's photographs in public demos only and are never
 * a production fallback for any Project. A renderer with an entry in
 * `DEMO_LEGACY_ROLE_PHOTO_SETS` or `DEMO_TEMPLATE_SLOT_PHOTO_SETS` shows that
 * fictional photography instead.
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

/**
 * Fictional couple photography for one `TEMPLATE_SLOTS` renderer: editor
 * manifest slot key → images in slot position order. Authoritative for that
 * renderer: a slot it omits stays empty. Every key must be a declared slot
 * and every list must fit the slot's `maxCount` (checked when the demo is
 * built, fail closed). Provenance in `lib/showroom/demo/ASSETS.md`.
 */
export type DemoTemplateSlotPhotoSet = Readonly<Record<string, readonly DemoImage[]>>;

/** A WebP photo under `<folder>/photos/`; landscape photos are 1448×1086, portraits `portraitSize` (default 1086×1448). */
function folderPhoto(
  folder: string,
  name: string,
  orientation: "PORTRAIT" | "LANDSCAPE" = "PORTRAIT",
  portraitSize: readonly [number, number] = [1086, 1448],
): DemoImage {
  const [width, height] = orientation === "LANDSCAPE" ? [1448, 1086] : portraitSize;
  return Object.freeze({ file: `${folder}/photos/${name}.webp`, width, height, orientation });
}

const VH_PHOTOS = Object.freeze(
  [
    ["01-cover-doi-uyen-uong-ao-dai-tren-nen-do"],
    ["02-couple-portrait-ao-dai-sac-do-le-hoi"],
    ["03-bride-portrait-ao-dai-do-quat-xep"],
    ["04-groom-portrait-chu-re-ben-chu-hy-do"],
    ["05-tea-ceremony-traditional-vietnamese", "LANDSCAPE"],
    ["06-double-happiness-red-background"],
    ["07-couple-ao-dai-red-lanterns"],
    ["08-couple-portrait-with-double-happiness"],
    ["09-celebration-confetti-red"],
    ["10-playful-couple-ao-dai-red-black"],
  ].map(([name, orientation]) => folderPhoto("vietnamese-heritage", name ?? "", orientation === "LANDSCAPE" ? "LANDSCAPE" : "PORTRAIT")),
);

/** Romantic Minimal portraits are 1024×1536 (2:3); 02 and 10 are 1448×1086 landscapes. */
const RM_PHOTOS = Object.freeze(
  [
    ["01-save-the-date-umbrella-couple"],
    ["02-just-married-garden-couple", "LANDSCAPE"],
    ["03-our-love-bride-golden-garden"],
    ["04-our-love-lakeside-couple"],
    ["05-our-love-groom-garden"],
    ["06-golden-hour-dance"],
    ["07-garden-wedding-vows"],
    ["08-rose-petal-celebration"],
    ["09-wedding-couple-steps"],
    ["10-thank-you-ivory-bow", "LANDSCAPE"],
  ].map(([name, orientation]) =>
    folderPhoto("romantic-minimal", name ?? "", orientation === "LANDSCAPE" ? "LANDSCAPE" : "PORTRAIT", [1024, 1536]),
  ),
);

/** Numbered photo `n` (1-based, the file name prefix) of a set. */
function nth(photos: readonly DemoImage[], n: number): DemoImage {
  const photo = photos[n - 1];
  if (photo === undefined) throw new Error("Showroom demo photo number is out of range");
  return photo;
}

/**
 * The registered renderer key for one template identity, so frozen renderers
 * whose static boundary forbids their key literal outside their own files can
 * still be keyed here. Fails closed unless exactly one renderer matches.
 */
function registeredRendererKey(templateCode: string, versionNumber: number): string {
  const matches = PRODUCTION_RENDERER_MANIFESTS.filter(
    (manifest) => manifest.identity.templateCode === templateCode && manifest.identity.versionNumber === versionNumber,
  );
  const manifest = matches[0];
  if (manifest === undefined || matches.length !== 1) throw new Error("Showroom demo photo set names no single registered renderer");
  return manifest.compatibility.rendererKey;
}

/** Slot photo sets by exact renderer key. A renderer without one keeps the abstract mood images. */
export const DEMO_TEMPLATE_SLOT_PHOTO_SETS: Readonly<Record<string, DemoTemplateSlotPhotoSet>> = Object.freeze({
  // VH-V2-01: the public demo runs Vietnamese Heritage v2 (same slots as v1).
  "wedding.vietnamese-heritage.v2": Object.freeze({
    heroPhoto: Object.freeze([nth(VH_PHOTOS, 1)]),
    // Layout positions only (side / dominant centre / side), identical for every variant:
    // groom solo, couple portrait, bride solo.
    portraitCluster: Object.freeze([nth(VH_PHOTOS, 4), nth(VH_PHOTOS, 2), nth(VH_PHOTOS, 3)]),
    // Background under a dark overlay; the landscape tea ceremony.
    loveStoryPhoto: Object.freeze([nth(VH_PHOTOS, 5)]),
    // All ten in file-number order, except 05 and 06 swap so the landscape 05 lands on the
    // album's full-width "wide" row (position 6) instead of a tall pair (position 5).
    gallery: Object.freeze([1, 2, 3, 4, 6, 5, 7, 8, 9, 10].map((n) => nth(VH_PHOTOS, n))),
  }),
  // wedding.romantic-minimal.v1 (RM-02 keeps that key literal inside the renderer's own files).
  [registeredRendererKey("romantic-minimal", 1)]: Object.freeze({
    saveTheDatePhoto: Object.freeze([nth(RM_PHOTOS, 1)]),
    justMarriedPhoto: Object.freeze([nth(RM_PHOTOS, 2)]),
    // Positions 1, 2, 3: bride solo, couple by the lake, groom solo.
    ourLovePhotos: Object.freeze([nth(RM_PHOTOS, 3), nth(RM_PHOTOS, 4), nth(RM_PHOTOS, 5)]),
    // All ten, two per row of uniform 4:5 tiles. Opens on frames not already shown above
    // (06 dance / 07 vows, 09 close-up / 08 petals), then 01 / 04, the bride and groom
    // solos side by side, and the two landscapes last, leading into the Thank You photo.
    gallery: Object.freeze([6, 7, 9, 8, 1, 4, 3, 5, 2, 10].map((n) => nth(RM_PHOTOS, n))),
    thankYouPhoto: Object.freeze([nth(RM_PHOTOS, 10)]),
  }),
});

export function lookupDemoTemplateSlotPhotoSet(rendererKey: string): DemoTemplateSlotPhotoSet | undefined {
  return Object.hasOwn(DEMO_TEMPLATE_SLOT_PHOTO_SETS, rendererKey) ? DEMO_TEMPLATE_SLOT_PHOTO_SETS[rendererKey] : undefined;
}

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
  const slotPhotos = Object.values(DEMO_TEMPLATE_SLOT_PHOTO_SETS).flatMap((set) => Object.values(set).flat());
  return [...DEMO_IMAGES, ...photos, ...slotPhotos];
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
