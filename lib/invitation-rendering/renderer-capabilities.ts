import type { MediaResolution } from "./invitation-view-model-types";
import type { RsvpCapabilityV1 } from "./rsvp-capability";

/**
 * Invitation Rendering Foundation RF-05A — closed renderer capability
 * contracts (docs/DECISIONS.md "RF-05 Shared Renderer Boundary / Minimum
 * Shared Client Capabilities Contract Clarification" K14, K21–K26, K35).
 *
 * Types and expected-result vocabularies only. Concrete browser adapters
 * (clipboard, audio, clock, media download) are later integration and never
 * live here.
 */

// ---------------------------------------------------------------------------
// Clipboard (K21–K22)
// ---------------------------------------------------------------------------

export const CLIPBOARD_COPY_RESULT_STATUSES = ["SUCCESS", "UNAVAILABLE", "FAILED"] as const;

export type ClipboardCopyResultStatusV1 = (typeof CLIPBOARD_COPY_RESULT_STATUSES)[number];

/** Status-only discriminated union. `SUCCESS` means the copy really succeeded. */
export type ClipboardCopyResultV1 = {
  [S in ClipboardCopyResultStatusV1]: { readonly status: S };
}[ClipboardCopyResultStatusV1];

/** Unexpected faults may reject; a rejection is never success. */
export interface ClipboardCapabilityV1 {
  copyText(text: string): Promise<ClipboardCopyResultV1>;
}

// ---------------------------------------------------------------------------
// Music (K23–K25)
// ---------------------------------------------------------------------------

export const MUSIC_PLAYBACK_STATUSES = ["PAUSED", "PLAYING", "BLOCKED", "ERROR"] as const;

export type MusicPlaybackStatusV1 = (typeof MUSIC_PLAYBACK_STATUSES)[number];

/**
 * `status` is the only authoritative playback state. The `play()`/`pause()`
 * Promise means command completion only: it resolves to no value and never
 * implies `PLAYING`/`PAUSED`. Expected outcomes are `status` values, never
 * rejections; unexpected faults may reject.
 */
export interface MusicCapabilityV1 {
  readonly status: MusicPlaybackStatusV1;
  play(): Promise<void>;
  pause(): Promise<void>;
}

/**
 * K24: `capabilities.music` may be present only when the ViewModel audio
 * slot (`viewModel.media.audio`) exists and is `RESOLVED`. Presence
 * predicate only; it creates no capability and ignores section visibility
 * and playback state.
 */
export function isMusicCapabilityPermittedV1(audio: MediaResolution | undefined): boolean {
  return audio !== undefined && audio.status === "RESOLVED";
}

// ---------------------------------------------------------------------------
// Media download (WC-GIFT-QR-01, K21-shaped)
// ---------------------------------------------------------------------------

export const MEDIA_DOWNLOAD_RESULT_STATUSES = ["SUCCESS", "UNAVAILABLE", "FAILED"] as const;

export type MediaDownloadResultStatusV1 = (typeof MEDIA_DOWNLOAD_RESULT_STATUSES)[number];

/** Status-only discriminated union. `SUCCESS` means the file really reached the browser. */
export type MediaDownloadResultV1 = {
  [S in MediaDownloadResultStatusV1]: { readonly status: S };
}[MediaDownloadResultStatusV1];

/**
 * Saves an already-RESOLVED runtime media URL to the guest's device, byte for
 * byte. Shaped exactly like the clipboard capability (K21–K22) and for the
 * same reason: a renderer island may not touch `fetch`, `document` or object
 * URLs itself (RF-06D), so the one browser adapter behind this interface owns
 * them.
 *
 * `baseName` is a fixed, non-identifying file name stem chosen by the caller
 * from a closed set; the adapter appends the extension it derives from the
 * bytes it actually received. The adapter never re-encodes, redraws or
 * rasterizes anything, and never puts a URL, token, customer name or account
 * number in the file name. `UNAVAILABLE` means the browser cannot save files
 * at all; `FAILED` covers an expired or rejected URL and every other expected
 * failure. Unexpected faults may reject; a rejection is never success.
 */
export interface MediaDownloadCapabilityV1 {
  saveImage(url: string, baseName: string): Promise<MediaDownloadResultV1>;
}

// ---------------------------------------------------------------------------
// Clock (K26)
// ---------------------------------------------------------------------------

/** Explicit runtime epoch milliseconds; no ambient current time. */
export interface ClockCapabilityV1 {
  readonly nowEpochMs: number;
}

// ---------------------------------------------------------------------------
// Closed capability object (K14)
// ---------------------------------------------------------------------------

/**
 * Exactly these optional members. A present member means the runtime
 * capability is available; an absent member means unavailable, never success.
 */
export interface InvitationRendererCapabilitiesV1 {
  readonly rsvp?: RsvpCapabilityV1;
  readonly clipboard?: ClipboardCapabilityV1;
  readonly music?: MusicCapabilityV1;
  readonly clock?: ClockCapabilityV1;
  /**
   * WC-GIFT-QR-01. Added to the closed K14 set the same way `clipboard` was:
   * a browser API a renderer needs but may not reach itself. Every existing
   * member keeps its meaning, and a renderer that ignores this one behaves
   * exactly as before.
   */
  readonly download?: MediaDownloadCapabilityV1;
}
