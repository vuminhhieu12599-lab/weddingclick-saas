import { useState } from "react";

import { runMusicToggle } from "../../../../../lib/invitation-rendering/music-control-model";
import type { MusicCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { SE_DUYEN_V1_COPY } from "../copy";
import styles from "../se-duyen-v1.module.css";

const COPY = SE_DUYEN_V1_COPY.music;

/**
 * The failure note appears only after an explicit tap: then a faulted
 * command, or a `BLOCKED` / `ERROR` status, says so plainly. Before the
 * guest has pressed anything there is nothing to report, so nothing is said.
 */
export function musicFailureVisible(status: MusicCapabilityV1["status"], explicit: boolean, faulted: boolean): boolean {
  return explicit && (faulted || status === "BLOCKED" || status === "ERROR");
}

/**
 * Se Duyên v1 music control — the approved gilt disc on the lacquer
 * (SD-V1-02C1).
 *
 * NO AUTOPLAY, AND NO SECOND PLAYER. Playback is the shared RF-06C music
 * capability: the host's one controller owns the single audio element, which
 * it does not even create until the first explicit `play()` — nothing is
 * created on module load, render, hydration, mount or media resolution. This
 * island holds no audio element, no `Audio`, no timer and no retry; it
 * issues one command per tap through the shared `runMusicToggle` and renders
 * what the capability reports.
 *
 * `capabilities.music.status` IS THE ONLY PLAYBACK TRUTH. The pressed state
 * and the pause icon are `status === "PLAYING"` and nothing else, so the
 * control can never claim to be playing while the audio is refused, failed
 * or merely starting: the command Promise means completion only, never
 * success. A guest whose browser refuses playback is told, rather than left
 * pressing a disc that does nothing (CLAUDE.md §22).
 *
 * The control exists only when the host built a music capability, which it
 * does for `sections.music === true` and a RESOLVED audio slot — so a
 * Project with no track, or one whose track cannot be resolved, shows no
 * disc at all rather than a disabled one.
 *
 * It lives inside the interior, sticky, so it appears with the invitation
 * once the box has been opened and never overlays the box a guest taps. The
 * approved cover and lid sequence keeps every pixel it was approved with.
 */
export function MusicControl({ music }: { readonly music: MusicCapabilityV1 }) {
  const [explicit, setExplicit] = useState(false);
  const [faulted, setFaulted] = useState(false);
  const playing = music.status === "PLAYING";
  const failed = musicFailureVisible(music.status, explicit, faulted);

  function handleToggle() {
    setExplicit(true);
    setFaulted(false);
    void runMusicToggle(music).then((outcome) => {
      setFaulted(outcome === "FAULTED");
    });
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.musicButton} ${playing ? styles.musicButtonActive : ""}`}
        onClick={handleToggle}
        aria-pressed={playing}
        aria-label={playing ? COPY.pause : COPY.play}
        data-music-status={music.status.toLowerCase()}
      >
        <span className={styles.musicIcon} aria-hidden="true">
          {playing ? "♫" : "♪"}
        </span>
      </button>
      <p className={failed ? styles.musicNote : styles.srOnly} role="status">
        {failed ? COPY.failed : null}
      </p>
    </>
  );
}
