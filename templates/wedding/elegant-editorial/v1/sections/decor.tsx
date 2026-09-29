import styles from "../elegant-editorial-v1.module.css";

/**
 * Elegant Editorial v1 — original renderer-owned decorative motifs
 * (docs/DECISIONS.md "RF-06-0 …" P4–P6; provenance in ../PROVENANCE.md).
 *
 * Newly authored simple vector shapes (curves, ellipses, circles): no
 * external or prototype artwork is traced, embedded or referenced. Purely
 * decorative: hidden from assistive technology, never focusable, never
 * interactive, and colored only through renderer CSS classes.
 */

interface DecorProps {
  className?: string;
}

function classes(...names: (string | undefined)[]): string {
  return names.filter((name) => name !== undefined && name.length > 0).join(" ");
}

/** A single arching stem with alternating leaves, drawn left → right. */
export function LeafSprig({ className }: DecorProps) {
  return (
    <svg className={classes(styles.decorSprig, className)} viewBox="0 0 120 28" aria-hidden="true" focusable="false">
      <path className={styles.decorStem} d="M4 18 C 34 8, 70 26, 116 12" />
      <ellipse className={styles.decorLeaf} cx="26" cy="9" rx="8" ry="3" transform="rotate(-28 26 9)" />
      <ellipse className={styles.decorLeafSoft} cx="40" cy="20" rx="8" ry="3" transform="rotate(24 40 20)" />
      <ellipse className={styles.decorLeaf} cx="58" cy="11" rx="8" ry="3" transform="rotate(-18 58 11)" />
      <ellipse className={styles.decorLeafSoft} cx="74" cy="23" rx="8" ry="3" transform="rotate(18 74 23)" />
      <ellipse className={styles.decorLeaf} cx="92" cy="9" rx="7" ry="2.6" transform="rotate(-24 92 9)" />
      <circle className={styles.decorBud} cx="116" cy="12" r="2.4" />
    </svg>
  );
}

/** Two mirrored sprigs around a small gold lozenge: the section divider. */
export function OrnamentDivider({ className }: DecorProps) {
  return (
    <div className={classes(styles.ornament, className)} aria-hidden="true">
      <LeafSprig />
      <svg className={styles.ornamentMark} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path d="M6 0 L12 6 L6 12 L0 6 Z" />
      </svg>
      <LeafSprig className={styles.decorMirrored} />
    </div>
  );
}

/** A small corner bouquet: three stems, leaves and round blossoms. */
export function CornerBouquet({ className }: DecorProps) {
  return (
    <svg className={classes(styles.decorBouquet, className)} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <path className={styles.decorStem} d="M6 74 C 20 56, 30 40, 34 16" />
      <path className={styles.decorStem} d="M6 74 C 26 62, 44 52, 66 44" />
      <path className={styles.decorStem} d="M6 74 C 18 64, 36 44, 54 26" />
      <ellipse className={styles.decorLeaf} cx="22" cy="48" rx="9" ry="3.4" transform="rotate(-62 22 48)" />
      <ellipse className={styles.decorLeafSoft} cx="36" cy="58" rx="9" ry="3.4" transform="rotate(-18 36 58)" />
      <ellipse className={styles.decorLeaf} cx="40" cy="38" rx="8" ry="3" transform="rotate(-44 40 38)" />
      <ellipse className={styles.decorLeafSoft} cx="52" cy="50" rx="8" ry="3" transform="rotate(-10 52 50)" />
      <circle className={styles.decorBlossom} cx="34" cy="14" r="5" />
      <circle className={styles.decorBlossom} cx="55" cy="25" r="4" />
      <circle className={styles.decorBlossom} cx="67" cy="43" r="4.5" />
      <circle className={styles.decorBud} cx="34" cy="14" r="1.6" />
      <circle className={styles.decorBud} cx="55" cy="25" r="1.3" />
      <circle className={styles.decorBud} cx="67" cy="43" r="1.4" />
    </svg>
  );
}

/**
 * A closed ivory envelope with a wax seal carrying a leaf pair. Static
 * artwork only: it is not a control and has no opening behavior (RF-06D
 * owns the interactive opening).
 */
export function EnvelopeMotif({ className }: DecorProps) {
  return (
    <svg className={classes(styles.envelope, className)} viewBox="0 0 300 196" aria-hidden="true" focusable="false">
      <rect className={styles.envelopeBody} x="1" y="1" width="298" height="194" rx="6" />
      <path className={styles.envelopeFold} d="M2 194 L126 104 M298 194 L174 104" />
      <path className={styles.envelopeFlap} d="M2 3 L150 116 L298 3 Z" />
      <circle className={styles.envelopeSeal} cx="150" cy="114" r="24" />
      <circle className={styles.envelopeSealRing} cx="150" cy="114" r="18" />
      <ellipse className={styles.envelopeSealLeaf} cx="144" cy="112" rx="8" ry="3.2" transform="rotate(-38 144 112)" />
      <ellipse className={styles.envelopeSealLeaf} cx="156" cy="112" rx="8" ry="3.2" transform="rotate(38 156 112)" />
      <path className={styles.envelopeSealStem} d="M150 124 L150 108" />
    </svg>
  );
}

/** A soft heart drawn behind the ceremony day number in the calendar. */
export function HeartMark({ className }: DecorProps) {
  return (
    <svg className={classes(styles.heart, className)} viewBox="0 0 32 28" aria-hidden="true" focusable="false">
      <path d="M16 27 C 6 19, 1 13, 1 8 C 1 4, 4 1, 8.5 1 C 12 1, 14.5 3, 16 6 C 17.5 3, 20 1, 23.5 1 C 28 1, 31 4, 31 8 C 31 13, 26 19, 16 27 Z" />
    </svg>
  );
}
