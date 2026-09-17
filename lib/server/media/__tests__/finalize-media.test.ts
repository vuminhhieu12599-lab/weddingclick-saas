import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { finalizeMedia } from "../finalize-media";
import type { MediaGateway, StorageObjectInfo } from "../media-gateway";
import type { ProjectMediaRecord } from "../media-types";

interface FakeClient {
  marker: string;
}

const staff: StaffContext<FakeClient> = {
  userId: "staff-1",
  role: "STAFF",
  displayName: "Test Staff",
  supabase: { marker: "fake" },
};

const projectId = "11111111-1111-1111-1111-111111111111";
const uuid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const storagePath = `${projectId}/${uuid}`;

const validBody = { mediaType: "COVER", storagePath };

const validInfo: StorageObjectInfo = { sizeBytes: 1024, contentType: "image/jpeg" };

const insertedRecord: ProjectMediaRecord = {
  id: "media-1",
  projectId,
  mediaType: "COVER",
  storageBucket: "project-media",
  storagePath,
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  width: null,
  height: null,
  altText: null,
  sortOrder: 0,
  createdBy: staff.userId,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
};

function baseGateway(overrides?: Partial<MediaGateway<FakeClient>>): MediaGateway<FakeClient> {
  return {
    async projectExists() {
      return true;
    },
    async createSignedUploadPath() {
      throw new Error("should not be called");
    },
    async getStorageObjectInfo() {
      return validInfo;
    },
    async insertProjectMedia() {
      return { kind: "INSERTED", media: insertedRecord };
    },
    ...overrides,
  };
}

describe("finalizeMedia — project scoping", () => {
  it("rejects a malformed project id without touching the gateway", async () => {
    let touched = false;
    const gateway = baseGateway({
      async projectExists() {
        touched = true;
        return true;
      },
    });

    const error = await finalizeMedia("not-a-uuid", validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(touched).toBe(false);
  });

  it("returns NOT_FOUND when the project does not exist", async () => {
    const gateway = baseGateway({
      async projectExists() {
        return false;
      },
    });

    const error = await finalizeMedia(projectId, validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });
});

describe("finalizeMedia — Storage verification", () => {
  it("returns NOT_FOUND when the Storage object is missing", async () => {
    const gateway = baseGateway({
      async getStorageObjectInfo() {
        return null;
      },
    });

    const error = await finalizeMedia(projectId, validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("maps an actual MIME mismatch to INVARIANT", async () => {
    const gateway = baseGateway({
      async getStorageObjectInfo() {
        return { sizeBytes: 1024, contentType: "audio/mpeg" };
      },
    });

    const error = await finalizeMedia(projectId, validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("INVARIANT");
  });

  it("maps an actual size violation to INVARIANT", async () => {
    const gateway = baseGateway({
      async getStorageObjectInfo() {
        return { sizeBytes: 10 * 1024 * 1024 + 1, contentType: "image/jpeg" };
      },
    });

    const error = await finalizeMedia(projectId, validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("INVARIANT");
  });

  it("propagates an unexpected metadata-missing failure (plain Error, not ApiError)", async () => {
    const gateway = baseGateway({
      async getStorageObjectInfo() {
        throw new Error("Storage object metadata is missing size or content type");
      },
    });

    const error = await finalizeMedia(projectId, validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});

describe("finalizeMedia — successful insert", () => {
  it("inserts with server-owned fields and returns the record", async () => {
    let received: Parameters<MediaGateway<FakeClient>["insertProjectMedia"]>[1] | undefined;
    const gateway = baseGateway({
      async insertProjectMedia(_client, row) {
        received = row;
        return { kind: "INSERTED", media: insertedRecord };
      },
    });

    const result = await finalizeMedia(projectId, validBody, staff, gateway);

    expect(result).toEqual({ media: insertedRecord });
    expect(received).toEqual({
      projectId,
      mediaType: "COVER",
      storagePath,
      mimeType: validInfo.contentType,
      sizeBytes: validInfo.sizeBytes,
      altText: null,
      sortOrder: 0,
      createdBy: staff.userId,
    });
  });

  it("uses Storage-reported mimeType/sizeBytes, never anything from the request body", async () => {
    let received: Parameters<MediaGateway<FakeClient>["insertProjectMedia"]>[1] | undefined;
    const gateway = baseGateway({
      async getStorageObjectInfo() {
        return { sizeBytes: 2048, contentType: "image/png" };
      },
      async insertProjectMedia(_client, row) {
        received = row;
        return { kind: "INSERTED", media: insertedRecord };
      },
    });

    await finalizeMedia(
      projectId,
      { mediaType: "COVER", storagePath, altText: "hello", sortOrder: 3 },
      staff,
      gateway,
    );

    expect(received?.mimeType).toBe("image/png");
    expect(received?.sizeBytes).toBe(2048);
    expect(received?.altText).toBe("hello");
    expect(received?.sortOrder).toBe(3);
  });

  it("width/height are never part of the insert row (always server-owned null in the repository)", async () => {
    let received: Parameters<MediaGateway<FakeClient>["insertProjectMedia"]>[1] | undefined;
    const gateway = baseGateway({
      async insertProjectMedia(_client, row) {
        received = row;
        return { kind: "INSERTED", media: insertedRecord };
      },
    });

    await finalizeMedia(projectId, validBody, staff, gateway);

    expect(received).not.toHaveProperty("width");
    expect(received).not.toHaveProperty("height");
  });

  it("createdBy is always staff.userId, derived only from the authenticated staff context", async () => {
    let received: Parameters<MediaGateway<FakeClient>["insertProjectMedia"]>[1] | undefined;
    const gateway = baseGateway({
      async insertProjectMedia(_client, row) {
        received = row;
        return { kind: "INSERTED", media: insertedRecord };
      },
    });

    await finalizeMedia(projectId, validBody, staff, gateway);

    expect(received?.createdBy).toBe(staff.userId);
  });

  it("a client-supplied createdBy field is rejected outright as unknown, never silently overridden", async () => {
    const gateway = baseGateway({
      async insertProjectMedia() {
        throw new Error("should not be called");
      },
    });

    const error = await finalizeMedia(
      projectId,
      { ...validBody, createdBy: "someone-else" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });
});

describe("finalizeMedia — No-Cleanup Rule (Finding 2)", () => {
  it("DUPLICATE maps to CONFLICT", async () => {
    const gateway = baseGateway({
      async insertProjectMedia() {
        return { kind: "DUPLICATE" };
      },
    });

    const error = await finalizeMedia(projectId, validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("CONFLICT");
  });

  it("AMBIGUOUS_FAILURE maps to INTERNAL", async () => {
    const gateway = baseGateway({
      async insertProjectMedia() {
        return { kind: "AMBIGUOUS_FAILURE" };
      },
    });

    const error = await finalizeMedia(projectId, validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("INTERNAL");
  });

  it("OTHER_FAILURE maps to INTERNAL", async () => {
    const gateway = baseGateway({
      async insertProjectMedia() {
        return { kind: "OTHER_FAILURE" };
      },
    });

    const error = await finalizeMedia(projectId, validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("INTERNAL");
  });

  it("no Storage-removal capability exists on the gateway at all — DUPLICATE/AMBIGUOUS_FAILURE/OTHER_FAILURE cannot call one", async () => {
    // The gateway interface no longer declares removeStorageObject or
    // findProjectMediaByStoragePath (Finding 2) — baseGateway() below is
    // typed against the current MediaGateway<FakeClient> shape, so this
    // test would fail to compile if either method were reintroduced.
    for (const kind of ["DUPLICATE", "AMBIGUOUS_FAILURE", "OTHER_FAILURE"] as const) {
      const gateway = baseGateway({
        async insertProjectMedia() {
          return { kind };
        },
      });
      expect(gateway).not.toHaveProperty("removeStorageObject");
      expect(gateway).not.toHaveProperty("findProjectMediaByStoragePath");

      const error = await finalizeMedia(projectId, validBody, staff, gateway).catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
    }
  });
});
