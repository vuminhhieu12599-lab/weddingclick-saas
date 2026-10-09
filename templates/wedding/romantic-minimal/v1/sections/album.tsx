import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import { AlbumGrid } from "../interactive/album-viewer";
import styles from "../romantic-minimal-v1.module.css";
import { Ornament } from "./invite";

/**
 * Task 029 Wedding Album: script title and ornament over the two-column grid
 * of every `templateSlots.gallery` item in frozen slot order (no cap, never a
 * legacy GALLERY item), with the full-screen viewer island.
 */
export function Album({ gallery }: { gallery: readonly MediaResolution[] }) {
  return (
    <section className={styles.albumSection} aria-labelledby="rm-album-heading" data-island="gallery">
      <div className={styles.albumHeader}>
        <h2 id="rm-album-heading" className={styles.albumTitle}>
          {ROMANTIC_MINIMAL_V1_COPY.album.heading}
        </h2>
        <Ornament className={styles.albumOrnament} />
      </div>
      <AlbumGrid gallery={gallery} />
    </section>
  );
}
