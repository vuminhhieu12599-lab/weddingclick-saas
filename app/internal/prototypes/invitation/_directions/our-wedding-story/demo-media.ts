import type { AlbumPhoto } from "../../_shared/types";

/**
 * Our Wedding Story — prototype-only demo media scenarios.
 *
 * Every image is from the Product Owner's AI demo photo pack v1 (a fictional
 * couple — not customers, no studio watermark), stored as optimized WebP under
 * `public/prototypes/invitation/demo/our-wedding-story/`. They are review
 * media only and must never become production renderer defaults. The older
 * abstract `.svg` placeholders in the same folder are kept, unused, for now.
 * The shared demo album keeps its order and alt text; each photo's real
 * dimensions and face-centred focal point are set here, because the gallery
 * places photos by orientation and the shared metadata describes the old
 * placeholders. The audio file is the repository's own internal
 * renderer-harness test tone. Nothing here is customer data.
 *
 * Scenarios exist so reviewers can check the missing-media states (no
 * empty frames, text-only fallbacks, 3–4 photo gallery) without editing
 * code. They are a review aid, not a product setting.
 */
export const OWS_MEDIA_SCENARIOS = [
  { key: "full", label: "Đủ ảnh (10)" },
  { key: "gallery4", label: "Album 4 ảnh" },
  { key: "gallery3", label: "Album 3 ảnh" },
  { key: "partial", label: "Thiếu vài ảnh" },
  { key: "none", label: "Không ảnh, không nhạc" },
] as const;

export type OwsMediaScenario = (typeof OWS_MEDIA_SCENARIOS)[number]["key"];

export interface OwsMedia {
  coverUrl?: string;
  groomPortraitUrl?: string;
  bridePortraitUrl?: string;
  couplePhotoUrl?: string;
  closingPhotoUrl?: string;
  album: AlbumPhoto[];
  audioUrl?: string;
}

const DEMO = "/prototypes/invitation/demo/our-wedding-story/";
const DEMO_AUDIO_URL = "/internal/renderer-harness/audio-tone.wav";

/**
 * Real pixel size of gallery-01…10.webp, with a focal point on the faces
 * (0–1, from the top-left) so no crop cuts them off. The two detail crops
 * (09, 10) have no faces and stay centred.
 */
const DEMO_ALBUM_PHOTOS: Pick<AlbumPhoto, "width" | "height" | "focalPoint">[] = [
  { width: 1122, height: 1402, focalPoint: { x: 0.5, y: 0.22 } },
  { width: 1122, height: 1402, focalPoint: { x: 0.5, y: 0.24 } },
  { width: 1122, height: 1402, focalPoint: { x: 0.52, y: 0.22 } },
  { width: 1086, height: 1448, focalPoint: { x: 0.56, y: 0.06 } },
  { width: 1500, height: 1000, focalPoint: { x: 0.57, y: 0.28 } },
  { width: 1122, height: 1402, focalPoint: { x: 0.57, y: 0.21 } },
  { width: 1122, height: 1402, focalPoint: { x: 0.52, y: 0.22 } },
  { width: 1500, height: 1000, focalPoint: { x: 0.52, y: 0.26 } },
  { width: 819, height: 673 },
  { width: 887, height: 631 },
];

export function resolveOwsMedia(scenario: OwsMediaScenario, sharedAlbum: AlbumPhoto[]): OwsMedia {
  const album = sharedAlbum.map((photo, index) => {
    const demo = DEMO_ALBUM_PHOTOS[index % DEMO_ALBUM_PHOTOS.length];
    return {
      ...photo,
      src: `${DEMO}gallery-${String((index % 10) + 1).padStart(2, "0")}.webp`,
      width: demo.width,
      height: demo.height,
      focalPoint: demo.focalPoint,
    };
  });
  const full: OwsMedia = {
    coverUrl: `${DEMO}cover.webp`,
    groomPortraitUrl: `${DEMO}groom-portrait.webp`,
    bridePortraitUrl: `${DEMO}bride-portrait.webp`,
    couplePhotoUrl: `${DEMO}couple.webp`,
    closingPhotoUrl: `${DEMO}closing.webp`,
    album,
    audioUrl: DEMO_AUDIO_URL,
  };

  switch (scenario) {
    case "gallery4":
      return { ...full, album: album.slice(0, 4) };
    case "gallery3":
      return { ...full, album: album.slice(0, 3) };
    case "partial":
      return {
        ...full,
        bridePortraitUrl: undefined,
        couplePhotoUrl: undefined,
        closingPhotoUrl: undefined,
        album: album.slice(0, 4),
      };
    case "none":
      return { album: [] };
    default:
      return full;
  }
}
