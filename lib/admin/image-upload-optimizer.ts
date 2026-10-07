import { maxBytesForMediaType, type MediaType } from "../domain";

/**
 * Browser-side image payload optimization before the Task 024 signed upload
 * (P1-MEDIA-01). A performance enhancement only — never an authorization or
 * validation boundary: the server still re-verifies the authoritative Storage
 * MIME/size at finalize, and the original-file policy (`validateMediaFile`)
 * still runs before this.
 *
 * Policy:
 * - Allowlisted photo roles only. AUDIO and every QR role are never touched
 *   (lossy re-encoding can make a bank QR unscannable); a future role is not
 *   optimized until it is deliberately added here.
 * - Long edge capped at 1600 px (≈3.3× the ≈480 CSS px editorial column),
 *   aspect ratio preserved, never cropped, never upscaled.
 * - Decoded with EXIF orientation applied, so output pixels match the
 *   displayed orientation (the WebP output carries no EXIF to re-rotate it).
 * - Encoded as WebP at quality 0.86; transparency is kept (no background fill).
 * - Fast path: a file already within 1600 px AND at most 600 KiB is kept as-is.
 * - Keep-original rule: the WebP is used only when it is strictly smaller.
 * - Any decode/encode failure, or a browser that silently encodes another
 *   format, falls back to the original file.
 * - Originals over the existing per-role byte limit are not optimized, so the
 *   10 MiB source policy is never bypassed by shrinking first.
 */

export const OPTIMIZED_IMAGE_MEDIA_TYPES = [
  "COVER",
  "GALLERY",
  "PORTRAIT_GROOM",
  "PORTRAIT_COUPLE",
  "PORTRAIT_BRIDE",
  "PHOTO_STORY",
  "LOVE_STORY_PHOTO",
  "SOCIAL_SHARE_COVER",
] as const satisfies readonly MediaType[];

/** Explicitly never lossy-optimized, whatever the caller. */
export const NEVER_OPTIMIZED_MEDIA_TYPES = ["AUDIO", "QR_GROOM", "QR_BRIDE", "QR_COMMON"] as const satisfies readonly MediaType[];

export const OPTIMIZED_MAX_LONG_EDGE = 1600;
export const OPTIMIZED_WEBP_QUALITY = 0.86;
export const OPTIMIZED_OUTPUT_MIME_TYPE = "image/webp";
export const SMALL_FILE_FAST_PATH_MAX_BYTES = 600 * 1024;

/** Source formats the optimizer will decode — the existing approved image MIME types. */
const OPTIMIZABLE_SOURCE_MIME_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

export function isOptimizableImageMediaType(mediaType: MediaType): boolean {
  if ((NEVER_OPTIMIZED_MEDIA_TYPES as readonly MediaType[]).includes(mediaType)) return false;
  return (OPTIMIZED_IMAGE_MEDIA_TYPES as readonly MediaType[]).includes(mediaType);
}

export interface PixelSize {
  width: number;
  height: number;
}

/** Scales so the long edge is at most `maxLongEdge`; ratio preserved, never upscaled, never below 1 px. */
export function optimizedDimensions(source: PixelSize, maxLongEdge: number = OPTIMIZED_MAX_LONG_EDGE): PixelSize {
  const longEdge = Math.max(source.width, source.height);
  if (longEdge <= maxLongEdge) return { width: source.width, height: source.height };
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/** Already small enough in both pixels and bytes: re-encoding would only cost quality. */
export function isSmallFileFastPath(source: PixelSize, sizeBytes: number): boolean {
  return (
    Math.max(source.width, source.height) <= OPTIMIZED_MAX_LONG_EDGE && sizeBytes <= SMALL_FILE_FAST_PATH_MAX_BYTES
  );
}

/** Keep-original rule: only a real, non-empty WebP that is strictly smaller replaces the original. */
export function isOptimizedBlobAcceptable(original: { size: number }, optimized: Blob | null): optimized is Blob {
  return (
    optimized !== null &&
    optimized.type === OPTIMIZED_OUTPUT_MIME_TYPE &&
    optimized.size > 0 &&
    optimized.size < original.size
  );
}

/** "IMG_1234.HEIC.jpg" -> "IMG_1234.HEIC.webp"; extension-less -> "name.webp". */
export function webpFileName(originalName: string): string {
  const base = originalName.replace(/\.[^./\\]*$/, "");
  return `${base.length > 0 ? base : "image"}.webp`;
}

// ---------------------------------------------------------------------------
// Browser primitives (injectable so the decision logic is testable in Node)
// ---------------------------------------------------------------------------

export interface DecodedImage extends PixelSize {
  release(): void;
}

export interface ImageCodec {
  /** Decodes with EXIF orientation applied; null when unsupported/undecodable. */
  decode(file: Blob): Promise<DecodedImage | null>;
  /** Draws `image` at `size` and encodes it; null when encoding is unavailable. */
  encode(image: DecodedImage, size: PixelSize, mimeType: string, quality: number): Promise<Blob | null>;
}

interface BitmapImage extends DecodedImage {
  bitmap: ImageBitmap;
}

function drawResized(
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  size: PixelSize,
): void {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, size.width, size.height);
}

export const browserImageCodec: ImageCodec = {
  async decode(file) {
    if (typeof createImageBitmap !== "function") return null;
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const image: BitmapImage = {
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
    return image;
  },
  async encode(image, size, mimeType, quality) {
    const { bitmap } = image as BitmapImage;
    if (typeof OffscreenCanvas === "function") {
      const canvas = new OffscreenCanvas(size.width, size.height);
      const context = canvas.getContext("2d");
      if (context === null) return null;
      drawResized(context, bitmap, size);
      return canvas.convertToBlob({ type: mimeType, quality });
    }
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (context === null) return null;
    drawResized(context, bitmap, size);
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, quality));
  },
};

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type ImageOptimizationOutcome =
  | "OPTIMIZED"
  | "NOT_ELIGIBLE"
  | "SMALL_FILE_FAST_PATH"
  | "NOT_SMALLER"
  | "UNSUPPORTED_OR_FAILED";

export interface ImageOptimizationResult {
  /** The file to upload: the optimized WebP, or the untouched original. */
  file: File;
  outcome: ImageOptimizationOutcome;
}

/**
 * Never throws: every failure path returns the original file, which the
 * existing client/server policy then accepts or rejects as before.
 */
export async function optimizeImageForUpload(
  mediaType: MediaType,
  original: File,
  codec: ImageCodec = browserImageCodec,
): Promise<ImageOptimizationResult> {
  if (
    !isOptimizableImageMediaType(mediaType) ||
    !OPTIMIZABLE_SOURCE_MIME_TYPES.includes(original.type) ||
    original.size > maxBytesForMediaType(mediaType)
  ) {
    return { file: original, outcome: "NOT_ELIGIBLE" };
  }

  let image: DecodedImage | null = null;
  try {
    image = await codec.decode(original);
    if (image === null || image.width <= 0 || image.height <= 0) {
      return { file: original, outcome: "UNSUPPORTED_OR_FAILED" };
    }
    if (isSmallFileFastPath(image, original.size)) {
      return { file: original, outcome: "SMALL_FILE_FAST_PATH" };
    }
    const encoded = await codec.encode(
      image,
      optimizedDimensions(image),
      OPTIMIZED_OUTPUT_MIME_TYPE,
      OPTIMIZED_WEBP_QUALITY,
    );
    if (encoded === null || encoded.type !== OPTIMIZED_OUTPUT_MIME_TYPE || encoded.size === 0) {
      return { file: original, outcome: "UNSUPPORTED_OR_FAILED" };
    }
    if (!isOptimizedBlobAcceptable(original, encoded)) {
      return { file: original, outcome: "NOT_SMALLER" };
    }
    const file = new File([encoded], webpFileName(original.name), {
      type: OPTIMIZED_OUTPUT_MIME_TYPE,
      lastModified: original.lastModified,
    });
    return { file, outcome: "OPTIMIZED" };
  } catch {
    return { file: original, outcome: "UNSUPPORTED_OR_FAILED" };
  } finally {
    image?.release();
  }
}
