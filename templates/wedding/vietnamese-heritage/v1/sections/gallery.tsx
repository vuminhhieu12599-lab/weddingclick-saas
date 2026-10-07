import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { MediaImage } from "./media-image";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.gallery;

/**
 * Task 029 wedding album: every `media.gallery` item in canonical order
 * (RF-03 M8; no cap). A `RESOLVED` item renders its runtime URL; an
 * `UNAVAILABLE` item keeps its position as a neutral tile with fixed copy,
 * never removed, reordered or replaced (RF-04 R11). The orientation-aware
 * album arrangement and the lightbox are VH-02.
 */
export function Gallery({ gallery }: { gallery: readonly MediaResolution[] }) {
  return (
    <section className={styles.gallery} aria-labelledby="vh-gallery-heading">
      <h2 id="vh-gallery-heading" className={styles.sectionTitle}>
        {COPY.heading}
      </h2>
      <ul className={styles.galleryGrid}>
        {gallery.map((item, index) => (
          <li key={`${item.mediaId}-${String(index)}`} className={styles.galleryItem} data-status={item.status}>
            {item.status === "RESOLVED" ? (
              <MediaImage media={item} alt={`${COPY.imageAlt} ${String(index + 1)}`} className={styles.galleryPhoto} />
            ) : (
              <span className={styles.galleryUnavailable}>{COPY.unavailable}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
