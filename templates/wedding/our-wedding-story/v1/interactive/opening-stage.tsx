import { useEffect, useReducer, useRef, useSyncExternalStore, type ReactNode } from "react";

import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import styles from "../our-wedding-story-v1.module.css";
import { activateOpening, INITIAL_OPENING_PHASE, openingReducer, type OpeningPhase } from "./opening-state";

const COPY = OUR_WEDDING_STORY_V1_COPY.cover;

const PHASE_ATTRIBUTE: Readonly<Record<OpeningPhase, string>> = Object.freeze({ CLOSED: "closed", OPEN: "open" });

/** Hydration marker: `false` in server markup and during hydration, `true` once running in the browser. */
function subscribeNever(): () => void {
  return () => undefined;
}

interface OpeningStageProps {
  /** Builds the cover around the island-owned action ("Mở thiệp", then the scroll hint). */
  renderCover: (action: ReactNode) => ReactNode;
  /** The music dock, shown only after opening (or nothing). */
  music: ReactNode;
  /** Synchronous start-on-open hook (music), run at most once by the explicit tap. */
  onOpen?: () => void;
  /** The invitation body (pages 02 …). */
  children: ReactNode;
}

/**
 * Our Wedding Story v1 opening island (docs/DECISIONS.md "OWS-01";
 * Visual Freeze v1 cover gate).
 *
 * `CLOSED` → `OPEN`, only through the real "Mở thiệp" button; nothing opens
 * on a timer and nothing is remembered. While `CLOSED`, and only once
 * hydrated (`data-interactive`), the body waits hidden under the cover, so
 * without JavaScript nothing is ever hidden. Opening replaces the button with
 * "Cuộn xuống để đọc tiếp", shows the music dock and the body, brings the
 * body's first page to the top of the screen and moves focus to it without
 * a second scroll. The body's entrance is a CSS fade (none under reduced
 * motion).
 */
export function OpeningStage({ renderCover, music, onOpen, children }: OpeningStageProps) {
  const [phase, dispatch] = useReducer(openingReducer, INITIAL_OPENING_PHASE);
  const interactive = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  // Synchronous duplicate guard: several presses can land before React rerenders with OPEN.
  const activated = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "OPEN") return;
    const body = bodyRef.current;
    if (body === null) return;
    body.scrollIntoView({ block: "start" });
    body.focus({ preventScroll: true });
  }, [phase]);

  const action =
    phase === "OPEN" ? (
      <span className={styles.coverScrollHint}>{COPY.scrollHint}</span>
    ) : (
      <button
        type="button"
        className={styles.openButton}
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
      {renderCover(action)}
      {phase === "OPEN" ? music : null}
      <div ref={bodyRef} className={styles.body} tabIndex={-1}>
        {children}
      </div>
    </main>
  );
}
