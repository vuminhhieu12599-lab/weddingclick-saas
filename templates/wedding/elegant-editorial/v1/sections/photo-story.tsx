import type { MediaResolution, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { MediaImage } from "./media-image";

const COPY = ELEGANT_EDITORIAL_V1_COPY.photoStory;

/** Task029 cluster capacity: anchor, even pair, offset pair (wide + narrow). */
const PHOTO_STORY_CAPACITY = 5;

type ClusterRow = "anchor" | "pair" | "offset";

/**
 * Rows for `count` photos, in Task029 order and never with an empty slot:
 * 5 → anchor + pair + offset; 4 → pair + offset; 3 → anchor + pair;
 * 2 → pair; 1 → anchor.
 */
function clusterRows(count: number): ClusterRow[] {
  switch (count) {
    case 5:
      return ["anchor", "pair", "offset"];
    case 4:
      return ["pair", "offset"];
    case 3:
      return ["anchor", "pair"];
    case 2:
      return ["pair"];
    case 1:
      return ["anchor"];
    default:
      return [];
  }
}

const ROW_SIZE: Readonly<Record<ClusterRow, number>> = { anchor: 1, pair: 2, offset: 2 };

interface PhotoStoryProps {
  /** `viewModel.media.photoStory` (canonical order); only RESOLVED items render. */
  items: readonly MediaResolution[];
  coupleText: string;
}

/**
 * Task029 Photo Story (docs/DECISIONS.md RF7 Photo Story amendment): the
 * five-photo editorial cluster between the Countdown and the Love Story,
 * from PHOTO_STORY media only (never Gallery). The first five RESOLVED
 * photos in canonical order fill the Task029 rows; with fewer, only whole
 * rows render (no empty or fake slot); with none, nothing renders. No
 * visible heading (Task029); the heading is an accessible name only.
 */
export function PhotoStory({ items, coupleText }: PhotoStoryProps) {
  const photos = items
    .filter((item): item is ResolvedMedia => item.status === "RESOLVED")
    .slice(0, PHOTO_STORY_CAPACITY);
  if (photos.length === 0) return null;

  const rows = clusterRows(photos.length);
  // Start index of each row, computed up front (pure render).
  const starts = rows.map((_, index) => rows.slice(0, index).reduce((sum, row) => sum + ROW_SIZE[row], 0));
  const tile = (photo: ResolvedMedia, className: string | undefined) => {
    const position = photos.indexOf(photo) + 1;
    return (
      <div key={`${position}-${photo.mediaId}`} className={className}>
        <MediaImage media={photo} alt={`${COPY.imageAlt} ${position} – ${coupleText}`} className={styles.photoStoryImage} />
      </div>
    );
  };

  return (
    <section className={styles.photoStory} aria-labelledby="ee-photo-story-heading">
      <h2 id="ee-photo-story-heading" className={styles.srOnly}>
        {COPY.heading}
      </h2>
      <div className={styles.photoStoryGrid}>
        {rows.map((row, index) => {
          const start = starts[index] ?? 0;
          const rowPhotos = photos.slice(start, start + ROW_SIZE[row]);
          if (row === "anchor") return tile(rowPhotos[0] as ResolvedMedia, styles.photoStoryAnchor);
          if (row === "pair") return rowPhotos.map((photo) => tile(photo, styles.photoStoryPairItem));
          return (
            <div key={`offset-${start}`} className={styles.photoStoryOffsetRow}>
              {tile(rowPhotos[0] as ResolvedMedia, styles.photoStoryOffsetWide)}
              {tile(rowPhotos[1] as ResolvedMedia, styles.photoStoryOffsetNarrow)}
            </div>
          );
        })}
      </div>
    </section>
  );
}
