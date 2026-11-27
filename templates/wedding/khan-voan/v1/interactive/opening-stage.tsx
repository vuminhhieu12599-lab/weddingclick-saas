import { useReducer, useRef, type ReactNode, type TransitionEvent } from "react";

import { KHAN_VOAN_V1_COPY } from "../copy";
import styles from "../khan-voan-v1.module.css";
import { LaceRow } from "../sections/decor";
import { activateOpening, INITIAL_OPENING_PHASE, openingReducer, type OpeningPhase } from "./opening-state";

const COPY = KHAN_VOAN_V1_COPY.opening;

const PHASE_ATTRIBUTE: Readonly<Record<OpeningPhase, string>> = Object.freeze({
  CLOSED: "closed",
  OPENING: "opening",
  DONE: "done",
});

const PETALS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

interface OpeningStageProps {
  /** The cover (photo, names, date) that sits under the veil and stays after it lifts. */
  cover: ReactNode;
  /** What is written on the veil (monogram, salutation, guest line). */
  seal: ReactNode;
  music: ReactNode;
  onOpen?: () => void;
  children: ReactNode;
}

/**
 * The veil-lift opening. Two layers of blurred tulle lie over the cover photo;
 * one tap lifts them (pure CSS transitions) and the front veil's own
 * `transitionend` finishes the sequence. Until the guest opens it, the rest of
 * the invitation is not mounted, so the page cannot scroll past the veil.
 */
export function OpeningStage({ cover, seal, music, onOpen, children }: OpeningStageProps) {
  const [phase, dispatch] = useReducer(openingReducer, INITIAL_OPENING_PHASE);
  const activated = useRef(false);
  const heroRef = useRef<HTMLElement>(null);

  function handleOpen() {
    if (activated.current) return;
    activated.current = true;
    activateOpening(phase, onOpen, dispatch);
  }

  function handleVeilTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== "transform" || phase !== "OPENING") return;
    dispatch("FINISHED");
    const heading = heroRef.current?.querySelector<HTMLElement>("h1");
    if (heading !== null && heading !== undefined) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }

  return (
    <main className={styles.column} data-opening={PHASE_ATTRIBUTE[phase]}>
      {music}
      <section ref={heroRef} className={styles.hero} aria-label={KHAN_VOAN_V1_COPY.cover.kicker}>
        {cover}
        {phase === "DONE" ? null : (
          <div className={styles.opening} data-island="opening">
            <div className={`${styles.veil} ${styles.veilBack}`} aria-hidden="true" />
            <div className={`${styles.veil} ${styles.veilFront}`} aria-hidden="true" onTransitionEnd={handleVeilTransitionEnd}>
              <LaceRow className={styles.lace} />
            </div>
            <div className={styles.petals} aria-hidden="true">
              {PETALS.map((petal) => (
                <i key={petal} />
              ))}
            </div>
            <div className={styles.seal}>{seal}</div>
            <button type="button" className={styles.veilButton} aria-disabled={phase === "CLOSED" ? undefined : true} onClick={handleOpen}>
              <span className={styles.srOnly}>{COPY.open}</span>
              <span className={styles.hint} aria-hidden="true">
                <i />
                {COPY.hint}
              </span>
            </button>
          </div>
        )}
      </section>
      {/* The body mounts when the veil lifts, so the scroll reveals start from real
          layout (an observer started on hidden content would mark everything as already seen). */}
      <div className={styles.content}>{phase === "CLOSED" ? null : children}</div>
    </main>
  );
}
