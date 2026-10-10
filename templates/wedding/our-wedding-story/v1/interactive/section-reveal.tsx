import { useEffect, useRef } from "react";

import {
  startSectionReveal,
  type RevealController,
  type RevealElement,
  type RevealEnvironment,
  type RevealTarget,
} from "../../../../../lib/invitation-rendering/section-reveal-controller";
import styles from "../our-wedding-story-v1.module.css";

/**
 * Our Wedding Story motion vocabulary (docs/DECISIONS.md "OWS-01"), one
 * variant mirroring the Visual Freeze v1 `Reveal`: fade in from a
 * per-element offset (`--ows-reveal-y`) after a per-element delay
 * (`--ows-reveal-step`), 700 ms, ease (0.22, 1, 0.36, 1), once. The CSS owns
 * offsets, delays and duration; the controller only marks.
 */
export const OWS_REVEAL_VARIANTS = ["reveal"] as const;

export type OwsRevealVariant = (typeof OWS_REVEAL_VARIANTS)[number];

export const OWS_REVEAL_ATTRIBUTE = "data-ows-reveal";
const DELAY_PROPERTY = "--ows-reveal-batch";

function target(name: string): RevealTarget<OwsRevealVariant> {
  return { selector: `.${styles[name] ?? name}`, variant: "reveal" };
}

/** Every revealed block of the body, by CSS-module class, in page order. */
export const OWS_REVEAL_TARGETS: readonly RevealTarget<OwsRevealVariant>[] = [
  target("sectionHead"),
  // Families
  target("familyCol"),
  // The Couple
  target("portraitLead"),
  target("portraitFollow"),
  target("portraitSingleFigure"),
  target("nameBlock"),
  target("couplePhotoWrap"),
  target("storyCard"),
  target("storyCardAlone"),
  // The Invitation
  target("inviteCard"),
  target("receptionCard"),
  // The Date
  target("datePanel"),
  // Gallery
  target("galleryRowWrap"),
  // RSVP & Gift
  target("rsvpCard"),
  target("giftBlock"),
  // Thank You
  target("thanksFigure"),
  target("thanksText"),
  target("thanksTextOnly"),
];

/**
 * Our Wedding Story v1 section reveal (docs/DECISIONS.md "OWS-01"). Server
 * markup never carries a hidden state. After mount the shared controller
 * marks targets pending and reveals each once on first entering the
 * viewport (one `IntersectionObserver`, the approved −80 px margin); without
 * that API nothing is marked. Under `prefers-reduced-motion: reduce` the CSS
 * keeps every target visible and still. Renders only an inert hidden anchor.
 */
export function SectionReveal({ hasCountdown }: { readonly hasCountdown: boolean }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const controllerRef = useRef<RevealController | null>(null);

  useEffect(() => {
    const body = anchorRef.current?.parentElement;
    if (body === null || body === undefined) return;
    // A real Element is structurally a RevealElement; DOM lib parameter types are wider (Node), hence the cast.
    const controller = startSectionReveal(
      body as unknown as RevealElement,
      { IntersectionObserver: typeof IntersectionObserver === "undefined" ? undefined : IntersectionObserver } as RevealEnvironment,
      OWS_REVEAL_TARGETS,
      {
        attribute: OWS_REVEAL_ATTRIBUTE,
        delayProperty: DELAY_PROPERTY,
        // Visual Freeze v1 delays are per element (CSS `--ows-reveal-step`), not a batch stagger.
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
