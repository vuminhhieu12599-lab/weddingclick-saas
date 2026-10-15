import { useEffect, useRef } from "react";

import {
  startSectionReveal,
  type RevealController,
  type RevealElement,
  type RevealEnvironment,
  type RevealTarget,
} from "../../../../../lib/invitation-rendering/section-reveal-controller";
import styles from "../our-wedding-story-v2.module.css";

/**
 * Our Wedding Story v2 motion vocabulary (docs/DECISIONS.md "OWS-V2-01"):
 * one variant per role, never one generic fade for everything.
 *
 * - `head`  section heads: page number, the kicker rule drawing from the
 *           left, then the title rising;
 * - `rise`  text blocks and cards: fade up from a per-element offset;
 * - `photo` framed photographs: the frame unveils (clip-path) while the
 *           picture settles from a slight zoom; captions follow;
 * - `tiles` gallery rows: the row's tiles arrive one after another;
 * - `draw`  closing rules and ornaments: drawn from the centre.
 *
 * The CSS owns offsets, delays and durations (all inside
 * `prefers-reduced-motion: no-preference`); the controller only marks.
 */
export const OWS_REVEAL_VARIANTS = ["head", "rise", "photo", "tiles", "draw"] as const;

export type OwsRevealVariant = (typeof OWS_REVEAL_VARIANTS)[number];

export const OWS_REVEAL_ATTRIBUTE = "data-ows-reveal";
const DELAY_PROPERTY = "--ows-reveal-batch";

function target(name: string, variant: OwsRevealVariant): RevealTarget<OwsRevealVariant> {
  return { selector: `.${styles[name] ?? name}`, variant };
}

/** Every revealed block of the body, by CSS-module class, in page order. */
export const OWS_REVEAL_TARGETS: readonly RevealTarget<OwsRevealVariant>[] = [
  target("sectionHead", "head"),
  // Families
  target("familyCol", "rise"),
  // The Couple
  target("portraitLead", "photo"),
  target("portraitFollow", "photo"),
  target("portraitSingleFigure", "photo"),
  target("nameBlock", "rise"),
  target("couplePhotoWrap", "photo"),
  target("storyCard", "rise"),
  target("storyCardAlone", "rise"),
  // The Invitation
  target("inviteCard", "rise"),
  target("receptionCard", "rise"),
  // The Date
  target("datePanel", "rise"),
  // Gallery
  target("galleryRowWrap", "tiles"),
  // RSVP & Gift
  target("rsvpCard", "rise"),
  target("giftBlock", "rise"),
  // Thank You
  target("thanksFigure", "photo"),
  target("thanksText", "rise"),
  target("thanksTextOnly", "rise"),
  target("footer", "draw"),
];

/**
 * Our Wedding Story v2 section reveal (docs/DECISIONS.md "OWS-V2-01").
 * Server markup never carries a hidden state. After mount the shared
 * controller marks targets pending and reveals each once on first entering
 * the viewport (one `IntersectionObserver`, the approved −80 px margin);
 * without that API nothing is marked, so nothing is ever hidden. No scroll
 * listener and no timer: scroll-linked parallax is native CSS
 * (`animation-timeline`). Under `prefers-reduced-motion: reduce` the CSS
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
        // Targets entering together cascade lightly; per-element choreography stays in the CSS.
        staggerMs: 90,
        maxStaggerSteps: 3,
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
