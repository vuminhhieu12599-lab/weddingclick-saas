import styles from "../elegant-editorial-v1.module.css";

/**
 * Elegant Editorial v1 — renderer-owned decorative motifs
 * (docs/DECISIONS.md "RF-06-0 …" P4–P6, "Elegant Editorial Production
 * Design Baseline" Design Baseline A1; provenance in ../PROVENANCE.md).
 *
 * The Design Baseline A1 production decor files are referenced only by exact
 * literal paths under the immutable v1 decor directory (P6): never built,
 * never remote, never a data URI. Everything here is decorative: hidden from
 * assistive technology, never focusable, never interactive.
 */

/** Exact public paths of the frozen decor files that sections render as images. */
const DECOR_ASSET_SRC = Object.freeze({
  "calendar-botanical-bottom-right.webp": "/renderers/wedding/elegant-editorial/v1/calendar-botanical-bottom-right.webp",
  "calendar-botanical-top-left.webp": "/renderers/wedding/elegant-editorial/v1/calendar-botanical-top-left.webp",
  "calendar-heart.svg": "/renderers/wedding/elegant-editorial/v1/calendar-heart.svg",
  "couple-floral-divider.webp": "/renderers/wedding/elegant-editorial/v1/couple-floral-divider.webp",
  "ornament-fleuron.svg": "/renderers/wedding/elegant-editorial/v1/ornament-fleuron.svg",
  "ornament-sparkle.svg": "/renderers/wedding/elegant-editorial/v1/ornament-sparkle.svg",
} as const);

/** The Design Baseline A1 files a section may render (the frozen decor set). */
export type DecorAssetFile = keyof typeof DECOR_ASSET_SRC;

/** Public path of one production decor file. */
export function decorAssetSrc(file: DecorAssetFile): string {
  return DECOR_ASSET_SRC[file];
}

interface DecorProps {
  className?: string;
}

function classes(...names: (string | undefined)[]): string {
  return names.filter((name) => name !== undefined && name.length > 0).join(" ");
}

/**
 * The small inline serif "&" between the couple names (Design Baseline B5
 * item 5, D4, D5). It stays inline so names wrap naturally around it and is
 * read as text, so the couple line stays one readable phrase.
 */
export function CoupleAmpersand({ className }: DecorProps) {
  return <span className={classes(styles.amp, className)}> &amp; </span>;
}

/**
 * The Task029 opening envelope, assembled from the frozen Design Baseline A1
 * opening files on the 300×200 body canvas (Design Baseline B5 item 1):
 * moss body with the ivory/gold liner frame, the hinged moss flap (its ivory
 * liner face underneath it), and the gold 囍 wax seal on the flap tip. The
 * ivory cover-card frame sits tucked inside the pocket, occluded by the body
 * and clipped at the body's bottom edge, ready to rise; the runtime
 * `media.cover` photograph is never part of this artwork.
 *
 * Static artwork only: it is not a control and has no opening behavior. The
 * RF-06D opening island renders this motif and animates its hook classes
 * (`envelopeFlap` on the flap group, hinged at its top edge; `envelopeSeal`).
 */
export function EnvelopeMotif({ className }: DecorProps) {
  return (
    <svg className={classes(styles.envelope, className)} viewBox="0 0 300 200" aria-hidden="true" focusable="false">
      <svg className={styles.envelopeCardClip} x="0" y="-400" width="300" height="582" viewBox="0 -400 300 582">
        <image
          className={styles.envelopeCard}
          href="/renderers/wedding/elegant-editorial/v1/opening-cover-card-frame.svg"
          x="46"
          y="52"
          width="208"
          height="277"
        />
      </svg>
      <image
        className={styles.envelopeBody}
        href="/renderers/wedding/elegant-editorial/v1/opening-envelope-body.svg"
        x="0"
        y="0"
        width="300"
        height="200"
      />
      {/* Flap and liner span the body silhouette (x 11–289), not the full canvas,
          so the flap edges stay flush with the pocket; hinge stays on y 13. */}
      <g className={styles.envelopeFlap}>
        <image
          className={styles.envelopeLiner}
          href="/renderers/wedding/elegant-editorial/v1/opening-envelope-liner.svg"
          x="11"
          y="13"
          width="278"
          height="150"
          preserveAspectRatio="none"
        />
        <image
          className={styles.envelopeFlapFace}
          href="/renderers/wedding/elegant-editorial/v1/opening-envelope-flap.svg"
          x="11"
          y="13"
          width="278"
          height="150"
          preserveAspectRatio="none"
        />
      </g>
      <image
        className={styles.envelopeSeal}
        href="/renderers/wedding/elegant-editorial/v1/opening-seal-double-happiness.svg"
        x="117"
        y="110"
        width="66"
        height="66"
      />
    </svg>
  );
}
