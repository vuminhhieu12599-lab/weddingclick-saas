import { useEffect, useReducer, useRef, type AnimationEvent } from "react";

import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { EnvelopeMotif } from "../sections/decor";
import { MediaImage } from "../sections/media-image";
import { INITIAL_OPENING_STATE, openingReducer, type OpeningState } from "./opening-state";

const COPY = ELEGANT_EDITORIAL_V1_COPY.opening;

/** `data-opening` values the CSS choreography keys on. */
const PHASE_ATTRIBUTE: Readonly<Record<OpeningState["phase"], string>> = Object.freeze({
  SEALED: "sealed",
  OPENING: "opening",
  OPENED: "opened",
});

interface OpeningInteractionProps {
  /** `viewModel.media.cover` as given: only a `RESOLVED` cover ever rises on the card (Design Baseline D3). */
  cover: InvitationViewModel["media"]["cover"];
}

/**
 * After the opening, focus moves to the Hero: the first meaningful content,
 * which the opened cover dissolves into. It is made programmatically
 * focusable (never a tab stop) only at that moment.
 */
function focusHero(stage: HTMLElement | null): void {
  const hero = stage?.closest("main")?.querySelector<HTMLElement>(`.${CSS.escape(styles.hero)}`);
  if (hero === null || hero === undefined) return;
  hero.tabIndex = -1;
  hero.focus();
}

/**
 * RF-06D opening island (docs/DECISIONS.md "RF-06-0 …" P7, P13; Design
 * Baseline B5 items 2–4, Design Baseline D3; Product Owner ruling: no visible
 * skip control).
 *
 * The envelope itself is the primary tap target, with the Task029 hint
 * under it. Tapping
 * plays the Task029 choreography in CSS: the seal lifts away, the flap
 * swings open, the card rises carrying the resolved `media.cover` (no card
 * rises without one: nothing is fabricated), then the cover dissolves. Its
 * final `animationend` settles the state. Once
 * opened, the cover is visually removed (it stays in the document for
 * assistive technology) and focus moves to the Hero.
 *
 * The invitation is always rendered below the cover in normal flow and is
 * never hidden or blocked. Nothing opens on a timer, nothing is remembered
 * across reloads, and opening never touches music or any other capability.
 * A guest may scroll past without opening. The artwork stays decorative:
 * the only tab stop is the envelope button while sealed, and none once
 * opened.
 */
export function OpeningInteraction({ cover }: OpeningInteractionProps) {
  const [state, dispatch] = useReducer(openingReducer, INITIAL_OPENING_STATE);
  const stageRef = useRef<HTMLDivElement>(null);
  const sealed = state.phase === "SEALED";
  const opened = state.phase === "OPENED";
  const card = cover !== undefined && cover.status === "RESOLVED" ? cover : null;

  useEffect(() => {
    if (opened) focusHero(stageRef.current);
  }, [opened]);

  /** Only the stage's own settle animation ends the choreography; descendants' animations bubble past. */
  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) dispatch("SETTLED");
  }

  const artwork = (
    <span className={styles.openingEnvelopeFloat}>
      <EnvelopeMotif className={styles.openingEnvelope} />
      {card === null ? null : (
        <span className={styles.openingCardClip} aria-hidden="true">
          <span className={styles.openingCard}>
            <MediaImage media={card} alt="" className={styles.openingCardPhoto} eager />
          </span>
        </span>
      )}
    </span>
  );

  return (
    <div
      ref={stageRef}
      className={styles.openingStage}
      data-opening={PHASE_ATTRIBUTE[state.phase]}
      data-card={card === null ? "none" : "cover"}
      onAnimationEnd={handleAnimationEnd}
    >
      {opened ? (
        <span className={styles.openingEnvelopeButton}>{artwork}</span>
      ) : (
        <button
          type="button"
          className={styles.openingEnvelopeButton}
          aria-label={COPY.openEnvelope}
          aria-disabled={sealed ? undefined : true}
          onClick={() => dispatch("OPEN")}
        >
          {artwork}
        </button>
      )}
      {sealed ? <p className={styles.openingHint}>{COPY.hint}</p> : null}
    </div>
  );
}
