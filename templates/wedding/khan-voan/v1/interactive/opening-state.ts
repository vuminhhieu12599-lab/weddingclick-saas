/**
 * Khăn Voan v1 — opening state. Pure: no React, no timers, no storage.
 * `OPEN` (the guest taps the veil) moves CLOSED → OPENING; `FINISHED` (the
 * front veil's own transitionend) moves OPENING → DONE, after which the veil
 * leaves the tree. Every page load starts CLOSED.
 */

export type OpeningPhase = "CLOSED" | "OPENING" | "DONE";

export type OpeningAction = "OPEN" | "FINISHED";

export const INITIAL_OPENING_PHASE: OpeningPhase = "CLOSED";

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
