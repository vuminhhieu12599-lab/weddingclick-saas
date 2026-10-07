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
  "calendar-flower-bottom-right.webp": "/renderers/wedding/elegant-editorial/v1/calendar-flower-bottom-right.webp",
  "calendar-flower-top-left.webp": "/renderers/wedding/elegant-editorial/v1/calendar-flower-top-left.webp",
  "calendar-heart.svg": "/renderers/wedding/elegant-editorial/v1/calendar-heart.svg",
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
 * The seal's 囍 engraving as repository-authored vector strokes: the mark from
 * the tracked `opening-seal-double-happiness.svg`, in its 100-unit box whose
 * stroked ink is centred on (50, 47). Font-independent, so it lands on the
 * same coordinates on every device instead of following whichever CJK font
 * and `dominant-baseline` metrics a browser picks.
 */
const SEAL_MARK_STROKES = (
  <>
    <path d="M8 8 H42 M25 2 V22 M12 20 H38 M15 47 L19 53 M35 47 L31 53 M58 8 H92 M75 2 V22 M62 20 H88 M85 47 L81 53 M65 47 L69 53 M4 59 H96" />
    <rect x="11" y="28" width="28" height="12" />
    <rect x="11" y="66" width="28" height="26" />
    <rect x="61" y="28" width="28" height="12" />
    <rect x="61" y="66" width="28" height="26" />
  </>
);

/**
 * Scale 0.22 matches the ~20-unit ink of the previous 21.6px glyph, and
 * translate(150 − 50·0.22, 142 − 47·0.22) = (139, 131.66) centres the mark on
 * the seal raster's recessed disc at (150, 142). The three layers keep the
 * previous engraving: light lower edge (+1), dark upper shadow (−1), the cut.
 */
const SEAL_MARK_LAYERS = [
  { transform: "translate(139 132.66) scale(0.22)", stroke: "#ffecbe", strokeOpacity: "0.55" },
  { transform: "translate(139 130.66) scale(0.22)", stroke: "#46300c", strokeOpacity: "0.35" },
  { transform: "translate(139 131.66) scale(0.22)", stroke: "#7a5a24", strokeOpacity: undefined },
] as const;

/**
 * The Task029 opening envelope (Design Baseline B5 item 1), assembled exactly
 * as `GreenIvoryEditorialPrototype` layers its approved body, flap and seal
 * art on one 3:2 canvas (300×200 here, 1536×1024 in Task029). The three
 * rasters are size-optimized copies of the Product Owner-approved Task029
 * PNGs (P6; see ../PROVENANCE.md):
 *
 * - body: the full canvas;
 * - flap: the Task029 offset (2.08%, −7.32%) at 95.89%, so its fold line
 *   lands on the body's top edge; the hinge is 14.65% down the flap box;
 * - seal: 22% of the canvas width, centred at 50% / 71%, with the Task029
 *   engraved 囍 as repository-authored vector strokes (two hard 1-unit
 *   shadows), never a font glyph.
 *
 * The ivory cover-card frame sits tucked inside the pocket, occluded by the
 * body and clipped at the body's bottom edge; the runtime `media.cover`
 * photograph is never part of this artwork.
 *
 * Static artwork only: it is not a control and has no opening behavior. The
 * RF-06D opening island renders this motif and animates its hook classes
 * (`envelopeFlap` on the flap group, hinged on its fold line; `envelopeSeal`).
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
        href="/renderers/wedding/elegant-editorial/v1/opening-envelope-body.webp"
        x="0"
        y="0"
        width="300"
        height="200"
      />
      <g className={styles.envelopeFlap}>
        <image
          className={styles.envelopeFlapFace}
          href="/renderers/wedding/elegant-editorial/v1/opening-envelope-flap.webp"
          x="6.24"
          y="-14.64"
          width="287.67"
          height="191.78"
        />
      </g>
      <g className={styles.envelopeSeal}>
        <image
          className={styles.envelopeSealFace}
          href="/renderers/wedding/elegant-editorial/v1/opening-envelope-seal.webp"
          x="117"
          y="109"
          width="66"
          height="66"
        />
        <g fill="none" strokeWidth="6.5" strokeLinecap="square" strokeLinejoin="miter" opacity="0.9">
          {SEAL_MARK_LAYERS.map((layer) => (
            <g key={layer.stroke} transform={layer.transform} stroke={layer.stroke} strokeOpacity={layer.strokeOpacity}>
              {SEAL_MARK_STROKES}
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}
