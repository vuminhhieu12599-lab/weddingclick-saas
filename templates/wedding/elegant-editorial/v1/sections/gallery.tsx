import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { MediaImage } from "./media-image";

const COPY = ELEGANT_EDITORIAL_V1_COPY;

/** Length of the Task029 `GALLERY_LAYOUT` cycle; each slot's span lives in CSS (`data-slot`). */
const GALLERY_CYCLE = 10;

/**
 * Cycle slots whose tile is half width and would end the album alone beside
 * an empty half (slots 1, 3 and 7 of the Task029 rhythm).
 */
const LONE_TAIL_SLOTS: ReadonlySet<number> = new Set([1, 3, 7]);

interface GalleryProps {
  gallery: readonly MediaResolution[];
  coupleText: string;
}

/**
 * Task029 editorial album (Design Baseline B5 item 14, D9; P7, RF-03 M8,
 * RF-04 R11): the "Album ảnh cưới" kicker, then a 4-column grid on a 44 px
 * row rhythm where item `i` takes Task029 cycle slot `i mod 10`. Placement is
 * sparse (never dense), so the grid never reorders canonical media. A final
 * lone half-width tile spans the full width instead (D9).
 *
 * Items keep canonical order and count. A `RESOLVED` item renders its runtime
 * URL. An `UNAVAILABLE` item keeps its slot as a neutral, non-interactive
 * tile with fixed copy: it is never removed, reordered or replaced, and it
 * never hides the section. Visibility is decided by the caller from
 * `sections.gallery` only.
 */
export function Gallery({ gallery, coupleText }: GalleryProps) {
  const lastIndex = gallery.length - 1;

  return (
    <section className={styles.galleryBand} aria-labelledby="ee-gallery-heading">
      <h2 id="ee-gallery-heading" className={styles.sectionKicker}>
        {COPY.gallery.heading}
      </h2>
      <ul className={styles.gallery}>
        {gallery.map((item, index) => {
          const slot = index % GALLERY_CYCLE;
          const loneTail = index === lastIndex && LONE_TAIL_SLOTS.has(slot);
          return (
            <li
              key={`${index}-${item.mediaId}`}
              className={styles.galleryItem}
              data-slot={slot}
              data-span={loneTail ? "full" : undefined}
              data-media-state={item.status === "RESOLVED" ? "resolved" : "unavailable"}
            >
              {item.status === "RESOLVED" ? (
                <MediaImage
                  media={item}
                  alt={`${COPY.gallery.imageAlt} ${index + 1} – ${coupleText}`}
                  className={styles.galleryImage}
                />
              ) : (
                <div className={styles.galleryUnavailable}>
                  <p>{COPY.gallery.unavailable}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
