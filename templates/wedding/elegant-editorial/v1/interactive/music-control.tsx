import { useState } from "react";

import type {
  MusicCapabilityV1,
  MusicPlaybackStatusV1,
} from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

const COPY = ELEGANT_EDITORIAL_V1_COPY.music;

export type MusicCommandOutcome = "COMPLETED" | "FAULTED";

/**
 * One explicit user toggle over the frozen RF-05 music capability (K23,
 * K25): `pause()` while the authoritative status is `PLAYING`, otherwise
 * `play()` (which is also the explicit retry after `BLOCKED`/`ERROR`).
 *
 * The command Promise means completion only. An unexpected rejection is
 * caught here, so an event handler never leaves an unhandled rejection, and
 * it is reported as `FAULTED`; it never becomes a local playing/paused
 * state. The capability `status` stays the only playback truth.
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

/** Fixed note for the current status, or `null` when the pressed state says enough. */
export function musicStatusNote(status: MusicPlaybackStatusV1, faulted: boolean): string | null {
  if (faulted) return COPY.commandFailed;
  if (status === "BLOCKED") return COPY.blocked;
  if (status === "ERROR") return COPY.error;
  return null;
}

function MusicGlyph({ playing }: { playing: boolean }) {
  return (
    <svg className={styles.musicGlyph} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {playing ? (
        <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
      ) : (
        <path d="M17 3v11.2a3.3 3.3 0 1 1-2-3V7l-6 1.6v7.6a3.3 3.3 0 1 1-2-3V6.2z" />
      )}
    </svg>
  );
}

interface MusicControlProps {
  music: MusicCapabilityV1;
}

/**
 * RF-06D music control island (P35). Rendered by the root only when
 * `sections.music` is true **and** `capabilities.music` is present; there is
 * no disabled, placeholder or "unavailable" variant. Nothing plays until the
 * user presses the button, and nothing retries on its own. The pressed
 * state is `status === "PLAYING"` and nothing else.
 */
export function MusicControl({ music }: MusicControlProps) {
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
        <MusicGlyph playing={playing} />
        <span className={styles.srOnly}>{COPY.toggle}</span>
      </button>
      <p className={note === null ? styles.srOnly : styles.musicNote} role="status">
        {note}
      </p>
    </div>
  );
}
