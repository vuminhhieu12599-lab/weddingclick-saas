/**
 * Vietnamese Heritage v1 — split-door opening state (docs/DECISIONS.md
 * "VH-02B-M1").
 *
 * Pure and deterministic: no React, no timers, no storage. Every render
 * starts `CLOSED` (nothing is remembered across reloads):
 *
 * - `OPEN` (the explicit "Chạm để mở thiệp" button) is the only way into
 *   `OPENING`, the Task 029 sequence played in CSS;
 * - `FINISHED` is the end of that finite CSS sequence (the cover's own
 *   `animationend`, never a timer) and moves `OPENING` → `DONE`; it is
 *   ignored in any other phase;
 * - `DONE` is final: no re-closing, no replay; the cover leaves the tree.
 */

export type OpeningPhase = "CLOSED" | "OPENING" | "DONE";

export type OpeningAction = "OPEN" | "FINISHED";

export const INITIAL_OPENING_PHASE: OpeningPhase = "CLOSED";

/**
 * Task 029 timing (prototype `OPENING_TIMING`), mirrored by the CSS module:
 * the cover text and medallion react first, the doors start parting at
 * 260 ms and travel 880 ms (ease 0.65, 0, 0.35, 1), 1180 ms in total.
 * Reduced motion: no door travel, a 220 ms fade.
 */
export const OPENING_TIMING_MS = Object.freeze({
  doorsStart: 260,
  doorsDuration: 880,
  total: 1180,
  reducedTotal: 220,
});

export function openingReducer(phase: OpeningPhase, action: OpeningAction): OpeningPhase {
  if (phase === "CLOSED") return action === "OPEN" ? "OPENING" : phase;
  if (phase === "OPENING") return action === "FINISHED" ? "DONE" : phase;
  return phase;
}

/**
 * The explicit activation: the caller's `onOpen` (the start-on-open music
 * hook, when music exists) runs synchronously inside the same click and
 * only while `CLOSED`, so it fires at most once and stays within the user
 * gesture; then `OPEN` is dispatched. Repeated activation changes nothing.
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
