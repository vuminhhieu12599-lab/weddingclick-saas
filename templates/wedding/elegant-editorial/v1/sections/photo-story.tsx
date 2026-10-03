import type { MediaResolution, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { classifyMediaOrientation } from "../../../../../lib/invitation-rendering/media-orientation";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { MediaImage } from "./media-image";

const COPY = ELEGANT_EDITORIAL_V1_COPY.photoStory;

/** Task029 composition capacity (docs/DECISIONS.md RF7 Photo Story amendment): the first five RESOLVED photos. */
const PHOTO_STORY_CAPACITY = 5;

/** Frame shape of one tile: landscape photos get a wide row; portrait and (near-)square share the 4:5 frame. */
export type PhotoStoryShape = "portrait" | "square" | "landscape";

/** Where a tile sits in its row: a pair's left/right column, alone centred, or a full-width landscape row. */
export type PhotoStoryPlacement = "left" | "right" | "center" | "wide";

export interface PhotoStoryTilePlan {
  readonly photo: ResolvedMedia;
  readonly shape: PhotoStoryShape;
  readonly placement: PhotoStoryPlacement;
}

/**
 * Shape from the photo's real dimensions. Legacy rows without dimensions
 * fall back to portrait (the safe 4:5 presentation); nothing is fabricated.
 */
export function photoStoryShape(photo: Pick<ResolvedMedia, "width" | "height">): PhotoStoryShape {
  const orientation = classifyMediaOrientation(photo.width, photo.height);
  if (orientation === "LANDSCAPE") return "landscape";
  if (orientation === "SQUARE") return "square";
  return "portrait";
}

/**
 * Sequential rows in canonical order (never reordered to fill a gap): a
 * landscape photo is its own full-width row; two consecutive non-landscape
 * photos share a row; a non-landscape photo followed by a landscape one, or
 * left last, sits alone, centred at one-column width.
 */
export function planPhotoStoryTiles(photos: readonly ResolvedMedia[]): PhotoStoryTilePlan[] {
  const shapes = photos.map(photoStoryShape);
  const plan: PhotoStoryTilePlan[] = [];
  for (let index = 0; index < photos.length; index += 1) {
    const shape = shapes[index];
    if (shape === "landscape") {
      plan.push({ photo: photos[index], shape, placement: "wide" });
      continue;
    }
    const next = shapes[index + 1];
    if (next !== undefined && next !== "landscape") {
      plan.push({ photo: photos[index], shape, placement: "left" });
      plan.push({ photo: photos[index + 1], shape: next, placement: "right" });
      index += 1;
      continue;
    }
    plan.push({ photo: photos[index], shape, placement: "center" });
  }
  return plan;
}

interface PhotoStoryProps {
  /** `viewModel.media.photoStory` (canonical order); only RESOLVED items render. */
  items: readonly MediaResolution[];
  coupleText: string;
}

/**
 * Task029 Photo Story (docs/DECISIONS.md RF7 Photo Story amendment; PO
 * two-column and adaptive-orientation corrections): between the Countdown
 * and the Love Story, from PHOTO_STORY media only (never Gallery). The first
 * five RESOLVED photos in canonical order are laid out by their real
 * orientation (see `planPhotoStoryTiles`): 4:5 tiles in a two-column grid,
 * landscape photos as full-width 3:2 rows. With none, nothing renders, and
 * there is never an empty or fake slot. No visible heading (Task029); the
 * heading is an accessible name only.
 */
export function PhotoStory({ items, coupleText }: PhotoStoryProps) {
  const photos = items
    .filter((item): item is ResolvedMedia => item.status === "RESOLVED")
    .slice(0, PHOTO_STORY_CAPACITY);
  if (photos.length === 0) return null;

  return (
    <section className={styles.photoStory} aria-labelledby="ee-photo-story-heading">
      <h2 id="ee-photo-story-heading" className={styles.srOnly}>
        {COPY.heading}
      </h2>
      <div className={styles.photoStoryGrid}>
        {planPhotoStoryTiles(photos).map(({ photo, shape, placement }, index) => (
          <div
            key={`${index + 1}-${photo.mediaId}`}
            className={styles.photoStoryTile}
            data-shape={shape}
            data-placement={placement}
          >
            <MediaImage
              media={photo}
              alt={`${COPY.imageAlt} ${index + 1} – ${coupleText}`}
              className={styles.photoStoryImage}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
