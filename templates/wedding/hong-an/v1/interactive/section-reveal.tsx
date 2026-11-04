"use client";

import { useEffect, useRef } from "react";

import {
  startSectionReveal,
  type RevealController,
  type RevealElement,
  type RevealEnvironment,
  type RevealTarget,
} from "../../../../../lib/invitation-rendering/section-reveal-controller";

/**
 * Hồng Ân v1 interior motion (HA-TEMPLATE-01).
 *
 * On the SHARED section-reveal controller every other production renderer
 * uses — not a second animation engine (CLAUDE.md §20). One
 * `IntersectionObserver`, one attribute, one delay custom property: no
 * scroll listener, no timer, no per-frame script, no library, no WebGL and
 * no particles.
 *
 * The vocabulary is small and closed, and the stylesheet owns every pending
 * state, duration and easing. Each variant moves only opacity and
 * compositor-friendly properties, so no target ever changes its layout
 * footprint and nothing can cause horizontal drift:
 *
 * - `rise`  — fade up; the default for headings, text and plates;
 * - `arch`  — a pointed-arch plate settling as its gold edge draws in;
 * - `draw`  — a gold hairline unfurling from its centre;
 * - `knot`  — one run-of-show step, its knot tying as it arrives;
 * - `photo` — a gallery tile or figure easing up into its frame.
 *
 * THE OPENING IS UNREACHABLE FROM HERE. Every selector is scoped to the
 * interior column, which is the opening stage's SIBLING, so no rule can
 * match the cover, the doors, the light or the hero, and the frozen
 * sequence cannot be replayed or disturbed.
 *
 * PROGRESSIVE ENHANCEMENT, NOT A GATE. Without an observer nothing is ever
 * marked, so nothing is ever hidden: a reader with no JavaScript gets the
 * finished page. Under reduced motion the stylesheet shows every target in
 * its resting style immediately, so the invitation arrives complete and
 * still.
 */
export const HA_REVEAL_VARIANTS = ["rise", "arch", "draw", "knot", "photo"] as const;

export type HaRevealVariant = (typeof HA_REVEAL_VARIANTS)[number];

/** Stagger between targets revealed together, and its cap. */
export const HA_REVEAL_STAGGER_MS = 110;
export const HA_REVEAL_STAGGER_MAX_STEPS = 4;

/** The attribute and delay property the stylesheet keys on. */
export const HA_REVEAL_ATTRIBUTE = "data-ha-reveal";
export const HA_REVEAL_DELAY_PROPERTY = "--ha-reveal-delay";

const TARGETS: readonly RevealTarget<HaRevealVariant>[] = [
  { selector: "[data-reveal='arch']", variant: "arch" },
  { selector: "[data-reveal='draw']", variant: "draw" },
  { selector: "[data-reveal='knot']", variant: "knot" },
  { selector: "[data-reveal='photo']", variant: "photo" },
  { selector: "[data-reveal='rise']", variant: "rise" },
];

/**
 * Mounted inside the interior column. `rescan` runs on every render so
 * capability-backed sections that appear later — the countdown after the
 * clock adapter mounts, the RSVP card, the gift plates — are picked up
 * without a second observer.
 */
export function SectionReveal() {
  const anchor = useRef<HTMLSpanElement>(null);
  const controller = useRef<RevealController | null>(null);

  useEffect(() => {
    const root = anchor.current?.parentElement;
    if (!root) return undefined;
    controller.current = startSectionReveal(
      root as unknown as RevealElement,
      window as unknown as RevealEnvironment,
      TARGETS,
      {
        attribute: HA_REVEAL_ATTRIBUTE,
        delayProperty: HA_REVEAL_DELAY_PROPERTY,
        staggerMs: HA_REVEAL_STAGGER_MS,
        maxStaggerSteps: HA_REVEAL_STAGGER_MAX_STEPS,
        rootMargin: "0px 0px -8% 0px",
      },
    );
    const active = controller.current;
    return () => {
      active.stop();
      controller.current = null;
    };
  }, []);

  useEffect(() => {
    controller.current?.rescan();
  });

  return <span ref={anchor} hidden aria-hidden="true" />;
}
