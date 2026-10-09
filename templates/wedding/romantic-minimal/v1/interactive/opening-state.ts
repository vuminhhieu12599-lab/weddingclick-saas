/**
 * Romantic Minimal v1 — opening state (docs/DECISIONS.md "RM-02").
 *
 * Pure and deterministic: no React, no timers, no storage. Every render starts
 * `CLOSED` (nothing is remembered across reloads):
 *
 * - `OPEN` (the explicit "Mở thiệp" button) is the only way into `OPENING`,
 *   the Task 029 sequence played in CSS;
 * - `FINISHED` is the end of that finite CSS sequence (the cover's own
 *   `animationend`, never a timer) and moves `OPENING` → `DONE`;
 * - `DONE` is final: no re-closing, no replay; the cover leaves the tree.
 */

export type OpeningPhase = "CLOSED" | "OPENING" | "DONE";

export type OpeningAction = "OPEN" | "FINISHED";

export const INITIAL_OPENING_PHASE: OpeningPhase = "CLOSED";

/**
 * Task 029 timing (the approved direction's motion values), mirrored by the CSS
 * module: seal pulse 450 ms and heart burst 850 ms at once; the card lifts
 * from 250 ms for 800 ms and fades from 700 ms; the rose field fades from
 * 500 ms for 550 ms, which ends the cover at 1050 ms. Inside, the content
 * fades in from 450 ms, Save The Date rises from 850 ms (900 ms) and its photo
 * is drawn up from 1350 ms (1150 ms). Reduced motion: the cover is simply
 * removed (1 ms) and nothing moves.
 */
export const OPENING_TIMING_MS = Object.freeze({
  coverTotal: 1050,
  reducedTotal: 1,
});

export function openingReducer(phase: OpeningPhase, action: OpeningAction): OpeningPhase {
  if (phase === "CLOSED") return action === "OPEN" ? "OPENING" : phase;
  if (phase === "OPENING") return action === "FINISHED" ? "DONE" : phase;
  return phase;
}

/**
 * The explicit activation: `onOpen` (the start-on-open music hook, when music
 * exists) runs synchronously inside the same click and only while `CLOSED`;
 * then `OPEN` is dispatched. Repeated activation changes nothing.
 */
export function activateOpening(
  phase: OpeningPhase,
  onOpen: (() => void) | undefined,
  dispatch: (action: OpeningAction) => void,
): void {
  if (phase !== "CLOSED") return;
  onOpen?.();
  dispatch("OPEN");
}
