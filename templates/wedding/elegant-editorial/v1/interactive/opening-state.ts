/**
 * Elegant Editorial v1 — RF-06D opening interaction state (docs/DECISIONS.md
 * "RF-06-0 …" P7 "Opening card / envelope", P13; "Elegant Editorial
 * Production Design Baseline" B5 items 2–4, Design Baseline D3; Product Owner
 * ruling: the approved Task029 opening has no visible skip control).
 *
 * Pure and deterministic: no React, no timers, no storage. The opening is a
 * decorative envelope over content that is always present and never blocked:
 *
 * - every render starts `SEALED` (nothing is remembered across reloads);
 * - `OPEN` (the envelope tap) is the only way into the Task029 choreography,
 *   `OPENING`: seal → flap → cover-card rise → the cover dissolves;
 * - `SETTLED` is the end of that finite CSS choreography (an `animationend`
 *   event of an already user-started opening, never a timer); it is ignored
 *   in any other phase;
 * - once opened, later actions change nothing (no re-sealing, no replay).
 *
 * Reduced motion is CSS-owned: under `prefers-reduced-motion: reduce` the
 * choreography collapses to an immediate settle, with no delayed card rise.
 * The opening never blocks content: the invitation is always in normal flow
 * below it, so a guest may simply scroll past without opening.
 */

export type OpeningPhase = "SEALED" | "OPENING" | "OPENED";

export type OpeningState =
  | { readonly phase: "SEALED" }
  | { readonly phase: "OPENING" }
  | { readonly phase: "OPENED" };

export type OpeningAction = "OPEN" | "SETTLED";

export const INITIAL_OPENING_STATE: OpeningState = Object.freeze({ phase: "SEALED" });

const OPENING: OpeningState = Object.freeze({ phase: "OPENING" });
const OPENED: OpeningState = Object.freeze({ phase: "OPENED" });

export function openingReducer(state: OpeningState, action: OpeningAction): OpeningState {
  if (state.phase === "OPENED") return state;
  if (state.phase === "SEALED") return action === "OPEN" ? OPENING : state;
  return action === "SETTLED" ? OPENED : state;
}
