import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * P1-MEDIA-01 runtime regression: the real uploadProjectMedia + real
 * optimizer + real dimension reader, with only the browser image primitives
 * (createImageBitmap / OffscreenCanvas), fetch and the signed Storage upload
 * stubbed. Upload-intent, the signed upload and finalize must all describe
 * the file actually uploaded.
 */

const signedUploads: { bucket: string; storagePath: string; token: string; file: File }[] = [];

vi.mock("../staff-session-client", () => ({ getStaffAccessToken: async () => "staff-jwt" }));
vi.mock("../signed-media-upload", () => ({
  uploadToSignedMediaPath: vi.fn(async (bucket: string, storagePath: string, token: string, file: File) => {
    signedUploads.push({ bucket, storagePath, token, file });
    return true;
  }),
}));

const { uploadProjectMedia } = await import("../admin-api-client");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const MB = 1024 * 1024;
const ENCODED_BYTES = 420_000;

afterEach(() => {
  vi.unstubAllGlobals();
  signedUploads.length = 0;
});

/** Source decodes at `source` (EXIF-applied); any WebP decodes at the size the canvas was given. */
function stubBrowserImageApis(source: { width: number; height: number }, encodedBytes = ENCODED_BYTES) {
  let lastCanvas: { width: number; height: number } | null = null;
  const drawCalls: unknown[][] = [];
  const bitmapOptions: unknown[] = [];
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (blob: Blob, options?: unknown) => {
      bitmapOptions.push(options);
      const size = blob.type === "image/webp" && lastCanvas !== null ? lastCanvas : source;
      return { ...size, close: vi.fn() };
    }),
  );
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {
        lastCanvas = { width, height };
      }
      getContext() {
        return {
          imageSmoothingEnabled: false,
          imageSmoothingQuality: "low",
          drawImage: (...args: unknown[]) => drawCalls.push(args),
        };
      }
      async convertToBlob({ type }: { type: string; quality: number }) {
        return new Blob([new Uint8Array(encodedBytes)], { type });
      }
    },
  );
  return { drawCalls, bitmapOptions };
}

function stubFetch() {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url, body });
    const payload = url.endsWith("media/upload-intent")
      ? { bucket: "project-media", storagePath: `${PROJECT_ID}/abc`, token: "signed-token" }
      : { media: { id: "m1", mediaType: body.mediaType } };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}

describe("uploadProjectMedia with image optimization", () => {
  it("sends the optimized MIME/size to upload-intent, uploads the optimized File and finalizes its real dimensions", async () => {
    const { drawCalls, bitmapOptions } = stubBrowserImageApis({ width: 3024, height: 4032 });
    const calls = stubFetch();
    const original = new File([new Uint8Array(4.8 * MB)], "IMG_0420.JPG", { type: "image/jpeg" });

    await uploadProjectMedia(PROJECT_ID, "GALLERY", original, 7);

    expect(calls.map((call) => call.url)).toEqual([
      `/api/v2/internal/projects/${PROJECT_ID}/media/upload-intent`,
      `/api/v2/internal/projects/${PROJECT_ID}/media/finalize`,
    ]);
    expect(calls[0].body).toEqual({ mediaType: "GALLERY", mimeType: "image/webp", sizeBytes: ENCODED_BYTES });

    expect(signedUploads).toHaveLength(1);
    const uploaded = signedUploads[0].file;
    expect(uploaded).not.toBe(original);
    expect(uploaded.type).toBe("image/webp");
    expect(uploaded.size).toBe(ENCODED_BYTES);
    expect(uploaded.name).toBe("IMG_0420.webp");
    expect(signedUploads[0]).toMatchObject({ bucket: "project-media", storagePath: `${PROJECT_ID}/abc`, token: "signed-token" });

    // Portrait stays portrait: EXIF orientation applied on decode, 1200 × 1600 drawn and finalized.
    expect(bitmapOptions.every((options) => JSON.stringify(options) === '{"imageOrientation":"from-image"}')).toBe(true);
    expect(drawCalls[0].slice(1)).toEqual([0, 0, 1200, 1600]);
    expect(calls[1].body).toEqual({
      mediaType: "GALLERY",
      storagePath: `${PROJECT_ID}/abc`,
      altText: null,
      sortOrder: 7,
      width: 1200,
      height: 1600,
    });
  });

  it("uploads the original (and its own dimensions) when the WebP would be larger", async () => {
    stubBrowserImageApis({ width: 2000, height: 1500 }, 900_000);
    const calls = stubFetch();
    const original = new File([new Uint8Array(800_000)], "tight.jpg", { type: "image/jpeg" });

    await uploadProjectMedia(PROJECT_ID, "COVER", original, 0);

    expect(calls[0].body).toEqual({ mediaType: "COVER", mimeType: "image/jpeg", sizeBytes: 800_000 });
    expect(signedUploads[0].file).toBe(original);
    expect(calls[1].body).toMatchObject({ width: 2000, height: 1500 });
  });

  it("uploads the original unchanged when the browser cannot optimize (no createImageBitmap)", async () => {
    const calls = stubFetch();
    const original = new File([new Uint8Array(5 * MB)], "a.png", { type: "image/png" });

    await uploadProjectMedia(PROJECT_ID, "PHOTO_STORY", original, 2);

    expect(calls[0].body).toEqual({ mediaType: "PHOTO_STORY", mimeType: "image/png", sizeBytes: 5 * MB });
    expect(signedUploads[0].file).toBe(original);
    expect(calls[1].body).not.toHaveProperty("width");
  });

  it("never re-encodes a QR code: the original PNG and its dimensions are uploaded", async () => {
    const { drawCalls } = stubBrowserImageApis({ width: 2400, height: 2400 });
    const calls = stubFetch();
    const original = new File([new Uint8Array(3 * MB)], "qr.png", { type: "image/png" });

    await uploadProjectMedia(PROJECT_ID, "QR_GROOM", original, 0);

    expect(drawCalls).toHaveLength(0);
    expect(calls[0].body).toEqual({ mediaType: "QR_GROOM", mimeType: "image/png", sizeBytes: 3 * MB });
    expect(signedUploads[0].file).toBe(original);
    expect(calls[1].body).toMatchObject({ width: 2400, height: 2400 });
  });

  it("AUDIO workflow is unchanged: no decode, original file, no dimensions", async () => {
    stubBrowserImageApis({ width: 1, height: 1 });
    const calls = stubFetch();
    const original = new File([new Uint8Array(6 * MB)], "song.mp3", { type: "audio/mpeg" });

    await uploadProjectMedia(PROJECT_ID, "AUDIO", original, 0);

    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
    expect(calls[0].body).toEqual({ mediaType: "AUDIO", mimeType: "audio/mpeg", sizeBytes: 6 * MB });
    expect(signedUploads[0].file).toBe(original);
    expect(calls[1].body).toEqual({ mediaType: "AUDIO", storagePath: `${PROJECT_ID}/abc`, altText: null, sortOrder: 0 });
  });
});
