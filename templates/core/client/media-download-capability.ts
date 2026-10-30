import type {
  MediaDownloadCapabilityV1,
  MediaDownloadResultV1,
} from "../../../lib/invitation-rendering/renderer-capabilities";

/**
 * RF-06C browser adapter — saving an already-RESOLVED runtime media URL to
 * the guest's device (WC-GIFT-QR-01). The only module that may touch `fetch`,
 * `document`, `URL.createObjectURL` or an anchor for this purpose; renderer
 * islands reach it solely through `capabilities.download`, exactly as they
 * reach the clipboard.
 *
 * THE BYTES ARE NEVER TOUCHED. The response body becomes a Blob and that
 * Blob is what the browser saves. Nothing is decoded, drawn to a canvas,
 * re-encoded, resized or screenshotted, so a downloaded QR is the same file
 * the family uploaded and scans exactly as the one on screen.
 *
 * WHY A FETCH AND NOT `<a download>`. The `download` attribute is ignored for
 * a cross-origin URL, and runtime media URLs are signed Storage URLs on
 * another origin — a plain anchor would navigate to the image instead of
 * saving it. Storage answers these requests with
 * `Access-Control-Allow-Origin: *`, so reading the bytes is permitted. No
 * proxy, no credentials, no cookies: `credentials: "omit"`.
 *
 * HONEST OUTCOMES (CLAUDE.md §22). `SUCCESS` only after the bytes arrived and
 * the anchor was activated. A signed URL that has expired (the runtime TTL is
 * one hour) answers 4xx and is `FAILED`, as is a network failure, an empty
 * body or anything that is not an image. `UNAVAILABLE` means this browser
 * cannot save a file at all. The QR itself stays on screen and scannable
 * whatever happens here.
 */

const SUCCESS: MediaDownloadResultV1 = Object.freeze({ status: "SUCCESS" });
const UNAVAILABLE: MediaDownloadResultV1 = Object.freeze({ status: "UNAVAILABLE" });
const FAILED: MediaDownloadResultV1 = Object.freeze({ status: "FAILED" });

/**
 * The extension for the bytes actually received, never for what was assumed.
 * These are the three image types the media policy accepts
 * (`IMAGE_MEDIA_MIME_TYPES`); anything else keeps the neutral `.png` so the
 * file still names itself as an image.
 */
const EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
});

export function extensionForImageBlob(type: string): string {
  return EXTENSION_BY_MIME_TYPE[type.split(";")[0]?.trim().toLowerCase() ?? ""] ?? "png";
}

/**
 * Everything the save needs, observed on the client only: a DOM to build the
 * anchor in, object URLs, and an anchor that honours `download`. False during
 * server render and hydration, so the control is absent rather than broken.
 */
export function isBrowserDownloadAvailable(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function" &&
    typeof fetch === "function" &&
    "download" in document.createElement("a")
  );
}

async function saveImage(url: string, baseName: string): Promise<MediaDownloadResultV1> {
  if (!isBrowserDownloadAvailable()) return UNAVAILABLE;
  let blob: Blob;
  try {
    const response = await fetch(url, { credentials: "omit", cache: "no-store", mode: "cors" });
    // An expired or rejected signed URL lands here, never on a saved file.
    if (!response.ok) return FAILED;
    blob = await response.blob();
  } catch {
    return FAILED;
  }
  if (blob.size === 0 || !blob.type.toLowerCase().startsWith("image/")) return FAILED;

  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${baseName}.${extensionForImageBlob(blob.type)}`;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    return FAILED;
  } finally {
    // Safari needs the object URL to outlive the click by a turn of the loop.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
  return SUCCESS;
}

export const BROWSER_MEDIA_DOWNLOAD_CAPABILITY: MediaDownloadCapabilityV1 = Object.freeze({ saveImage });
