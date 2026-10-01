import { useEffect, useRef } from "react";

import styles from "../elegant-editorial-v1.module.css";

/**
 * The Task029 `Reveal` targets, expressed on the frozen static markup
 * (Design Baseline B5 item 19): content blocks rise about 22 px while
 * fading in, while full-width or ornamental blocks only fade (Task029
 * `y={0}`). Section backgrounds never move; only their content does.
 */
const RISE_CLASSES = [
  "couplePlate",
  "guestLine",
  "message",
  "familyOrnament",
  "familyColumn",
  "ceremony",
  "eventCard",
  "countdownKicker",
  "countdownRow",
  "storyCard",
  "rsvpCard",
  "giftIntro",
  "giftOpen",
] as const;

const FADE_CLASSES = ["coupleQuote", "coupleDivider", "calendarStage", "closingOrnament", "closingLine", "closingNames", "closingDate"] as const;

type RevealMotion = "rise" | "fade";

/** `data-ee-reveal` states the CSS keys on: hidden until revealed, then shown once. */
const REVEAL_ATTRIBUTE = "data-ee-reveal";

function selectorFor(classes: readonly string[]): string {
  return classes.map((name) => `.${CSS.escape(styles[name] ?? name)}`).join(", ");
}

/**
 * RF-06D section reveal (Design Baseline B5 item 19; P13): Task029-style
 * fade plus an upward rise, once per element, as progressive enhancement
 * only.
 *
 * Server markup never carries a hidden state, so every block is visible
 * without JavaScript and before hydration. After mount, and only where
 * `IntersectionObserver` exists, blocks are marked pending and each is
 * revealed the first time it enters the viewport, then left alone. Under
 * `prefers-reduced-motion: reduce` the CSS keeps every block visible and
 * still. No network, no storage, no timer. On unmount every mark is
 * removed, so nothing can stay hidden.
 *
 * Renders only an inert, hidden anchor used to find its own invitation
 * column; it reads nothing outside it.
 */
export function SectionReveal() {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const column = anchorRef.current?.parentElement;
    if (column === null || column === undefined || typeof IntersectionObserver === "undefined") return;

    const targets = new Map<Element, RevealMotion>();
    for (const element of column.querySelectorAll(selectorFor(RISE_CLASSES))) targets.set(element, "rise");
    for (const element of column.querySelectorAll(selectorFor(FADE_CLASSES))) targets.set(element, "fade");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute(REVEAL_ATTRIBUTE, "shown");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -40px 0px" },
    );
    for (const [element, motion] of targets) {
      element.setAttribute(REVEAL_ATTRIBUTE, motion);
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      for (const element of targets.keys()) element.removeAttribute(REVEAL_ATTRIBUTE);
    };
  }, []);

  return <span ref={anchorRef} hidden />;
}
