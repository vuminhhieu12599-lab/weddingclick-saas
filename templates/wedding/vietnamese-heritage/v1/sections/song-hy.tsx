import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { SongHyGlyph } from "./decor";

const LABEL = VIETNAMESE_HERITAGE_V1_COPY.a11y.songHy;

/**
 * The Task 029 Song Hỷ mark between two fine gold rules (ceremonial page
 * header). The 囍 is deterministic vector geometry (`SongHyGlyph`), never a
 * font glyph, so it sits identically on every device. Fixed template decor
 * with one accessible name.
 */
export function SongHy() {
  return (
    <div className={styles.songHy}>
      <span className={styles.songHyRule} aria-hidden="true" />
      <span className={styles.songHyMark} role="img" aria-label={LABEL}>
        <SongHyGlyph className={styles.songHyGlyph} />
      </span>
      <span className={styles.songHyRule} aria-hidden="true" />
    </div>
  );
}

/** The Task 029 closing seal: a small lacquer disc carrying the vector 囍. */
export function SongHySeal() {
  return (
    <span className={styles.songHySeal} role="img" aria-label={LABEL}>
      <SongHyGlyph className={styles.songHySealGlyph} />
    </span>
  );
}
