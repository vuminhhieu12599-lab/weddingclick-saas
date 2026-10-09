import { useState } from "react";

import { runMusicToggle } from "../../../../../lib/invitation-rendering/music-control-model";
import type { MusicCapabilityV1, MusicPlaybackStatusV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";

const COPY = ROMANTIC_MINIMAL_V1_COPY.music;

/** Fixed note for the current status, or `null` when the pressed state says enough. */
export function musicStatusNote(status: MusicPlaybackStatusV1, faulted: boolean): string | null {
  if (faulted) return COPY.commandFailed;
  if (status === "BLOCKED") return COPY.blocked;
  if (status === "ERROR") return COPY.error;
  return null;
}

/**
 * Romantic Minimal v1 music control (docs/DECISIONS.md "RM-02"). Rendered
 * only with `sections.music` **and** `capabilities.music`; no disabled or
 * placeholder variant. Task 029 visual: a 40 px round ivory control with a
 * rose rim, sticky at the top right (♪), filled rose with a pulsing ♫ while
 * playing. Pressed state is `status === "PLAYING"` only; `BLOCKED` / `ERROR`
 * show an honest note. Nothing retries on its own.
 */
export function MusicControl({ music }: { music: MusicCapabilityV1 }) {
  const [faulted, setFaulted] = useState(false);
  const playing = music.status === "PLAYING";
  const note = musicStatusNote(music.status, faulted);

  function handleToggle() {
    setFaulted(false);
    void runMusicToggle(music).then((outcome) => setFaulted(outcome === "FAULTED"));
  }

  return (
    <div className={styles.music} data-music-status={music.status.toLowerCase()}>
      <button type="button" className={styles.musicButton} aria-pressed={playing} onClick={handleToggle}>
        <span className={styles.musicIcon} aria-hidden="true">
          {playing ? "♫" : "♪"}
        </span>
        <span className={styles.srOnly}>{COPY.toggle}</span>
      </button>
      <p className={note === null ? styles.srOnly : styles.musicNote} role="status">
        {note}
      </p>
    </div>
  );
}
