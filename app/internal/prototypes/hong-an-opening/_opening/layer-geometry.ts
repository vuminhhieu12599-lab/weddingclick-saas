/**
 * HA-OPEN-02 — measurements of the approved Hồng Ân V4 artwork.
 *
 * Every number here is read from the pack's `layer-manifest.json`, which
 * ships beside the images in `public/prototypes/hong-an/opening/`. They
 * live in one module so the stylesheet can stay free of magic numbers and
 * so a re-rendered pack only has to change this file.
 *
 * V4 geometry differs from the V1 prototype in one way that matters: the
 * architecture is a full-bleed scene on a phone-shaped 1440×3120 canvas
 * that runs past all four edges, not a small illustration floating on
 * transparency. That is what lets the opening fill the screen.
 */

/** The canvas every layer shares. All five are exactly this size. */
export const CANVAS = { width: 1440, height: 3120 } as const;

/**
 * The outer hinge of each leaf, in canvas pixels. Each leaf's own alpha
 * edge sits on its hinge line, so these are also the rotation axes.
 */
export const HINGE_X = { left: 349, right: 1061 } as const;

/** Where the two leaves meet when closed — the seam the light comes through. */
export const SPLIT_X = 699;

/**
 * The luminous panel the cover text sits on, in canvas pixels
 * `[left, top, right, bottom]`. The artwork is quiet here by design; it
 * is the only part of the facade the copy is allowed to cover.
 */
export const PLAQUE_RECT = { left: 150, top: 1040, right: 1290, bottom: 1850 } as const;

/** The doorway opening, used to aim the light and the perspective origin. */
export const APERTURE = { top: 933, bottom: 2745 } as const;

/**
 * How far each leaf swings. The approved V4 timing takes them almost
 * edge-on, so the photograph behind is barely occluded by the end.
 */
export const OPEN_ANGLE_DEG = 88;

/** Viewing distance, in container-width units so it scales with the stage. */
export const PERSPECTIVE_CQW = 295;

/** The slow push into the photograph once the stonework has dissolved. */
export const HERO_PHOTO_SCALE = 1.05;

/** The facade drifts forward a touch as it dissolves, so it recedes rather than blinks out. */
export const FACADE_EXIT_SCALE = 1.055;

const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(4)}%`;

/** Canvas pixels → a percentage of the scene box, which is always canvas-shaped. */
const x = (value: number) => pct(value, CANVAS.width);
const y = (value: number) => pct(value, CANVAS.height);

export const LAYER_SRC = {
  frame: "/prototypes/hong-an/opening/frame-static.webp",
  leafLeft: "/prototypes/hong-an/opening/door-left.webp",
  leafRight: "/prototypes/hong-an/opening/door-right.webp",
  reveal: "/prototypes/hong-an/opening/door-reveal.webp",
  flowers: "/prototypes/hong-an/opening/foreground-flowers.webp",
  /**
   * The pack's illustrative stand-in. A real Project supplies this photo
   * through the InvitationViewModel; it is only here so the Product Owner
   * reviews the same frames the V4 pack was approved on.
   */
  demoPhoto: "/prototypes/hong-an/opening/hero-photo.jpg",
} as const;

/**
 * Handed to the stage as inline custom properties. The stylesheet reads
 * these and nothing else, so the artwork's geometry is stated once.
 */
export const SCENE_CSS_VARS = {
  "--ha-canvas-ratio": `${CANVAS.width} / ${CANVAS.height}`,
  "--ha-hinge-left": x(HINGE_X.left),
  "--ha-hinge-right": x(HINGE_X.right),
  "--ha-split-x": x(SPLIT_X),
  "--ha-aperture-centre-y": y((APERTURE.top + APERTURE.bottom) / 2),
  "--ha-plaque-left": x(PLAQUE_RECT.left),
  "--ha-plaque-top": y(PLAQUE_RECT.top),
  "--ha-plaque-right": x(CANVAS.width - PLAQUE_RECT.right),
  "--ha-plaque-centre-y": y((PLAQUE_RECT.top + PLAQUE_RECT.bottom) / 2),
  "--ha-open-angle": `${OPEN_ANGLE_DEG}deg`,
  "--ha-perspective": `${PERSPECTIVE_CQW}cqw`,
  "--ha-hero-photo-scale": `${HERO_PHOTO_SCALE}`,
  "--ha-facade-exit-scale": `${FACADE_EXIT_SCALE}`,
} as const;
