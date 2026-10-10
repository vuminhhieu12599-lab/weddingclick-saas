import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import { GalleryGrid } from "../interactive/gallery-viewer";
import styles from "../our-wedding-story-v1.module.css";
import { SectionHead } from "./section-head";

const COPY = OUR_WEDDING_STORY_V1_COPY.gallery;

/**
 * Visual Freeze v1 "Our Gallery — Khoảnh Khắc Của Chúng Mình": every
 * `templateSlots.gallery` item in frozen slot order (no cap, never a legacy
 * GALLERY item) in the magazine rows, with the full-screen viewer island and
 * the tap hint.
 */
export function Gallery({ number, gallery }: { number: string; gallery: readonly MediaResolution[] }) {
  return (
    <section className={styles.section} aria-labelledby="ows-gallery-heading" data-island="gallery">
      <SectionHead number={number} kicker={COPY.kicker} title={COPY.title} headingId="ows-gallery-heading" />
      <GalleryGrid gallery={gallery} />
      <p className={styles.galleryHint}>{COPY.hint}</p>
    </section>
  );
}
