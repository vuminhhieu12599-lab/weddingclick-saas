/**
 * Hồng Ân v1 — geometry of the approved V4 cathedral artwork
 * (HA-OPEN-03, frozen).
 *
 * Every number is read from the artwork's own `layer-manifest.json`. They
 * live in one module so the stylesheet carries no magic numbers and a
 * re-rendered pack changes only this file.
 *
 * The architecture is a full-bleed scene on a phone-shaped 1440×3120 canvas
 * that runs past all four edges — not an illustration floating on
 * transparency. That is what lets the opening fill the screen at any width.
 */

/** The canvas every layer shares. All five are exactly this size. */
export const CANVAS = { width: 1440, height: 3120 } as const;

/** The outer hinge of each leaf, in canvas pixels, and so its rotation axis. */
export const HINGE_X = { left: 349, right: 1061 } as const;

/** Where the two leaves meet when closed — the seam the light comes through. */
export const SPLIT_X = 699;

/** The doorway opening, used to aim the light and the perspective origin. */
export const APERTURE = { top: 933, bottom: 2745 } as const;

/** How far each leaf swings; the approved travel takes them almost edge-on. */
export const OPEN_ANGLE_DEG = 88;

/** Viewing distance, in container-width units so it scales with the stage. */
export const PERSPECTIVE_CQW = 295;

/** The slow push into the photograph once the stonework has dissolved. */
export const HERO_PHOTO_SCALE = 1.05;

/** The facade drifts forward a touch as it dissolves, so it recedes rather than blinks out. */
export const FACADE_EXIT_SCALE = 1.055;

const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(4)}%`;
const x = (value: number) => pct(value, CANVAS.width);
const y = (value: number) => pct(value, CANVAS.height);

/**
 * The published decorative layers. Derived from the approved PNG masters by
 * re-encoding only — nothing is redrawn, recomposed or re-registered. The
 * four detailed layers are high-quality lossy WebP (alpha bit-exact, mean
 * colour error under 1/255 over the opaque area) and the flat arch reveal
 * stays lossless, which together bring the pack from 3.7 MB to 648 KB
 * without visible degradation.
 */
export const LAYER_SRC = {
  frame: "/renderers/wedding/hong-an/v1/frame-static.webp",
  leafLeft: "/renderers/wedding/hong-an/v1/door-left.webp",
  leafRight: "/renderers/wedding/hong-an/v1/door-right.webp",
  reveal: "/renderers/wedding/hong-an/v1/door-reveal.webp",
  flowers: "/renderers/wedding/hong-an/v1/foreground-flowers.webp",
} as const;

/** Handed to the stage as inline custom properties; the stylesheet reads only these. */
export const OPENING_CSS_VARS = {
  "--ha-canvas-ratio": `${CANVAS.width} / ${CANVAS.height}`,
  "--ha-hinge-left": x(HINGE_X.left),
  "--ha-hinge-right": x(HINGE_X.right),
  "--ha-split-x": x(SPLIT_X),
  "--ha-aperture-centre-y": y((APERTURE.top + APERTURE.bottom) / 2),
  "--ha-open-angle": `${OPEN_ANGLE_DEG}deg`,
  "--ha-perspective": `${PERSPECTIVE_CQW}cqw`,
  "--ha-hero-photo-scale": `${HERO_PHOTO_SCALE}`,
  "--ha-facade-exit-scale": `${FACADE_EXIT_SCALE}`,
} as const;
