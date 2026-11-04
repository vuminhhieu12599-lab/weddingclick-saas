"use client";

import { useCallback } from "react";

import type { MusicCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { HONG_AN_V2_COPY } from "../copy";
import styles from "../hong-an-v2.module.css";

const COPY = HONG_AN_V2_COPY.music;

/**
 * Hồng Ân v2 — the music control (HA-TEMPLATE-01).
 *
 * NOTHING AUTOPLAYS. The invitation never calls `play()` on the guest's
 * behalf, not even inside the opening gesture: playback begins only when
 * the guest presses this control. `capability.status` is the one
 * authoritative playback state (RF-05 K23) — the button never keeps its
 * own idea of whether sound is coming out — and a `BLOCKED` status is
 * reported honestly rather than shown as playing.
 */
export function MusicControl({ music }: { readonly music: MusicCapabilityV1 }) {
  const playing = music.status === "PLAYING";

  const toggle = useCallback(() => {
    // Promise completion is command completion, never playback state, so
    // nothing is derived from the result (K23).
    void (playing ? music.pause() : music.play());
  }, [music, playing]);

  const label = music.status === "BLOCKED" ? COPY.blocked : playing ? COPY.pause : COPY.play;

  return (
    <button
      className={styles.musicButton}
      type="button"
      onClick={toggle}
      data-status={music.status}
      aria-pressed={playing}
      aria-label={label}
      title={label}
    >
      <span className={styles.musicGlyph} aria-hidden="true" />
    </button>
  );
}
