import { useState } from "react";

import { runMusicToggle } from "../../../../../lib/invitation-rendering/music-control-model";
import type { MusicCapabilityV1, MusicPlaybackStatusV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.music;

/** Fixed note for the current status, or `null` when the pressed state says enough. */
export function musicStatusNote(status: MusicPlaybackStatusV1, faulted: boolean): string | null {
  if (faulted) return COPY.commandFailed;
  if (status === "BLOCKED") return COPY.blocked;
  if (status === "ERROR") return COPY.error;
  return null;
}

/**
 * Vietnamese Heritage v1 music control (docs/DECISIONS.md "VH-02B-M1").
 * Rendered by the root only when `sections.music` is true **and**
 * `capabilities.music` exists; there is no disabled or placeholder variant.
 *
 * Task 029 visual: a small round ivory control with an antique-gold rim
 * floating at the top right of the invitation column (above the closed
 * cover too), ♪ while not playing; vermilion with ♫ while playing. The
 * pressed state is `status === "PLAYING"` and nothing else; a press pauses
 * while playing, otherwise plays (the explicit retry after `BLOCKED` /
 * `ERROR`, which show their honest note). Unexpected rejections are absorbed
 * by the shared command model and shown as a note, never as a local
 * playing state. Nothing retries on its own.
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
        <span className={styles.musicGlyph} aria-hidden="true">
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
