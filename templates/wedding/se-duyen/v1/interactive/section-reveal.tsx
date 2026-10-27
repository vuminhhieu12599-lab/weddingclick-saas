import { useEffect, useRef } from "react";

import {
  revealSiblingIndex,
  startSectionReveal,
  type RevealController,
  type RevealElement,
  type RevealEnvironment,
  type RevealTarget,
} from "../../../../../lib/invitation-rendering/section-reveal-controller";
import styles from "../se-duyen-v1.module.css";

/**
 * Se Duyên v1 interior motion — "Tơ Hồng Khai Duyên" (SD-V1-MOTION-01).
 *
 * The scroll-reveal the renderer's own header has always named as SD-V1-02
 * work: it belongs on the shared section-reveal controller the other
 * production renderers use, not on a second animation engine (CLAUDE.md
 * §20). One `IntersectionObserver`, one attribute, one delay custom
 * property; no scroll listener, no timer, no per-frame script, no library.
 *
 * The vocabulary is a closed set, and the stylesheet owns every pending
 * state, duration and easing. Each variant moves only opacity and the
 * compositor-friendly `translate` / `scale` / `rotate` / `transform`
 * properties, so no target ever changes its layout footprint:
 *
 * - `rise`   — fade up; the default for text, labels and ornamented lines;
 * - `silk`   — the ivory plate unfolding on a hinge: perspective tilt, lift
 *              and settle, finished by a single gold sweep;
 * - `foil`   — a rise plus a one-pass gold-foil light sweep, for the two
 *              headings that carry the ceremony and the signature;
 * - `lead`   — the leading portrait swinging in from the left on a hinge;
 * - `aside`  — the supporting portrait answering it from the right;
 * - `panel`  — a house or a per-side rite card arriving from its own side
 *              (`panelLeft` / `panelRight`, chosen by DOM position only);
 * - `draw`   — a gilt rule or thread unfurling from its centre;
 * - `thread` — the run-of-show's tơ hồng drawn downwards through the list;
 * - `knot`   — a run-of-show step, its gilt knot tying with a brief glow;
 * - `photo`  — an album print laid onto the lacquer, each with its own
 *              small tilt (the stylesheet art-directs the angle per frame);
 * - `scale`  — ornaments, seals and countdown dials settling into place.
 *
 * The frozen box opening is untouched and unreachable: every rule is scoped
 * to `.interior`, which is the opening stage's SIBLING, so no selector here
 * can match the cover, the box, the lid, the rising photograph or the hero.
 */
export const SD_REVEAL_VARIANTS = [
  "rise",
  "silk",
  "foil",
  "lead",
  "aside",
  "panelLeft",
  "panelRight",
  "draw",
  "thread",
  "knot",
  "photo",
  "scale",
] as const;

export type SdRevealVariant = (typeof SD_REVEAL_VARIANTS)[number];

/** Stagger between targets revealed together, and its cap (no long cumulative waits). */
export const SD_REVEAL_STAGGER_MS = 120;
export const SD_REVEAL_STAGGER_MAX_STEPS = 5;

/** The attribute and delay property the stylesheet keys on. */
export const SD_REVEAL_ATTRIBUTE = "data-sd-reveal";
const DELAY_PROPERTY = "--sd-reveal-delay";

/**
 * A panel arrives from its own side of the page, by DOM position alone.
 *
 * This is deliberately positional, never semantic: which house or rite card
 * is first is the ONE central variant resolver's decision, already made
 * before this renderer sees it (CLAUDE.md §5/§6). COMMON shows two and they
 * part left and right; GROOM and BRIDE show one and it arrives from the
 * left. No rule here reads a side, and none can change what a variant means.
 */
export function panelVariant(element: RevealElement): SdRevealVariant {
  return revealSiblingIndex(element) === 0 ? "panelLeft" : "panelRight";
}

type SdVariantOf = SdRevealVariant | ((element: RevealElement) => SdRevealVariant);

function target(name: string, variant: SdVariantOf): readonly [string, SdVariantOf] {
  return [name, variant];
}

/**
 * Every reveal target in the interior, in page order, by CSS-module class.
 *
 * Section backgrounds, seams, watermarks and glows are deliberately absent:
 * the lacquer never moves, only what is written and photographed on it. The
 * gift envelope is absent too — its flap, slip and seal already own a
 * delicate approved choreography of their own, and only its section head
 * takes part here.
 */
const SD_REVEAL_TARGET_PAIRS: readonly (readonly [string, SdVariantOf])[] = [
  // 1. Invitation — Silk Unfold: the plate unfolds, then its wording settles.
  target("inviteCard", "silk"),
  target("inviteRite", "rise"),
  target("inviteSalutation", "rise"),
  target("inviteMessage", "rise"),
  target("inviteGuest", "rise"),
  target("inviteThread", "draw"),
  target("inviteWhen", "rise"),
  target("inviteLunar", "rise"),

  // 2. Couple — Two Portraits Meet, then the names follow.
  target("coupleEyebrow", "rise"),
  target("coupleHeading", "rise"),
  target("couplePhotoMain", "lead"),
  target("couplePhotoAside", "aside"),
  target("coupleRow", "rise"),
  target("coupleAmp", "scale"),
  target("coupleStory", "rise"),
  target("coupleLotus", "scale"),

  // 3. Families — Golden Reveal: the two houses part to their own sides.
  target("housesEyebrow", "rise"),
  target("housesHeading", "rise"),
  target("housesRule", "draw"),
  target("house", panelVariant),

  // 4. Ceremony — the rite title takes the gold sweep; details follow in order.
  target("riteEyebrow", "rise"),
  target("riteTitle", "foil"),
  target("riteRule", "draw"),
  target("riteWeekday", "rise"),
  target("riteRail", "rise"),
  target("riteTime", "rise"),
  target("riteVenue", "rise"),
  target("ritePartyRow", panelVariant),

  // 5. Timeline — Red Thread Journey: the tơ hồng is drawn, each knot ties.
  target("flowEyebrow", "rise"),
  target("flowHeading", "rise"),
  target("flowRule", "draw"),
  target("flowList", "thread"),
  target("flowStep", "knot"),

  // 6. Countdown (mounts only once the host supplies a clock).
  target("countdownHeading", "rise"),
  target("countdownRule", "draw"),
  target("countdownThread", "draw"),
  target("countdownDial", "scale"),

  // 7. Album — Photographs Unfold onto the lacquer.
  target("albumEyebrow", "rise"),
  target("albumHeading", "rise"),
  target("albumRule", "draw"),
  target("albumLead", "photo"),
  target("albumPairTall", "photo"),
  target("albumPairSmall", "photo"),
  target("albumFoot", "photo"),

  // 8. RSVP — the card arrives whole; its controls are never held back.
  target("rsvpEyebrow", "rise"),
  target("rsvpHeading", "rise"),
  target("rsvpRule", "draw"),
  target("rsvpCard", "rise"),

  // 9. Gift — head only; the envelope keeps its own approved motion.
  target("giftEyebrow", "rise"),
  target("giftHeading", "rise"),
  target("giftRule", "draw"),
  target("giftNote", "rise"),

  // 10. Closing — Golden Finale: photograph, thread, then the signature.
  target("closingEyebrow", "rise"),
  target("closingRule", "draw"),
  target("closingPhoto", "photo"),
  target("closingMessage", "rise"),
  target("closingThread", "draw"),
  target("closingSign", "foil"),
];

/**
 * The CSS-module class names this island drives, in page order. Exported so a
 * test can prove each one is a class the stylesheet really exports: a
 * mistyped name would resolve to itself and then match nothing at all, and a
 * reveal that silently animates nothing is the one failure the attribute
 * itself cannot show.
 */
export const SD_REVEAL_TARGET_CLASSES: readonly string[] = SD_REVEAL_TARGET_PAIRS.map(([name]) => name);

export const SD_REVEAL_TARGETS: readonly RevealTarget<SdRevealVariant>[] = SD_REVEAL_TARGET_PAIRS.map(([name, variant]) => ({
  selector: `.${styles[name] ?? name}`,
  variant,
}));

/**
 * Se Duyên v1 interior section reveal.
 *
 * Server markup never carries a hidden state, so the whole invitation is
 * readable without JavaScript, before hydration, and in any browser without
 * `IntersectionObserver` — in that case nothing is ever marked, so nothing
 * is ever hidden. After mount the shared controller marks each target
 * pending and reveals it once, the first time it enters the viewport;
 * a target already scrolled past (a fast flick, or a jump straight down the
 * page) is revealed by the same pass rather than left behind. Under
 * `prefers-reduced-motion: reduce` the stylesheet's pending states do not
 * apply at all, so every target keeps its natural style, visible and still.
 * On unmount every mark is removed.
 *
 * Renders one inert hidden anchor, whose parent is the interior column.
 *
 * MOUNTING. The opening island mounts this only once the opening has reached
 * its final phase (`interiorMotion`), because until then the interior column
 * is `display: none` and every element in it measures as a zero rectangle —
 * which an `IntersectionObserver` reports as already scrolled past. Mounted
 * any earlier, every target would be revealed at once behind the closed box
 * and the scroll choreography would be spent before a guest ever saw it.
 */
export function SectionReveal({ hasCountdown }: { readonly hasCountdown: boolean }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const controllerRef = useRef<RevealController | null>(null);

  useEffect(() => {
    const column = anchorRef.current?.parentElement;
    if (column === null || column === undefined) return;
    // A real Element is structurally a RevealElement; DOM lib parameter types are wider (Node), hence the cast.
    const controller = startSectionReveal(
      column as unknown as RevealElement,
      { IntersectionObserver: typeof IntersectionObserver === "undefined" ? undefined : IntersectionObserver } as RevealEnvironment,
      SD_REVEAL_TARGETS,
      {
        attribute: SD_REVEAL_ATTRIBUTE,
        delayProperty: DELAY_PROPERTY,
        staggerMs: SD_REVEAL_STAGGER_MS,
        maxStaggerSteps: SD_REVEAL_STAGGER_MAX_STEPS,
        rootMargin: "0px 0px -40px 0px",
      },
    );
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.stop();
    };
  }, []);

  // The countdown mounts once the clock capability exists (after first render): mark its dials then.
  useEffect(() => {
    if (hasCountdown) controllerRef.current?.rescan();
  }, [hasCountdown]);

  return <span ref={anchorRef} hidden />;
}
