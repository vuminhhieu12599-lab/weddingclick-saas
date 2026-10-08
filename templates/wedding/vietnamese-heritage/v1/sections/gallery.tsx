import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import { GalleryLightbox, type AlbumRowItems } from "../interactive/gallery-lightbox";
import styles from "../vietnamese-heritage-v1.module.css";
import { DecorImage } from "./decor";
import { albumPrintRatio, layoutHeritageAlbum, type HeritageAlbumRowKind } from "./gallery-layout";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.gallery;

const ROW_CLASS: Readonly<Record<HeritageAlbumRowKind, string | undefined>> = {
  large: styles.albumRowLarge,
  pair: styles.albumRowPair,
  tall: styles.albumRowTall,
  wide: styles.albumRowWide,
};

/**
 * Task 029 wedding album on ivory paper: the gold divider, "Album ảnh cưới"
 * and the script heading, then every `templateSlots.gallery` item in
 * frozen slot order (no cap, never a legacy GALLERY item) in the deterministic heritage row rhythm
 * (`layoutHeritageAlbum`). A `RESOLVED` item renders its runtime URL as a
 * framed print showing the whole photograph (VH-02A-QA1: contained on the
 * print's mat, never cropped; full-width rows take the photo's bounded own
 * ratio from `albumPrintRatio`); an `UNAVAILABLE` item keeps its slot as a neutral tile with
 * fixed copy, never removed, reordered or replaced (RF-04 R11). The
 * lightbox (VH-02B-M2) is the `GalleryLightbox` island, which renders these
 * rows with a real open button on every `RESOLVED` print.
 */
export function Gallery({ gallery }: { gallery: readonly MediaResolution[] }) {
  const rows: AlbumRowItems[] = layoutHeritageAlbum(gallery.length).map((row) => ({
    kind: row.kind,
    className: ROW_CLASS[row.kind] ?? "",
    items: row.indices.map((index) => {
      const media = gallery[index] as MediaResolution;
      return { index, media, ratio: albumPrintRatio(row.kind, media) };
    }),
  }));
  return (
    <section className={styles.album} aria-labelledby="vh-gallery-heading" data-island="gallery">
      <header className={styles.albumHeader}>
        <DecorImage decor="divider" className={styles.albumDivider} />
        <p className={styles.albumEyebrow}>{COPY.eyebrow}</p>
        <h2 id="vh-gallery-heading" className={styles.albumHeading}>
          {COPY.heading}
        </h2>
      </header>
      <GalleryLightbox rows={rows} />
    </section>
  );
}
