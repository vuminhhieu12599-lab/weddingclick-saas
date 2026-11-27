import { useState } from "react";

import { runMusicToggle } from "../../../../../lib/invitation-rendering/music-control-model";
import type { MusicCapabilityV1, MusicPlaybackStatusV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { KHAN_VOAN_V1_COPY } from "../copy";
import styles from "../khan-voan-v1.module.css";

const COPY = KHAN_VOAN_V1_COPY.music;

function statusNote(status: MusicPlaybackStatusV1, faulted: boolean): string | null {
  if (faulted) return COPY.commandFailed;
  if (status === "BLOCKED") return COPY.blocked;
  if (status === "ERROR") return COPY.error;
  return null;
}

/** The round music button, fixed at the bottom corner; playback only through the capability. */
export function MusicControl({ music }: { music: MusicCapabilityV1 }) {
  const [faulted, setFaulted] = useState(false);
  const playing = music.status === "PLAYING";
  const note = statusNote(music.status, faulted);

  function handleToggle() {
    setFaulted(false);
    void runMusicToggle(music).then((outcome) => setFaulted(outcome === "FAULTED"));
  }

  return (
    <div className={styles.music} data-music-status={music.status.toLowerCase()}>
      <button type="button" className={styles.musicButton} aria-pressed={playing} onClick={handleToggle}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 17.5V5.8l10-2.3v11.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="6.6" cy="17.6" r="2.4" fill="currentColor" />
          <circle cx="16.6" cy="15.2" r="2.4" fill="currentColor" />
        </svg>
        <span className={styles.srOnly}>{COPY.toggle}</span>
      </button>
      <p className={note === null ? styles.srOnly : styles.musicNote} role="status">
        {note}
      </p>
    </div>
  );
}
