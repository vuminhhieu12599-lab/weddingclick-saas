import { describe, expect, it } from "vitest";

import {
  AUDIO_MEDIA_MAX_BYTES,
  IMAGE_MEDIA_MAX_BYTES,
  type MediaType,
} from "../../../domain";
import { ApiError } from "../../errors/api-error";
import { validateUploadIntentInput } from "../validate-upload-intent-input";

const IMAGE_MEDIA_TYPES: MediaType[] = ["COVER", "GALLERY", "QR_GROOM", "QR_BRIDE", "QR_COMMON"];

function expectBadRequest(body: unknown) {
  const error = (() => {
    try {
      validateUploadIntentInput(body);
      return undefined;
    } catch (e) {
      return e;
    }
  })();
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).kind).toBe("BAD_REQUEST");
}

describe("validateUploadIntentInput — unknown/forbidden fields", () => {
  it.each(["projectId", "storageBucket", "storagePath", "createdBy", "id"])(
    'rejects "%s" as an unknown field',
    (field) => {
      expectBadRequest({ mediaType: "COVER", mimeType: "image/jpeg", sizeBytes: 100, [field]: "x" });
    },
  );

  it("rejects a non-object body", () => {
    expectBadRequest("not-an-object");
    expectBadRequest(null);
    expectBadRequest([]);
  });
});

describe("validateUploadIntentInput — every valid MediaType", () => {
  it.each(IMAGE_MEDIA_TYPES)("%s accepts image/jpeg within the 10 MiB image limit", (mediaType) => {
    const result = validateUploadIntentInput({
      mediaType,
      mimeType: "image/jpeg",
      sizeBytes: 1024,
    });
    expect(result).toEqual({ mediaType, mimeType: "image/jpeg", sizeBytes: 1024 });
  });

  it("AUDIO accepts audio/mpeg within the 20 MiB audio limit", () => {
    const result = validateUploadIntentInput({
      mediaType: "AUDIO",
      mimeType: "audio/mpeg",
      sizeBytes: 1024,
    });
    expect(result).toEqual({ mediaType: "AUDIO", mimeType: "audio/mpeg", sizeBytes: 1024 });
  });
});

describe("validateUploadIntentInput — MIME vs MediaType enforcement", () => {
  it("rejects audio/mpeg for an image MediaType", () => {
    expectBadRequest({ mediaType: "COVER", mimeType: "audio/mpeg", sizeBytes: 100 });
  });

  it("rejects image/jpeg for AUDIO", () => {
    expectBadRequest({ mediaType: "AUDIO", mimeType: "image/jpeg", sizeBytes: 100 });
  });

  it("rejects an unsupported MIME type entirely (e.g. image/svg+xml)", () => {
    expectBadRequest({ mediaType: "COVER", mimeType: "image/svg+xml", sizeBytes: 100 });
  });

  it("rejects an invalid mediaType", () => {
    expectBadRequest({ mediaType: "BANNER", mimeType: "image/jpeg", sizeBytes: 100 });
  });
});

describe("validateUploadIntentInput — sizeBytes boundaries", () => {
  it("rejects 0", () => {
    expectBadRequest({ mediaType: "COVER", mimeType: "image/jpeg", sizeBytes: 0 });
  });

  it("rejects a negative size", () => {
    expectBadRequest({ mediaType: "COVER", mimeType: "image/jpeg", sizeBytes: -1 });
  });

  it("rejects a non-integer size", () => {
    expectBadRequest({ mediaType: "COVER", mimeType: "image/jpeg", sizeBytes: 100.5 });
  });

  it("accepts exactly the image limit (10 MiB)", () => {
    const result = validateUploadIntentInput({
      mediaType: "COVER",
      mimeType: "image/jpeg",
      sizeBytes: IMAGE_MEDIA_MAX_BYTES,
    });
    expect(result.sizeBytes).toBe(IMAGE_MEDIA_MAX_BYTES);
  });

  it("rejects one byte over the image limit", () => {
    expectBadRequest({
      mediaType: "COVER",
      mimeType: "image/jpeg",
      sizeBytes: IMAGE_MEDIA_MAX_BYTES + 1,
    });
  });

  it("accepts exactly the audio limit (20 MiB)", () => {
    const result = validateUploadIntentInput({
      mediaType: "AUDIO",
      mimeType: "audio/mpeg",
      sizeBytes: AUDIO_MEDIA_MAX_BYTES,
    });
    expect(result.sizeBytes).toBe(AUDIO_MEDIA_MAX_BYTES);
  });

  it("rejects one byte over the audio limit", () => {
    expectBadRequest({
      mediaType: "AUDIO",
      mimeType: "audio/mpeg",
      sizeBytes: AUDIO_MEDIA_MAX_BYTES + 1,
    });
  });
});

describe("validateUploadIntentInput — required fields", () => {
  it("rejects a missing mediaType", () => {
    expectBadRequest({ mimeType: "image/jpeg", sizeBytes: 100 });
  });

  it("rejects a missing mimeType", () => {
    expectBadRequest({ mediaType: "COVER", sizeBytes: 100 });
  });

  it("rejects a missing sizeBytes", () => {
    expectBadRequest({ mediaType: "COVER", mimeType: "image/jpeg" });
  });
});
