import type { CSSProperties } from "react";

import styles from "../vietnamese-heritage-v1.module.css";

/**
 * The longest name, in Unicode code points, that the cover and hero keep on
 * one line. At the narrowest supported width (360 px) the minimum display
 * size still fits a name of this length; longer names take the one
 * deterministic fallback below.
 */
export const COUPLE_NAME_SINGLE_LINE_MAX_CHARS = 24;

/** Code points, so a Vietnamese letter with its diacritics counts once. Never splits the name. */
export function coupleNameLength(name: string): number {
  return Array.from(name).length;
}

/**
 * One person's full canonical name as its own block on the opening cover or
 * hero (docs/DECISIONS.md "VH-02A-QA1"). Pure CSS fitting, no measurement:
 * the code-point count is handed to CSS as `--vh-name-chars`, and the module
 * sizes the line as `available width ÷ (count × 0.56)` (0.56 em covers the
 * measured mean glyph advance of mixed-case Vietnamese names in the display
 * face) between the approved minimum and maximum, on one line
 * (`data-name-fit="line"`). A name longer than
 * `COUPLE_NAME_SINGLE_LINE_MAX_CHARS` instead wraps onto balanced lines at a
 * size computed for half its length (`data-name-fit="wrap"`), so no single
 * word is left alone. The name text is never altered or tokenized.
 */
export function CoupleName({ name }: { name: string }) {
  const chars = Math.max(1, coupleNameLength(name));
  const style: CSSProperties & Readonly<Record<"--vh-name-chars", string>> = { "--vh-name-chars": String(chars) };
  return (
    <span className={styles.coupleName} style={style} data-name-fit={chars > COUPLE_NAME_SINGLE_LINE_MAX_CHARS ? "wrap" : "line"}>
      {name}
    </span>
  );
}
