import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { GalleryLightbox } from "../interactive/gallery-lightbox";

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
 *
 * EE-V1-UI-01: the grid itself lives in the album island, which adds only the
 * open control on each `RESOLVED` tile and the viewer. The layout, crop,
 * order, spacing and `UNAVAILABLE` tile are unchanged.
 */
export function Gallery({ gallery, coupleText }: GalleryProps) {
  return (
    <section className={styles.galleryBand} aria-labelledby="ee-gallery-heading">
      <h2 id="ee-gallery-heading" className={styles.sectionKicker}>
        {COPY.gallery.heading}
      </h2>
      <GalleryLightbox gallery={gallery} coupleText={coupleText} />
    </section>
  );
}
