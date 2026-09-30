import { useEffect, useReducer, useRef, type ReactNode } from "react";

import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { EnvelopeMotif } from "../sections/decor";
import { INITIAL_OPENING_STATE, openingReducer, type OpeningMotion } from "./opening-state";

const COPY = ELEGANT_EDITORIAL_V1_COPY.opening;

/** `data-motion` values the CSS keys on: the flap transition, or none for "skip". */
const MOTION_ATTRIBUTE: Readonly<Record<OpeningMotion, string>> = Object.freeze({
  TRANSITION: "transition",
  INSTANT: "instant",
});

interface OpeningInteractionProps {
  /** The guest line: canonical presentation text, rendered in every state. */
  children: ReactNode;
}

/**
 * RF-06D opening island (docs/DECISIONS.md "RF-06-0 …" P7, P13).
 *
 * The envelope is decorative artwork; the guest line (children) and the
 * rest of the invitation are always rendered and never hidden or blocked.
 * Two explicit controls: "open" plays the finite CSS flap transition, "skip"
 * reaches the same opened state with no transition. Nothing opens on a
 * timer, nothing is remembered across reloads, and opening never touches
 * music or any other capability. After either action the controls leave the
 * DOM, so focus moves to the guest line instead of being lost.
 */
export function OpeningInteraction({ children }: OpeningInteractionProps) {
  const [state, dispatch] = useReducer(openingReducer, INITIAL_OPENING_STATE);
  const letterRef = useRef<HTMLDivElement>(null);
  const opened = state.phase === "OPENED";

  useEffect(() => {
    if (opened) letterRef.current?.focus();
  }, [opened]);

  return (
    <div
      className={styles.openingStage}
      data-opening={opened ? "opened" : "sealed"}
      data-motion={state.phase === "OPENED" ? MOTION_ATTRIBUTE[state.motion] : undefined}
    >
      <EnvelopeMotif className={styles.openingEnvelope} />
      <div ref={letterRef} className={styles.openingLetter} tabIndex={-1}>
        {children}
      </div>
      {opened ? null : (
        <div className={styles.openingControls} role="group" aria-label={COPY.controlsLabel}>
          <button type="button" className={styles.openingButton} onClick={() => dispatch("OPEN")}>
            {COPY.open}
          </button>
          <button type="button" className={styles.openingSkip} onClick={() => dispatch("SKIP")}>
            {COPY.skip}
          </button>
        </div>
      )}
    </div>
  );
}
