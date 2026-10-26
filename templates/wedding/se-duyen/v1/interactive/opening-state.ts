/**
 * Se Duyên v1 — opening state (SD-V1-01).
 *
 * Pure and deterministic: no React, no DOM, no timers, no storage. Every
 * render starts `closed` — nothing is remembered across reloads, and nothing
 * opens on its own:
 *
 * - `OPEN` (tapping the box, which is itself the only control) is the only
 *   way into `opening`, the approved CSS sequence: the lid lifts, the
 *   photograph rises out of the silk basin;
 * - `RISEN` ends that sequence and moves `opening` → `hero`, where the risen
 *   card has grown to fill the screen and the interior becomes reachable;
 * - `hero` is final: no re-closing and no replay.
 *
 * The phase values are the exact `data-phase` strings the ported stylesheet
 * keys on, so the state machine and the approved CSS cannot drift apart.
 */

export type OpeningPhase = "closed" | "opening" | "hero";

export type OpeningAction = "OPEN" | "RISEN";

export const INITIAL_OPENING_PHASE: OpeningPhase = "closed";

/**
 * The approved pilot v03.2 timing, mirrored by the stylesheet: the lid lifts
 * from 90 ms to 1270 ms, the photograph rises from 620 ms to 1660 ms, a short
 * hold, then the risen card grows to full screen over 1150 ms with the hero
 * text settling over it. `heroAtMs` is where the composition has become the
 * hero. Under reduced motion the stylesheet skips straight to the finished
 * layout, so the phase follows almost immediately.
 */
export const OPENING_TIMING_MS = Object.freeze({
  heroAt: 2150,
  reducedHeroAt: 200,
});

export function openingReducer(phase: OpeningPhase, action: OpeningAction): OpeningPhase {
  if (phase === "closed") return action === "OPEN" ? "opening" : phase;
  if (phase === "opening") return action === "RISEN" ? "hero" : phase;
  return phase;
}
