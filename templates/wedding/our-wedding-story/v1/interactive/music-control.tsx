import { useState } from "react";

import { runMusicToggle } from "../../../../../lib/invitation-rendering/music-control-model";
import type { MusicCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import styles from "../our-wedding-story-v1.module.css";

const COPY = OUR_WEDDING_STORY_V1_COPY.music;

/**
 * The failure note is shown only after an explicit tap (Visual Freeze v1: a
 * blocked start on "Mở thiệp" just stays paused): then a faulted command or
 * a `BLOCKED` / `ERROR` status reports "Không phát được nhạc".
 */
export function musicFailureVisible(status: MusicCapabilityV1["status"], explicit: boolean, faulted: boolean): boolean {
  return explicit && (faulted || status === "BLOCKED" || status === "ERROR");
}

/**
 * Our Wedding Story v1 music dock (docs/DECISIONS.md "OWS-01"). Rendered only
 * after opening and only with `sections.music` **and** `capabilities.music`;
 * no disabled or placeholder variant. Visual Freeze v1: a zero-height sticky
 * dock with a 34 px round ivory control (play ▶ / pause ❚❚). Pressed state is
 * `status === "PLAYING"` only. Nothing retries on its own.
 */
export function MusicControl({ music }: { music: MusicCapabilityV1 }) {
  const [explicit, setExplicit] = useState(false);
  const [faulted, setFaulted] = useState(false);
  const playing = music.status === "PLAYING";

  function handleToggle() {
    setExplicit(true);
    setFaulted(false);
    void runMusicToggle(music).then((outcome) => setFaulted(outcome === "FAULTED"));
  }

  return (
    <div className={styles.musicDock} data-music-status={music.status.toLowerCase()}>
      <button type="button" className={styles.musicFab} onClick={handleToggle} aria-label={playing ? COPY.pause : COPY.play} aria-pressed={playing}>
        {playing ? (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
            <rect x="3.5" y="3" width="2.6" height="10" rx="0.6" fill="currentColor" />
            <rect x="9.9" y="3" width="2.6" height="10" rx="0.6" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M4.5 2.8v10.4L13 8z" fill="currentColor" />
          </svg>
        )}
      </button>
      <p className={musicFailureVisible(music.status, explicit, faulted) ? styles.musicError : styles.srOnly} role="status">
        {musicFailureVisible(music.status, explicit, faulted) ? COPY.failed : null}
      </p>
    </div>
  );
}
