import type { CSSProperties } from "react";

/**
 * Romantic Minimal v1 decor (docs/DECISIONS.md "RM-02"; ../PROVENANCE.md).
 *
 * The only module that names decor files. Every path is an exact literal into
 * the immutable `public/renderers/wedding/romantic-minimal/v1/` directory:
 * size-optimized WebP derivatives of the Product Owner-authorized Task 029
 * PNGs plus the byte-identical architecture sketch SVG. Nothing here builds a
 * path at runtime or references a prototype path.
 */

const DECOR_SRC = Object.freeze({
  floralTopLeft: "/renderers/wedding/romantic-minimal/v1/floral-top-left.webp",
  floralBottomRight: "/renderers/wedding/romantic-minimal/v1/floral-bottom-right.webp",
  seal: "/renderers/wedding/romantic-minimal/v1/envelope-seal.webp",
  heartBurst: "/renderers/wedding/romantic-minimal/v1/heart-burst.webp",
  architecture: "/renderers/wedding/romantic-minimal/v1/architecture-sketch.svg",
  divider: "/renderers/wedding/romantic-minimal/v1/divider.webp",
  envelopeBack: "/renderers/wedding/romantic-minimal/v1/envelope-back.webp",
  envelopePocket: "/renderers/wedding/romantic-minimal/v1/envelope-pocket.webp",
});

/** Intrinsic pixel sizes of the shipped files, so layout space is reserved. */
const DECOR_SIZE: Readonly<Record<keyof typeof DECOR_SRC, readonly [number, number]>> = Object.freeze({
  floralTopLeft: [500, 500],
  floralBottomRight: [700, 700],
  seal: [144, 144],
  heartBurst: [380, 285],
  architecture: [600, 520],
  divider: [440, 147],
  envelopeBack: [972, 729],
  envelopePocket: [874, 655],
});

export type DecorKey = keyof typeof DECOR_SRC;

/** The blush paper texture as a renderer-scoped custom property; the CSS paints it with `var(--rm-paper)` only. */
export const ROMANTIC_MINIMAL_V1_TEXTURE_STYLE: CSSProperties & Readonly<Record<"--rm-paper", string>> = Object.freeze({
  "--rm-paper": 'url("/renderers/wedding/romantic-minimal/v1/paper-blush.webp")',
});

interface DecorImageProps {
  decor: DecorKey;
  className?: string;
  eager?: boolean;
}

/** One fixed, purely decorative decor file at its literal path. */
export function DecorImage({ decor, className, eager = false }: DecorImageProps) {
  const [width, height] = DECOR_SIZE[decor];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed v1 decor file from the immutable renderer path
    <img
      className={className}
      src={DECOR_SRC[decor]}
      alt=""
      aria-hidden={true}
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
    />
  );
}
