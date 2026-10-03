import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { MediaImage } from "./media-image";

const COPY = ELEGANT_EDITORIAL_V1_COPY;

interface GalleryProps {
  gallery: readonly MediaResolution[];
  coupleText: string;
}

/**
 * Editorial album (Design Baseline B5 item 14; P7, RF-03 M8, RF-04 R11;
 * PO two-column correction): the "Album ảnh cưới" kicker, then a uniform
 * two-column grid of 4:5 portrait tiles in canonical order, at any count.
 * There is no slot cycle and no span: every tile has the same shape, and an
 * odd last tile keeps the one-column width, centred (CSS).
 *
 * Items keep canonical order and count. A `RESOLVED` item renders its runtime
 * URL. An `UNAVAILABLE` item keeps its position as a neutral, non-interactive
 * tile with fixed copy: it is never removed, reordered or replaced, and it
 * never hides the section. Visibility is decided by the caller from
 * `sections.gallery` only.
 */
export function Gallery({ gallery, coupleText }: GalleryProps) {
  return (
    <section className={styles.galleryBand} aria-labelledby="ee-gallery-heading">
      <h2 id="ee-gallery-heading" className={styles.sectionKicker}>
        {COPY.gallery.heading}
      </h2>
      <ul className={styles.gallery}>
        {gallery.map((item, index) => (
          <li
            key={`${index}-${item.mediaId}`}
            className={styles.galleryItem}
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
        ))}
      </ul>
    </section>
  );
}
