import { useEffect, useRef } from "react";

import {
  startSectionReveal,
  type RevealController,
  type RevealElement,
  type RevealEnvironment,
  type RevealTarget,
} from "../../../../../lib/invitation-rendering/section-reveal-controller";
import styles from "../romantic-minimal-v1.module.css";

/**
 * Romantic Minimal motion vocabulary (docs/DECISIONS.md "RM-02"), a closed
 * set mirroring the Task 029 direction's `Reveal` uses:
 *
 * - `reveal`: fade from a per-element offset (`--rm-reveal-x/y`) after a
 *   per-element delay (`--rm-reveal-step`), 700 ms, ease (0.22, 1, 0.36, 1);
 * - `settle`: the Just Married photo settling from scale 1.04 (1300 ms);
 * - `heart`: the calendar heart growing in (700 ms after 500 ms);
 * - `closing`: the Thank You photo settling from scale 1.02 / opacity 0.6.
 *
 * The CSS owns offsets, delays and durations; the controller only marks.
 */
export const RM_REVEAL_VARIANTS = ["reveal", "settle", "heart", "closing"] as const;

export type RmRevealVariant = (typeof RM_REVEAL_VARIANTS)[number];

export const RM_REVEAL_ATTRIBUTE = "data-rm-reveal";
const DELAY_PROPERTY = "--rm-reveal-batch";

function target(name: string, variant: RmRevealVariant): RevealTarget<RmRevealVariant> {
  return { selector: `.${styles[name] ?? name}`, variant };
}

/** Every animated element after the opening, by CSS-module class, in page order. */
export const RM_REVEAL_TARGETS: readonly RevealTarget<RmRevealVariant>[] = [
  // Couple + families
  target("identityConnector", "reveal"),
  target("identityAccent", "reveal"),
  target("identityNamesWrap", "reveal"),
  target("identityDividerWrap", "reveal"),
  target("identityFamily", "reveal"),
  // Just Married
  target("jmFrame", "reveal"),
  target("jmPhotoMedia", "settle"),
  target("jmCaption", "reveal"),
  // Invitation intro
  target("inviteSalutationWrap", "reveal"),
  target("inviteGuestWrap", "reveal"),
  target("inviteRuleWrap", "reveal"),
  // Rite, countdown, reception
  target("riteHeading", "reveal"),
  target("riteDate", "reveal"),
  target("riteLunarWrap", "reveal"),
  target("countdown", "reveal"),
  target("receptionSide", "reveal"),
  // Timeline
  target("timelineReveal", "reveal"),
  // Our Love
  target("ourLoveTitleWrap", "reveal"),
  target("ourLovePhotoWrap", "reveal"),
  target("ourLoveTextWrap", "reveal"),
  // Calendar
  target("calendarCard", "reveal"),
  target("calendarFloral", "reveal"),
  target("calendarMonthWrap", "reveal"),
  target("calendarHeart", "heart"),
  // RSVP
  target("rsvpHeader", "reveal"),
  target("rsvpPanel", "reveal"),
  // Gift
  target("giftReveal", "reveal"),
  // Album
  target("albumHeader", "reveal"),
  target("albumTileWrap", "reveal"),
  // Thank You
  target("thankYouPhoto", "closing"),
  target("thankYouTitleWrap", "reveal"),
  target("thankYouTextWrap", "reveal"),
];

/**
 * Romantic Minimal v1 section reveal (docs/DECISIONS.md "RM-02"). Server
 * markup never carries a hidden state. After mount the shared controller
 * marks targets pending and reveals each once on first entering the
 * viewport (one `IntersectionObserver`); without that API nothing is marked.
 * Under `prefers-reduced-motion: reduce` the CSS keeps every target visible
 * and still. Renders only an inert hidden anchor.
 */
export function SectionReveal({ hasCountdown }: { readonly hasCountdown: boolean }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const controllerRef = useRef<RevealController | null>(null);

  useEffect(() => {
    const content = anchorRef.current?.parentElement;
    if (content === null || content === undefined) return;
    // A real Element is structurally a RevealElement; DOM lib parameter types are wider (Node), hence the cast.
    const controller = startSectionReveal(
      content as unknown as RevealElement,
      { IntersectionObserver: typeof IntersectionObserver === "undefined" ? undefined : IntersectionObserver } as RevealEnvironment,
      RM_REVEAL_TARGETS,
      {
        attribute: RM_REVEAL_ATTRIBUTE,
        delayProperty: DELAY_PROPERTY,
        // Task 029 delays are per element (CSS `--rm-reveal-step`), not a batch stagger.
        staggerMs: 0,
        maxStaggerSteps: 0,
        rootMargin: "0px 0px -80px 0px",
      },
    );
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.stop();
    };
  }, []);

  useEffect(() => {
    if (hasCountdown) controllerRef.current?.rescan();
  }, [hasCountdown]);

  return <span ref={anchorRef} hidden />;
}
