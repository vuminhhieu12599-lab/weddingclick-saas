import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { MEDIA_TYPES, type MediaType } from "../../domain";
import {
  NEVER_OPTIMIZED_MEDIA_TYPES,
  OPTIMIZED_IMAGE_MEDIA_TYPES,
  OPTIMIZED_MAX_LONG_EDGE,
  OPTIMIZED_WEBP_QUALITY,
  SMALL_FILE_FAST_PATH_MAX_BYTES,
  isOptimizableImageMediaType,
  isOptimizedBlobAcceptable,
  isSmallFileFastPath,
  optimizeImageForUpload,
  optimizedDimensions,
  webpFileName,
  type DecodedImage,
  type ImageCodec,
  type PixelSize,
} from "../image-upload-optimizer";

/** P1-MEDIA-01: browser image optimization policy, decisions and fail-safe fallbacks. */

const MB = 1024 * 1024;

function imageFile(name: string, type: string, size: number, lastModified = 1_700_000_000_000): File {
  return new File([new Uint8Array(size)], name, { type, lastModified });
}

/** A fake codec: decodes to `source` and encodes `encodedBytes` of `encodedType`. */
function fakeCodec(
  source: PixelSize | null,
  { encodedBytes = 100_000, encodedType = "image/webp" }: { encodedBytes?: number | null; encodedType?: string } = {},
) {
  const release = vi.fn();
  const encodeCalls: { size: PixelSize; mimeType: string; quality: number }[] = [];
  const codec: ImageCodec = {
    decode: vi.fn(async (): Promise<DecodedImage | null> => (source === null ? null : { ...source, release })),
    encode: vi.fn(async (_image, size, mimeType, quality) => {
      encodeCalls.push({ size, mimeType, quality });
      return encodedBytes === null ? null : new Blob([new Uint8Array(encodedBytes)], { type: encodedType });
    }),
  };
  return { codec, release, encodeCalls };
}

describe("role policy", () => {
  it("AUDIO and every QR role are never optimized; only the photo allowlist is", () => {
    for (const type of NEVER_OPTIMIZED_MEDIA_TYPES) expect(isOptimizableImageMediaType(type), type).toBe(false);
    expect([...NEVER_OPTIMIZED_MEDIA_TYPES].sort()).toEqual(["AUDIO", "QR_BRIDE", "QR_COMMON", "QR_GROOM"]);
    expect([...OPTIMIZED_IMAGE_MEDIA_TYPES].sort()).toEqual(
      ["COVER", "GALLERY", "LOVE_STORY_PHOTO", "PHOTO", "PHOTO_STORY", "PORTRAIT_BRIDE", "PORTRAIT_GROOM", "SOCIAL_SHARE_COVER"].sort(),
    );
    for (const type of OPTIMIZED_IMAGE_MEDIA_TYPES) expect(isOptimizableImageMediaType(type), type).toBe(true);
  });

  it("every MediaType is classified exactly once (a new role must be classified deliberately)", () => {
    const classified = [...OPTIMIZED_IMAGE_MEDIA_TYPES, ...NEVER_OPTIMIZED_MEDIA_TYPES] as MediaType[];
    expect(new Set(classified).size).toBe(classified.length);
    expect([...classified].sort()).toEqual([...MEDIA_TYPES].sort());
  });

  it.each(["AUDIO", "QR_GROOM", "QR_BRIDE", "QR_COMMON"] as const)(
    "%s is returned untouched without decoding or encoding",
    async (mediaType) => {
      const original =
        mediaType === "AUDIO" ? imageFile("song.mp3", "audio/mpeg", 5 * MB) : imageFile("qr.png", "image/png", 3 * MB);
      const { codec } = fakeCodec({ width: 4000, height: 4000 });
      const result = await optimizeImageForUpload(mediaType, original, codec);
      expect(result).toEqual({ file: original, outcome: "NOT_ELIGIBLE" });
      expect(codec.decode).not.toHaveBeenCalled();
      expect(codec.encode).not.toHaveBeenCalled();
    },
  );
});

describe("optimizedDimensions", () => {
  it("landscape > 1600 scales to a 1600 long edge with the ratio preserved", () => {
    expect(optimizedDimensions({ width: 4032, height: 3024 })).toEqual({ width: 1600, height: 1200 });
    expect(optimizedDimensions({ width: 6000, height: 2000 })).toEqual({ width: 1600, height: 533 });
  });

  it("portrait > 1600 scales on its height", () => {
    expect(optimizedDimensions({ width: 3024, height: 4032 })).toEqual({ width: 1200, height: 1600 });
    expect(optimizedDimensions({ width: 1080, height: 1920 })).toEqual({ width: 900, height: 1600 });
  });

  it("square scales to 1600 × 1600", () => {
    expect(optimizedDimensions({ width: 3000, height: 3000 })).toEqual({ width: 1600, height: 1600 });
  });

  it("never upscales an image already within the ceiling", () => {
    expect(optimizedDimensions({ width: 1600, height: 900 })).toEqual({ width: 1600, height: 900 });
    expect(optimizedDimensions({ width: 640, height: 480 })).toEqual({ width: 640, height: 480 });
  });

  it("never collapses an extreme panorama below 1 px", () => {
    expect(optimizedDimensions({ width: 20000, height: 5 })).toEqual({ width: 1600, height: 1 });
  });
});

describe("pure decisions", () => {
  it("small-file fast path needs both ≤ 1600 px and ≤ 600 KiB", () => {
    expect(SMALL_FILE_FAST_PATH_MAX_BYTES).toBe(600 * 1024);
    expect(isSmallFileFastPath({ width: 1600, height: 1200 }, 600 * 1024)).toBe(true);
    expect(isSmallFileFastPath({ width: 1600, height: 1200 }, 600 * 1024 + 1)).toBe(false);
    expect(isSmallFileFastPath({ width: 1601, height: 1200 }, 100 * 1024)).toBe(false);
  });

  it("an optimized blob is acceptable only when it is a non-empty WebP strictly smaller than the original", () => {
    const original = { size: 1000 };
    expect(isOptimizedBlobAcceptable(original, new Blob([new Uint8Array(999)], { type: "image/webp" }))).toBe(true);
    expect(isOptimizedBlobAcceptable(original, new Blob([new Uint8Array(1000)], { type: "image/webp" }))).toBe(false);
    expect(isOptimizedBlobAcceptable(original, new Blob([new Uint8Array(10)], { type: "image/png" }))).toBe(false);
    expect(isOptimizedBlobAcceptable(original, new Blob([], { type: "image/webp" }))).toBe(false);
    expect(isOptimizedBlobAcceptable(original, null)).toBe(false);
  });

  it("derives a .webp filename from the original", () => {
    expect(webpFileName("IMG_1234.JPG")).toBe("IMG_1234.webp");
    expect(webpFileName("anh cuoi.final.png")).toBe("anh cuoi.final.webp");
    expect(webpFileName("no-extension")).toBe("no-extension.webp");
    expect(webpFileName(".jpg")).toBe("image.webp");
  });
});

describe("optimizeImageForUpload", () => {
  it("re-encodes a large photo to a smaller 1600 px WebP at quality 0.86", async () => {
    const original = imageFile("IMG_0001.jpeg", "image/jpeg", 4.8 * MB);
    const { codec, release, encodeCalls } = fakeCodec({ width: 3024, height: 4032 }, { encodedBytes: 420_000 });
    const result = await optimizeImageForUpload("GALLERY", original, codec);
    expect(result.outcome).toBe("OPTIMIZED");
    expect(result.file.type).toBe("image/webp");
    expect(result.file.size).toBe(420_000);
    expect(result.file.name).toBe("IMG_0001.webp");
    expect(result.file.lastModified).toBe(original.lastModified);
    expect(encodeCalls).toEqual([
      { size: { width: 1200, height: 1600 }, mimeType: "image/webp", quality: OPTIMIZED_WEBP_QUALITY },
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("re-encodes a within-ceiling but heavy PNG without resizing it", async () => {
    const original = imageFile("logo.png", "image/png", 2 * MB);
    const { codec, encodeCalls } = fakeCodec({ width: 1200, height: 800 }, { encodedBytes: 150_000 });
    const result = await optimizeImageForUpload("COVER", original, codec);
    expect(result.outcome).toBe("OPTIMIZED");
    expect(encodeCalls[0].size).toEqual({ width: 1200, height: 800 });
  });

  it("keeps an already-small, within-ceiling file without encoding it", async () => {
    const original = imageFile("small.webp", "image/webp", 300 * 1024);
    const { codec, release } = fakeCodec({ width: 1200, height: 900 });
    const result = await optimizeImageForUpload("PHOTO_STORY", original, codec);
    expect(result).toEqual({ file: original, outcome: "SMALL_FILE_FAST_PATH" });
    expect(codec.encode).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("falls back to the original when the WebP is not smaller", async () => {
    const original = imageFile("tight.jpg", "image/jpeg", 800_000);
    const { codec } = fakeCodec({ width: 2000, height: 1500 }, { encodedBytes: 900_000 });
    expect(await optimizeImageForUpload("GALLERY", original, codec)).toEqual({ file: original, outcome: "NOT_SMALLER" });
  });

  it("falls back to the original when decoding is unsupported, throws, or yields no pixels", async () => {
    const original = imageFile("a.jpg", "image/jpeg", 5 * MB);
    expect((await optimizeImageForUpload("GALLERY", original, fakeCodec(null).codec)).file).toBe(original);
    const throwing: ImageCodec = {
      decode: async () => {
        throw new Error("decode failed");
      },
      encode: async () => null,
    };
    expect(await optimizeImageForUpload("GALLERY", original, throwing)).toEqual({
      file: original,
      outcome: "UNSUPPORTED_OR_FAILED",
    });
    const empty = fakeCodec({ width: 0, height: 0 }).codec;
    expect((await optimizeImageForUpload("GALLERY", original, empty)).outcome).toBe("UNSUPPORTED_OR_FAILED");
  });

  it("falls back to the original when encoding returns null, throws, or silently produces another format", async () => {
    const original = imageFile("a.jpg", "image/jpeg", 5 * MB);
    const nullEncode = fakeCodec({ width: 4000, height: 3000 }, { encodedBytes: null });
    expect(await optimizeImageForUpload("GALLERY", original, nullEncode.codec)).toEqual({
      file: original,
      outcome: "UNSUPPORTED_OR_FAILED",
    });
    expect(nullEncode.release).toHaveBeenCalledTimes(1);

    // Older Safari: toBlob("image/webp") silently returns a PNG.
    const pngFallback = fakeCodec({ width: 4000, height: 3000 }, { encodedBytes: 10, encodedType: "image/png" });
    expect((await optimizeImageForUpload("GALLERY", original, pngFallback.codec)).outcome).toBe("UNSUPPORTED_OR_FAILED");

    const release = vi.fn();
    const throwingEncode: ImageCodec = {
      decode: async () => ({ width: 4000, height: 3000, release }),
      encode: async () => {
        throw new Error("canvas exploded");
      },
    };
    expect((await optimizeImageForUpload("GALLERY", original, throwingEncode)).file).toBe(original);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("never optimizes an original over the 10 MiB source policy (no bypass by shrinking first)", async () => {
    const original = imageFile("huge.jpg", "image/jpeg", 10 * MB + 1);
    const { codec } = fakeCodec({ width: 8000, height: 6000 });
    expect(await optimizeImageForUpload("GALLERY", original, codec)).toEqual({ file: original, outcome: "NOT_ELIGIBLE" });
    expect(codec.decode).not.toHaveBeenCalled();
  });

  it("never decodes an unapproved source format (e.g. HEIC); existing validation still decides", async () => {
    const original = imageFile("IMG.HEIC", "image/heic", 3 * MB);
    const { codec } = fakeCodec({ width: 4000, height: 3000 });
    expect((await optimizeImageForUpload("GALLERY", original, codec)).outcome).toBe("NOT_ELIGIBLE");
    expect(codec.decode).not.toHaveBeenCalled();
  });

  it("uses the browser codec by default and degrades to the original where createImageBitmap is missing", async () => {
    expect(typeof globalThis.createImageBitmap).toBe("undefined");
    const original = imageFile("a.jpg", "image/jpeg", 5 * MB);
    expect(await optimizeImageForUpload("GALLERY", original)).toEqual({ file: original, outcome: "UNSUPPORTED_OR_FAILED" });
  });

  it("documents the 1600 px ceiling", () => {
    expect(OPTIMIZED_MAX_LONG_EDGE).toBe(1600);
  });
});

describe("static boundaries", () => {
  const root = join(__dirname, "..", "..", "..");
  const read = (file: string) =>
    readFileSync(join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("the optimizer is pure browser image code: no network, Supabase, credentials or AVIF", () => {
    const source = read("lib/admin/image-upload-optimizer.ts");
    expect(source).not.toMatch(/supabase|fetch\(|service_role|SERVICE_ROLE|serviceRole|getStaffAccessToken|avif/i);
    expect(source).toMatch(/imageOrientation: "from-image"/);
  });

  it("uploadProjectMedia optimizes before upload-intent and uses the actual file everywhere after", () => {
    const client = read("lib/admin/admin-api-client.ts");
    const start = client.indexOf("export async function uploadProjectMedia");
    const body = client.slice(start, client.indexOf("\n}\n", start));
    const optimizeAt = body.indexOf("optimizeImageForUpload(mediaType, original)");
    expect(optimizeAt).toBeGreaterThan(-1);
    expect(optimizeAt).toBeLessThan(body.indexOf("readImageDimensions(file)"));
    expect(body.indexOf("readImageDimensions(file)")).toBeLessThan(body.indexOf("media/upload-intent"));
    expect(body).toMatch(/mimeType: file\.type, sizeBytes: file\.size/);
    expect(body).toMatch(/uploadToSignedMediaPath\(intent\.bucket, intent\.storagePath, intent\.token, file\)/);
    // After optimization the original is never referenced again.
    expect(body.slice(optimizeAt + "optimizeImageForUpload(mediaType, original)".length)).not.toMatch(/\boriginal\b/);
  });
});
