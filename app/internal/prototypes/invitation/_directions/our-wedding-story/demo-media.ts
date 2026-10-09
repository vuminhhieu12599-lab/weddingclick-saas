import type { AlbumPhoto } from "../../_shared/types";

/**
 * Our Wedding Story — prototype-only demo media scenarios.
 *
 * Every image is self-generated abstract placeholder art in this template's
 * warm champagne tones, under `public/prototypes/invitation/demo/our-wedding-story/`
 * (no photography, no stock or third-party images, nothing watermarked).
 * The shared demo album keeps its order, alt text, dimensions and focal
 * points; only the placeholder file is swapped for a warm-toned one, since
 * the shared art is moss-green for the Green Ivory direction. The audio
 * file is the repository's own internal renderer-harness test tone.
 * Nothing here is customer data.
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

export function resolveOwsMedia(scenario: OwsMediaScenario, sharedAlbum: AlbumPhoto[]): OwsMedia {
  const album = sharedAlbum.map((photo, index) => ({
    ...photo,
    src: `${DEMO}gallery-${String((index % 10) + 1).padStart(2, "0")}.svg`,
  }));
  const full: OwsMedia = {
    coverUrl: `${DEMO}cover.svg`,
    groomPortraitUrl: `${DEMO}groom-portrait.svg`,
    bridePortraitUrl: `${DEMO}bride-portrait.svg`,
    couplePhotoUrl: `${DEMO}couple.svg`,
    closingPhotoUrl: `${DEMO}closing.svg`,
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
