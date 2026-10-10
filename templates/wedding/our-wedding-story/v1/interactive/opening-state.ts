/**
 * Our Wedding Story v1 — opening state (docs/DECISIONS.md "OWS-01").
 *
 * Pure and deterministic: no React, no timers, no storage. Every render starts
 * `CLOSED` (nothing is remembered across reloads). `OPEN` (the explicit "Mở
 * thiệp" button) is the only transition and is final: no re-closing.
 */

export type OpeningPhase = "CLOSED" | "OPEN";

export const INITIAL_OPENING_PHASE: OpeningPhase = "CLOSED";

export function openingReducer(phase: OpeningPhase, action: "OPEN"): OpeningPhase {
  return action === "OPEN" ? "OPEN" : phase;
}

/**
 * The explicit activation: `onOpen` (the start-on-open music hook, when music
 * exists) runs synchronously inside the same click and only while `CLOSED`;
 * then `OPEN` is dispatched. Repeated activation changes nothing.
 */
export function activateOpening(phase: OpeningPhase, onOpen: (() => void) | undefined, dispatch: (action: "OPEN") => void): void {
  if (phase !== "CLOSED") return;
  onOpen?.();
  dispatch("OPEN");
}
