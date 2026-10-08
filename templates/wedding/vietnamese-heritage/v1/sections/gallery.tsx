import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { DecorImage } from "./decor";
import { layoutHeritageAlbum, type HeritageAlbumRowKind } from "./gallery-layout";
import { MediaImage } from "./media-image";

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
 * framed print; an `UNAVAILABLE` item keeps its slot as a neutral tile with
 * fixed copy, never removed, reordered or replaced (RF-04 R11). The
 * lightbox is VH-02B.
 */
export function Gallery({ gallery }: { gallery: readonly MediaResolution[] }) {
  const rows = layoutHeritageAlbum(gallery.length);
  return (
    <section className={styles.album} aria-labelledby="vh-gallery-heading" data-island="gallery">
      <header className={styles.albumHeader}>
        <DecorImage decor="divider" className={styles.albumDivider} />
        <p className={styles.albumEyebrow}>{COPY.eyebrow}</p>
        <h2 id="vh-gallery-heading" className={styles.albumHeading}>
          {COPY.heading}
        </h2>
      </header>
      <ul className={styles.albumRows}>
        {rows.map((row) => (
          <li key={row.indices[0]} className={`${styles.albumRow} ${ROW_CLASS[row.kind] ?? ""}`} data-row={row.kind}>
            {row.indices.map((index) => {
              const item = gallery[index] as MediaResolution;
              return (
                <div key={`${item.mediaId}-${String(index)}`} className={styles.albumPrint} data-status={item.status} data-index={index}>
                  {item.status === "RESOLVED" ? (
                    <MediaImage media={item} alt={`${COPY.imageAlt} ${String(index + 1)}`} className={styles.albumPhoto} />
                  ) : (
                    <span className={styles.albumUnavailable}>{COPY.unavailable}</span>
                  )}
                </div>
              );
            })}
          </li>
        ))}
      </ul>
    </section>
  );
}
