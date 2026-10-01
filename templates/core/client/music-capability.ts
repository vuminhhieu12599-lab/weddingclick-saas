import type { MediaResolution } from "../../../lib/invitation-rendering/invitation-view-model-types";
import {
  isMusicCapabilityPermittedV1,
  type MusicPlaybackStatusV1,
} from "../../../lib/invitation-rendering/renderer-capabilities";

/**
 * Invitation Rendering Foundation RF-06C — the music browser adapter
 * (docs/DECISIONS.md "RF-06-0 …" P35; RF-05 K23–K25, K35).
 *
 * The only RF-06 module that touches `Audio`. A controller owns at most one
 * audio instance for one resolved URL:
 *
 * - no audio instance exists until the first explicit `play()` (no autoplay:
 *   nothing is created on module load, render, hydration, mount or media
 *   resolution);
 * - the instance is created with `preload = "none"` and `loop = true`, and is
 *   reused for every later `play()`/`pause()`;
 * - `status` is the only authoritative playback state (K23). `play()`
 *   success → `PLAYING`; a `NotAllowedError` DOMException → `BLOCKED`; any
 *   other DOMException → `ERROR`. Those expected outcomes resolve the command
 *   Promise. Anything that is not a DOMException is an unexpected fault and
 *   rejects, leaving `status` unchanged;
 * - nothing retries: a later explicit `play()` is the only retry (K25). A
 *   media element that reached `ERROR` is never asked to play again (a
 *   browser does not reload a failed element on `play()`, so `ERROR` would
 *   stick): the next explicit `play()` releases it and makes its fresh
 *   attempt on a new instance. `BLOCKED` retries on the same instance;
 * - there is no volume, mute, seek or playlist surface.
 *
 * Owner lifecycle: the controller is inert until `activate()` and
 * `deactivate()` pauses and releases the instance and its listeners. The
 * React owner (runtime-capabilities) activates it after mount and
 * deactivates it on unmount or when the resolved URL changes.
 */

/** The minimum media-element surface the controller uses. */
export interface MusicAudioElementV1 {
  preload: string;
  loop: boolean;
  src: string;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: MusicAudioEventTypeV1, listener: () => void): void;
  removeEventListener(type: MusicAudioEventTypeV1, listener: () => void): void;
}

/** Media events that keep `status` truthful when playback changes outside a command. */
export const MUSIC_AUDIO_EVENT_TYPES = ["playing", "pause", "error"] as const;
export type MusicAudioEventTypeV1 = (typeof MUSIC_AUDIO_EVENT_TYPES)[number];

/** Creates one detached audio element; called only from an explicit `play()`. */
export type MusicAudioFactoryV1 = () => MusicAudioElementV1;

export interface MusicControllerV1 {
  readonly url: string;
  getStatus(): MusicPlaybackStatusV1;
  subscribe(listener: () => void): () => void;
  play(): Promise<void>;
  pause(): Promise<void>;
  activate(): void;
  deactivate(): void;
}

/**
 * P35 runtime gate: a music capability exists only for `sections.music ===
 * true` and a `RESOLVED` ViewModel audio slot (K24). Returns the resolved
 * URL, or `null` for no capability.
 */
export function resolveMusicSourceUrl(musicSectionEnabled: boolean, audio: MediaResolution | undefined): string | null {
  if (musicSectionEnabled !== true || audio === undefined || !isMusicCapabilityPermittedV1(audio)) return null;
  return audio.status === "RESOLVED" ? audio.url : null;
}

function classifyPlayFailure(error: unknown): "BLOCKED" | "ERROR" | undefined {
  if (typeof DOMException === "undefined" || !(error instanceof DOMException)) return undefined;
  return error.name === "NotAllowedError" ? "BLOCKED" : "ERROR";
}

export function createMusicController(url: string, createAudio: MusicAudioFactoryV1): MusicControllerV1 {
  let status: MusicPlaybackStatusV1 = "PAUSED";
  let active = false;
  let audio: MusicAudioElementV1 | null = null;
  /** The owned instance reached `ERROR`; the next explicit `play()` replaces it. */
  let audioFailed = false;
  /** Bumped by every command and by deactivation; a stale `play()` settlement never writes status. */
  let commandSequence = 0;
  const subscribers = new Set<() => void>();

  function setStatus(next: MusicPlaybackStatusV1): void {
    if (next === status) return;
    status = next;
    for (const subscriber of [...subscribers]) subscriber();
  }

  const mediaListeners: Readonly<Record<MusicAudioEventTypeV1, () => void>> = {
    playing: () => {
      if (audio !== null && !audio.paused) setStatus("PLAYING");
    },
    pause: () => {
      if (audio !== null && audio.paused) setStatus("PAUSED");
    },
    error: () => {
      audioFailed = true;
      setStatus("ERROR");
    },
  };

  function ensureAudio(): MusicAudioElementV1 {
    if (audio !== null) return audio;
    const created = createAudio();
    created.preload = "none";
    created.loop = true;
    for (const type of MUSIC_AUDIO_EVENT_TYPES) created.addEventListener(type, mediaListeners[type]);
    created.src = url;
    audio = created;
    return created;
  }

  /** Detaches, pauses and forgets the owned instance (if any). */
  function discardAudio(): void {
    const owned = audio;
    audio = null;
    audioFailed = false;
    if (owned !== null) {
      for (const type of MUSIC_AUDIO_EVENT_TYPES) owned.removeEventListener(type, mediaListeners[type]);
      owned.pause();
    }
  }

  function release(): void {
    commandSequence += 1;
    discardAudio();
    setStatus("PAUSED");
  }

  return Object.freeze({
    url,
    getStatus: () => status,
    subscribe(listener: () => void): () => void {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    async play(): Promise<void> {
      // Before mount or after its owner is gone there is nothing to play.
      if (!active) return;
      // Explicit retry after ERROR: a fresh instance, created inside the same user gesture.
      if (audioFailed) discardAudio();
      const element = ensureAudio();
      commandSequence += 1;
      const sequence = commandSequence;
      let outcome: MusicPlaybackStatusV1 = "PLAYING";
      try {
        await element.play();
      } catch (error) {
        const expected = classifyPlayFailure(error);
        if (expected === undefined) throw error;
        outcome = expected;
      }
      if (sequence === commandSequence && element === audio) {
        if (outcome === "ERROR") audioFailed = true;
        setStatus(outcome);
      }
    },
    async pause(): Promise<void> {
      commandSequence += 1;
      audio?.pause();
      setStatus("PAUSED");
    },
    activate(): void {
      active = true;
    },
    deactivate(): void {
      active = false;
      release();
    },
  });
}

/** The real browser factory: one detached element, created only from an explicit `play()`. */
export const createBrowserAudio: MusicAudioFactoryV1 = () => new Audio();
