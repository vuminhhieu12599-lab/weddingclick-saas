"use client";

import { useState } from "react";

/**
 * Shared floating background-music control behavior (checkpoint V5 §B9).
 * Product direction only: each invitation will carry a configurable track
 * (`PrototypeWeddingData.music`), chosen from a future WeddingClick music
 * library or an uploaded file — not built here. No audio asset is loaded or
 * played in this prototype; toggling only flips the visual play/pause state
 * per docs/TASK029's "no external audio assets solely for this prototype" rule.
 */
export function useMusicControl() {
  const [isPlaying, setIsPlaying] = useState(false);
  const toggle = () => setIsPlaying((prev) => !prev);
  return { isPlaying, toggle };
}
