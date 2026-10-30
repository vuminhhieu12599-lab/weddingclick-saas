import type { CoupleSide } from "./wedding-domain-types";
import type { ResolvedMedia } from "./invitation-view-model-types";
import type { MediaDownloadCapabilityV1 } from "./renderer-capabilities";

/**
 * Shared renderer download-feedback model over the media download capability
 * (WC-GIFT-QR-01), the exact shape of `clipboard-copy-feedback.ts`.
 *
 * Pure: never touches `fetch`, the DOM, storage or a URL — the capability
 * owns the browser API, and every renderer island shares this one model so
 * the five templates behave identically for the same outcome.
 */

export type DownloadFeedback = "IDLE" | "PENDING" | "SUCCESS" | "FAILED" | "UNAVAILABLE";

export type DownloadSettledFeedback = Exclude<DownloadFeedback, "IDLE" | "PENDING">;

/**
 * The saved file's name stem, per family side, identical in every renderer.
 * Deliberately fixed and non-identifying: never a customer or guest name, an
 * account number, a media id, a slug or any part of the signed URL. The
 * adapter appends the extension for the bytes it actually received.
 */
export const GIFT_QR_DOWNLOAD_BASE_NAME: Readonly<Record<CoupleSide, string>> = Object.freeze({
  GROOM: "ma-qr-nha-trai",
  BRIDE: "ma-qr-nha-gai",
});

/**
 * One explicit save of ONE side's own already-RESOLVED QR. `SUCCESS` only
 * when the capability resolved `SUCCESS`; `UNAVAILABLE` and `FAILED` pass
 * through; anything else, including an unexpected rejection, is `FAILED`.
 * Never rejects, so a click handler cannot leave an unhandled rejection, and
 * Promise completion is never success (CLAUDE.md §22).
 */
export async function downloadQrWithFeedback(
  download: MediaDownloadCapabilityV1,
  qr: ResolvedMedia,
  side: CoupleSide,
): Promise<DownloadSettledFeedback> {
  try {
    const result: unknown = await download.saveImage(qr.url, GIFT_QR_DOWNLOAD_BASE_NAME[side]);
    const status: unknown =
      typeof result === "object" && result !== null ? (result as { status?: unknown }).status : undefined;
    if (status === "SUCCESS") return "SUCCESS";
    if (status === "UNAVAILABLE") return "UNAVAILABLE";
    return "FAILED";
  } catch {
    return "FAILED";
  }
}
