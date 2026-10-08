import { useReducer, useRef, useSyncExternalStore, type AnimationEvent, type ReactNode } from "react";

import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { activateOpening, INITIAL_OPENING_PHASE, openingReducer, type OpeningPhase } from "./opening-state";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.opening;

/** `data-opening` values the CSS sequence keys on. */
const PHASE_ATTRIBUTE: Readonly<Record<OpeningPhase, string>> = Object.freeze({
  CLOSED: "closed",
  OPENING: "opening",
  DONE: "done",
});

interface OpeningInteractionProps {
  /** The two door layers (static artwork and cover text, built by the cover section). */
  children: ReactNode;
  /**
   * Run once, synchronously, by the explicit activation while closed: the
   * root passes the start-on-open music hook only when music exists. The
   * island itself knows nothing about music.
   */
  onOpen?: () => void;
}

/** Hydration marker: `false` in server markup and during hydration, `true` once running in the browser. */
function subscribeNever(): () => void {
  return () => undefined;
}

/**
 * After the doors have gone, focus moves to the Hero names (the first
 * meaningful content behind the cover), made programmatically focusable only
 * then and never a tab stop; the page is not scrolled.
 */
function focusHero(cover: HTMLElement): void {
  const heading = cover.parentElement?.querySelector<HTMLElement>("#vh-hero-names");
  if (heading === null || heading === undefined) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

/**
 * Vietnamese Heritage v1 split-door opening island (docs/DECISIONS.md
 * "VH-02B-M1"; Task 029 `SplitDoorCover`).
 *
 * `CLOSED` → `OPENING` → `DONE`. The cover lies over the top of the
 * invitation, whose Hero is already rendered underneath. Only a real
 * `<button type="button">` ("Chạm để mở thiệp") opens it; nothing opens on
 * a timer, nothing is remembered and the route never changes. On activation
 * the CSS plays the Task 029 sequence: the cover text settles away and the
 * Song Hỷ medallion glows, then from 260 ms the left door travels left and
 * the right door right for 880 ms while the invitation settles in behind
 * the widening gap. The cover's own `animationend` (1180 ms; 220 ms fade
 * under reduced motion) finishes it: the cover leaves the tree, so no layer
 * is left over the page, and focus moves to the Hero names without
 * scrolling.
 *
 * Page scrolling is held only while `CLOSED` and only once this island has
 * hydrated (`data-interactive`), so without JavaScript nothing is ever
 * locked. A repeated activation is ignored, also when several presses land
 * before the next render (synchronous guard), so `onOpen` runs at most once.
 */
export function OpeningInteraction({ children, onOpen }: OpeningInteractionProps) {
  const [phase, dispatch] = useReducer(openingReducer, INITIAL_OPENING_PHASE);
  const interactive = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  // Synchronous duplicate guard: several presses can land before React rerenders with OPENING.
  const activated = useRef(false);

  /** Only the cover's own finishing animation ends the sequence; door and text animations bubble past. */
  function handleAnimationEnd(event: AnimationEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || phase !== "OPENING") return;
    const cover = event.currentTarget;
    dispatch("FINISHED");
    focusHero(cover);
  }

  if (phase === "DONE") return null;

  return (
    <header
      className={styles.opening}
      data-opening={PHASE_ATTRIBUTE[phase]}
      data-interactive={interactive ? "true" : undefined}
      data-island="opening"
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
      <button
        type="button"
        className={styles.coverOpenButton}
        aria-label={COPY.hint}
        aria-disabled={phase === "CLOSED" ? undefined : true}
        onClick={() => {
          if (activated.current) return;
          activated.current = true;
          activateOpening(phase, onOpen, dispatch);
        }}
      />
    </header>
  );
}
