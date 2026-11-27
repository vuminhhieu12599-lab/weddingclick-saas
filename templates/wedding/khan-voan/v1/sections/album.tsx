import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { KHAN_VOAN_V1_COPY } from "../copy";
import { AlbumGrid } from "../interactive/album-viewer";
import styles from "../khan-voan-v1.module.css";

const COPY = KHAN_VOAN_V1_COPY.album;

export function Album({ gallery }: { gallery: readonly MediaResolution[] }) {
  return (
    <section className={styles.album} aria-labelledby="kv-album-heading" data-island="gallery">
      <div className={styles.albumHead}>
        <p className={`${styles.eyebrow} ${styles.reveal}`} aria-hidden="true">
          {COPY.eyebrow}
        </p>
        <h2 id="kv-album-heading" className={`${styles.h2} ${styles.reveal}`}>
          <span className={styles.foil}>{COPY.heading}</span>
        </h2>
      </div>
      <AlbumGrid gallery={gallery} />
    </section>
  );
}
