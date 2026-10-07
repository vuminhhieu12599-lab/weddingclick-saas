import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";

/** Chữ Hỷ (囍), the traditional double-happiness wedding mark. */
const SONG_HY_GLYPH = "囍";

/**
 * The Song Hỷ mark between two gold rules (Task 029 ceremonial divider).
 * Fixed template decor (class B): one accessible name, no customer data.
 *
 * VH-01 renders the glyph as text. It depends on a system CJK font, which is
 * not deterministic across devices (the Elegant Editorial seal precedent,
 * P1-UX-03); VH-02 replaces it with WeddingClick-owned vector geometry.
 */
export function SongHy({ rules = true }: { rules?: boolean }) {
  return (
    <div className={styles.songHy}>
      {rules ? <span className={styles.songHyRule} aria-hidden="true" /> : null}
      <span className={styles.songHyGlyph} role="img" aria-label={VIETNAMESE_HERITAGE_V1_COPY.a11y.songHy}>
        <span aria-hidden="true">{SONG_HY_GLYPH}</span>
      </span>
      {rules ? <span className={styles.songHyRule} aria-hidden="true" /> : null}
    </div>
  );
}
