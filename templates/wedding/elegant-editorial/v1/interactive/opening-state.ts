/**
 * Elegant Editorial v1 — RF-06D opening interaction state (docs/DECISIONS.md
 * "RF-06-0 …" P7 "Opening card / envelope", P13).
 *
 * Pure and deterministic: no React, no timers, no storage. The opening is a
 * decorative envelope over content that is always present and never blocked:
 *
 * - every render starts `SEALED` (nothing is remembered across reloads);
 * - `OPEN` is reached only by an explicit user action, never by a timer;
 * - `OPEN` plays the finite envelope transition (`motion: "TRANSITION"`),
 *   `SKIP` reaches the same final state immediately (`motion: "INSTANT"`);
 * - once opened, later actions change nothing (no re-sealing, no replay).
 *
 * Reduced motion is CSS-owned: under `prefers-reduced-motion: reduce` both
 * paths are instant regardless of `motion`.
 */

export type OpeningPhase = "SEALED" | "OPENED";

export type OpeningMotion = "TRANSITION" | "INSTANT";

export type OpeningState =
  | { readonly phase: "SEALED" }
  | { readonly phase: "OPENED"; readonly motion: OpeningMotion };

export type OpeningAction = "OPEN" | "SKIP";

export const INITIAL_OPENING_STATE: OpeningState = Object.freeze({ phase: "SEALED" });

const OPENED_WITH_TRANSITION: OpeningState = Object.freeze({ phase: "OPENED", motion: "TRANSITION" });
const OPENED_INSTANTLY: OpeningState = Object.freeze({ phase: "OPENED", motion: "INSTANT" });

export function openingReducer(state: OpeningState, action: OpeningAction): OpeningState {
  if (state.phase === "OPENED") return state;
  return action === "OPEN" ? OPENED_WITH_TRANSITION : OPENED_INSTANTLY;
}
