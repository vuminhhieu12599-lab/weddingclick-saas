import { useReducer, useRef, useSyncExternalStore, type AnimationEvent, type ReactNode } from "react";

import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";
import { activateOpening, INITIAL_OPENING_PHASE, openingReducer, type OpeningPhase } from "./opening-state";

const COPY = ROMANTIC_MINIMAL_V1_COPY.opening;

/** `data-opening` values the CSS sequence keys on; `done` stays on the column so inner entrances finish. */
const PHASE_ATTRIBUTE: Readonly<Record<OpeningPhase, string>> = Object.freeze({
  CLOSED: "closed",
  OPENING: "opening",
  DONE: "done",
});

/** Hydration marker: `false` in server markup and during hydration, `true` once running in the browser. */
function subscribeNever(): () => void {
  return () => undefined;
}

interface OpeningStageProps {
  /** The fixed top-right music control (or nothing), kept above the cover. */
  music: ReactNode;
  /** Builds the cover card around the island-owned "Mở thiệp" button. */
  renderCover: (openButton: ReactNode) => ReactNode;
  /** Synchronous start-on-open hook (music), run at most once by the explicit tap. */
  onOpen?: () => void;
  /** The invitation content behind the cover. */
  children: ReactNode;
}

/**
 * Romantic Minimal v1 opening island (docs/DECISIONS.md "RM-02"; Task 029
 * cover card, seal pulse and heart burst).
 *
 * `CLOSED` → `OPENING` → `DONE`. Only the real "Mở thiệp" button opens the
 * cover; nothing opens on a timer and nothing is remembered. The CSS plays
 * the Task 029 sequence, and the cover's own `animationend` finishes it: the
 * cover leaves the tree and focus moves to the Save The Date names without
 * scrolling. While `CLOSED`, and only once hydrated (`data-interactive`), the
 * column is held to the first screen and the content waits under the cover,
 * so without JavaScript nothing is ever locked or hidden.
 */
export function OpeningStage({ music, renderCover, onOpen, children }: OpeningStageProps) {
  const [phase, dispatch] = useReducer(openingReducer, INITIAL_OPENING_PHASE);
  const interactive = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  // Synchronous duplicate guard: several presses can land before React rerenders with OPENING.
  const activated = useRef(false);

  function handleAnimationEnd(event: AnimationEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || phase !== "OPENING") return;
    const column = event.currentTarget.parentElement;
    dispatch("FINISHED");
    const heading = column?.querySelector<HTMLElement>("#rm-std-names");
    if (heading !== null && heading !== undefined) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }

  const openButton = (
    <button
      type="button"
      className={styles.openButton}
      aria-disabled={phase === "CLOSED" ? undefined : true}
      onClick={() => {
        if (activated.current) return;
        activated.current = true;
        activateOpening(phase, onOpen, dispatch);
      }}
    >
      {COPY.open}
    </button>
  );

  return (
    <main className={styles.column} data-opening={PHASE_ATTRIBUTE[phase]} data-interactive={interactive ? "true" : undefined}>
      {music}
      {phase === "DONE" ? null : (
        <header className={styles.cover} data-island="opening" onAnimationEnd={handleAnimationEnd}>
          <span className={styles.coverBackdrop} aria-hidden="true" />
          {renderCover(openButton)}
        </header>
      )}
      <div className={styles.content}>{children}</div>
    </main>
  );
}
