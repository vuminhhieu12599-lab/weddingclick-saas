import { useEffect, useRef } from "react";

import {
  revealSiblingIndex,
  startSectionReveal,
  type RevealController,
  type RevealElement,
  type RevealEnvironment,
  type RevealTarget,
} from "../../../../../lib/invitation-rendering/section-reveal-controller";
import styles from "../vietnamese-heritage-v1.module.css";

/**
 * Vietnamese Heritage motion vocabulary (docs/DECISIONS.md "VH-02B-M2"): a
 * closed set. The CSS module owns each variant's pending state, duration and
 * easing; every variant moves only opacity and the individual `translate` /
 * `scale` / `clip-path` properties, so the layout footprint never changes.
 *
 * - `rise`: fade up (text lines, headings, controls);
 * - `fade`: opacity only;
 * - `card`: a slower rise with a slight scale settle (cards, panels);
 * - `image`: an inset clip opening with a fade (framed photographs);
 * - `left` / `right`: a gentle horizontal settle towards the centre;
 * - `scale`: scale-and-fade (ornaments, countdown units, swatches).
 */
export const VH_REVEAL_VARIANTS = ["rise", "fade", "card", "image", "left", "right", "scale"] as const;

export type VhRevealVariant = (typeof VH_REVEAL_VARIANTS)[number];

/** Stagger between targets revealed together, and its cap (no long cumulative waits). */
export const VH_REVEAL_STAGGER_MS = 110;
export const VH_REVEAL_STAGGER_MAX_STEPS = 5;

/** The attribute and delay property the CSS keys on. */
export const VH_REVEAL_ATTRIBUTE = "data-vh-reveal";
const DELAY_PROPERTY = "--vh-reveal-delay";

/**
 * The three-photo cluster by slot position: position 1 from the left, the
 * dominant centre as an image, position 3 from the right; a pair splits
 * left/right; a lone photo opens as an image.
 */
export function portraitVariant(element: RevealElement): VhRevealVariant {
  const count = element.parentElement?.getAttribute("data-count");
  const index = revealSiblingIndex(element);
  if (count === "3") return index === 0 ? "left" : index === 1 ? "image" : "right";
  if (count === "2") return index === 0 ? "left" : "right";
  return "image";
}

/** Album prints: a full-width row opens as an image; a paired row's prints settle from their own side. */
export function albumPrintVariant(element: RevealElement): VhRevealVariant {
  const kind = element.parentElement?.getAttribute("data-row");
  if (kind === "pair" || kind === "tall") return revealSiblingIndex(element) === 0 ? "left" : "right";
  return "image";
}

function target(name: string, variant: VhRevealVariant | ((element: RevealElement) => VhRevealVariant)): RevealTarget<VhRevealVariant> {
  return { selector: `.${styles[name] ?? name}`, variant };
}

/**
 * Every reveal target after the Hero, by CSS-module class. The opening cover,
 * its doors and every Hero element are deliberately absent: they have their
 * own approved choreography. Section backgrounds never move, only content.
 */
export const VH_REVEAL_TARGETS: readonly RevealTarget<VhRevealVariant>[] = [
  // Ceremonial sheet: Song Hỷ, families, the three-photo cluster, invitation, rite
  target("songHy", "scale"),
  target("familyLabel", "rise"),
  target("familyParent", "rise"),
  target("familyAddress", "rise"),
  target("portraitFrame", portraitVariant),
  target("inviteSalutation", "rise"),
  target("inviteGuest", "rise"),
  target("riteTitle", "rise"),
  target("riteWeekday", "rise"),
  target("riteDateRow", "rise"),
  target("riteLunar", "rise"),
  target("riteDivider", "scale"),
  // Events, timeline, countdown
  target("venueSide", "rise"),
  target("venueCard", "card"),
  target("venueMapLink", "rise"),
  target("scheduleItem", "rise"),
  target("countdownCell", "scale"),
  // Love Story
  target("loveStoryHeader", "rise"),
  target("loveStoryPhotoFrame", "image"),
  target("loveStoryText", "rise"),
  // RSVP
  target("rsvpTitle", "rise"),
  target("rsvpPanel", "card"),
  target("rsvpField", "rise"),
  target("rsvpSubmit", "rise"),
  // Gift
  target("giftIntro", "rise"),
  target("giftOpen", "card"),
  // Dress Code
  target("dressTitle", "rise"),
  target("dressCodeText", "rise"),
  target("dressCodeSwatch", "scale"),
  // Gallery
  target("albumHeader", "rise"),
  target("albumPrint", albumPrintVariant),
  // Closing
  target("closingDivider", "scale"),
  target("songHySeal", "scale"),
  target("closingLine", "rise"),
  target("closingNames", "rise"),
  target("closingDate", "rise"),
];

/**
 * Vietnamese Heritage v1 section reveal (docs/DECISIONS.md "VH-02B-M2").
 *
 * Server markup never carries a hidden state, so everything is visible
 * without JavaScript and before hydration. After mount, the shared controller
 * marks targets pending and reveals each once, the first time it enters the
 * viewport, through one `IntersectionObserver`; without that API nothing is
 * marked. Under `prefers-reduced-motion: reduce` the CSS keeps every target
 * visible and still. On unmount every mark is removed. Renders only an inert
 * hidden anchor used to find its own invitation column.
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
      VH_REVEAL_TARGETS,
      {
        attribute: VH_REVEAL_ATTRIBUTE,
        delayProperty: DELAY_PROPERTY,
        staggerMs: VH_REVEAL_STAGGER_MS,
        maxStaggerSteps: VH_REVEAL_STAGGER_MAX_STEPS,
        rootMargin: "0px 0px -40px 0px",
      },
    );
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.stop();
    };
  }, []);

  // The countdown mounts once the clock capability exists (after first render): mark its cells then.
  useEffect(() => {
    if (hasCountdown) controllerRef.current?.rescan();
  }, [hasCountdown]);

  return <span ref={anchorRef} hidden />;
}
