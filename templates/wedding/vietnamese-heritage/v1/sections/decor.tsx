import styles from "../vietnamese-heritage-v1.module.css";

/**
 * Vietnamese Heritage v1 decor (docs/DECISIONS.md "VH-02A …" ruling D1;
 * ../PROVENANCE.md).
 *
 * The only module that names decor files. Every path is an exact literal
 * into the immutable `public/renderers/wedding/vietnamese-heritage/v1/`
 * directory: size-optimized WebP derivatives of the eight Product
 * Owner-authorized Task 029 PNGs. Nothing here references a prototype path,
 * builds a path at runtime or loads a font.
 *
 * Generic Song Hỷ marks and the lotus are repository-authored vector
 * geometry, so they render identically on every device (no CJK font, no
 * `<text>`, no font metrics).
 */

const DECOR_SRC = Object.freeze({
  borderLeft: "/renderers/wedding/vietnamese-heritage/v1/border-left.webp",
  borderRight: "/renderers/wedding/vietnamese-heritage/v1/border-right.webp",
  medallion: "/renderers/wedding/vietnamese-heritage/v1/medallion-double-happiness.webp",
  floralTopLeft: "/renderers/wedding/vietnamese-heritage/v1/floral-top-left.webp",
  floralBottomRight: "/renderers/wedding/vietnamese-heritage/v1/floral-bottom-right.webp",
  divider: "/renderers/wedding/vietnamese-heritage/v1/gold-divider.webp",
});

/** Intrinsic pixel sizes of the shipped files, so layout space is reserved. */
const DECOR_SIZE: Readonly<Record<keyof typeof DECOR_SRC, readonly [number, number]>> = Object.freeze({
  borderLeft: [360, 1080],
  borderRight: [360, 1080],
  medallion: [372, 372],
  floralTopLeft: [200, 200],
  floralBottomRight: [200, 200],
  divider: [225, 75],
});

export type DecorKey = keyof typeof DECOR_SRC;

/**
 * The two paper textures as renderer-scoped custom properties on the root;
 * the CSS module paints them with `var(--vh-texture-*)` only.
 */
export const VIETNAMESE_HERITAGE_V1_TEXTURE_STYLE: Readonly<Record<"--vh-texture-red" | "--vh-texture-ivory", string>> =
  Object.freeze({
    "--vh-texture-red": 'url("/renderers/wedding/vietnamese-heritage/v1/paper-red.webp")',
    "--vh-texture-ivory": 'url("/renderers/wedding/vietnamese-heritage/v1/paper-ivory.webp")',
  });

interface DecorImageProps {
  decor: DecorKey;
  className?: string;
  /** Meaningful artwork (the medallion) gets a name; ornament stays decorative. */
  alt?: string;
  eager?: boolean;
}

/** One fixed decor file at its literal path. Decorative unless given an `alt`. */
export function DecorImage({ decor, className, alt = "", eager = false }: DecorImageProps) {
  const [width, height] = DECOR_SIZE[decor];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed v1 decor file from the immutable renderer path
    <img
      className={className}
      src={DECOR_SRC[decor]}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}

/**
 * 囍 as stroked vector geometry in a 100-unit box (ink centred on 50, 47):
 * the WeddingClick-authored mark already shipped by the Elegant Editorial
 * seal (P1-UX-03), redrawn here as this renderer's own copy so no template
 * imports another. Font-independent: identical placement on iOS, Android
 * and desktop.
 */
export function SongHyGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="6.5" strokeLinecap="square" strokeLinejoin="miter">
        <path d="M8 8 H42 M25 2 V22 M12 20 H38 M15 47 L19 53 M35 47 L31 53 M58 8 H92 M75 2 V22 M62 20 H88 M85 47 L81 53 M65 47 L69 53 M4 59 H96" />
        <rect x="11" y="28" width="28" height="12" />
        <rect x="11" y="66" width="28" height="26" />
        <rect x="61" y="28" width="28" height="12" />
        <rect x="61" y="66" width="28" height="26" />
      </g>
    </svg>
  );
}

/** A restrained gold line-art lotus (hoa sen), authored for this renderer. */
export function LotusMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 40" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
        <path className={styles.lotusPetalSoft} d="M30 33 Q21 31 7 21 Q19 21 30 33 Z" />
        <path className={styles.lotusPetalSoft} d="M30 33 Q39 31 53 21 Q41 21 30 33 Z" />
        <path className={styles.lotusPetal} d="M30 32 Q20 26 19 12 Q28 18 30 32 Z" />
        <path className={styles.lotusPetal} d="M30 32 Q40 26 41 12 Q32 18 30 32 Z" />
        <path className={styles.lotusHeart} d="M30 4 Q37 17 30 32 Q23 17 30 4 Z" />
        <path d="M15 37 Q30 33 45 37" />
      </g>
    </svg>
  );
}
