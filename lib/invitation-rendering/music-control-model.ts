import type { MusicCapabilityV1 } from "./renderer-capabilities";

/**
 * Shared renderer music command model over the frozen music capability
 * (docs/DECISIONS.md RF-05 K23–K25, PO amendment to P35 of 2026-10-03,
 * "VH-02B-M1").
 *
 * Pure: never touches an audio element, `navigator` or the DOM; the
 * capability owns playback. `status` stays the only playback truth.
 * Elegant Editorial v1 keeps its own byte-identical copy in
 * `interactive/music-control.tsx` (recorded technical debt).
 */

export type MusicCommandOutcome = "COMPLETED" | "FAULTED";

/**
 * One explicit user toggle: `pause()` while the authoritative status is
 * `PLAYING`, otherwise `play()` (also the explicit retry after `BLOCKED` /
 * `ERROR`). The Promise means command completion only; an unexpected
 * rejection is absorbed and reported as `FAULTED`, never as a local
 * playing/paused state, and never as an unhandled event-handler rejection.
 */
export async function runMusicToggle(music: MusicCapabilityV1): Promise<MusicCommandOutcome> {
  try {
    if (music.status === "PLAYING") {
      await music.pause();
    } else {
      await music.play();
    }
    return "COMPLETED";
  } catch {
    return "FAULTED";
  }
}

/**
 * The approved start-on-open rule: the explicit opening activation is a user
 * gesture that may start the music. Returns the hook the opening runs
 * synchronously inside that click: unless the status is already `PLAYING`
 * (never restarted), exactly one `play()` attempt through the same toggle
 * path as the music control, so `BLOCKED` / `ERROR` and their explicit retry
 * behave the same. No timer, no automatic retry, no second controller.
 */
export function startMusicOnOpen(music: MusicCapabilityV1): () => void {
  return () => {
    if (music.status === "PLAYING") return;
    void runMusicToggle(music);
  };
}
