import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { createUploadIntent } from "../create-upload-intent";
import type { MediaGateway } from "../media-gateway";

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

const validBody = { mediaType: "COVER", mimeType: "image/jpeg", sizeBytes: 1024 };

function unusedGatewayMethods(): Pick<
  MediaGateway<FakeClient>,
  "getStorageObjectInfo" | "insertProjectMedia"
> {
  return {
    async getStorageObjectInfo() {
      throw new Error("should not be called");
    },
    async insertProjectMedia() {
      throw new Error("should not be called");
    },
  };
}

describe("createUploadIntent", () => {
  it("rejects a malformed project id without calling the gateway at all", async () => {
    let called = false;
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        called = true;
        return true;
      },
      async createSignedUploadPath() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await createUploadIntent("not-a-uuid", validBody, staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("returns NOT_FOUND when the project does not exist, without generating a path", async () => {
    let signedUploadCalled = false;
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return false;
      },
      async createSignedUploadPath() {
        signedUploadCalled = true;
        throw new Error("should not be called");
      },
    };

    const error = await createUploadIntent(projectId, validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
    expect(signedUploadCalled).toBe(false);
  });

  it("rejects an invalid body without calling createSignedUploadPath", async () => {
    let signedUploadCalled = false;
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async createSignedUploadPath() {
        signedUploadCalled = true;
        throw new Error("should not be called");
      },
    };

    const error = await createUploadIntent(
      projectId,
      { mediaType: "COVER", mimeType: "audio/mpeg", sizeBytes: 1024 },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(signedUploadCalled).toBe(false);
  });

  it("generates a project-scoped path and returns bucket/storagePath/token", async () => {
    let receivedPath: string | undefined;
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async createSignedUploadPath(_client, storagePath) {
        receivedPath = storagePath;
        return { token: "signed-token" };
      },
    };

    const result = await createUploadIntent(projectId, validBody, staff, gateway);

    expect(result).toEqual({
      bucket: "project-media",
      storagePath: receivedPath,
      token: "signed-token",
    });
    expect(receivedPath?.startsWith(`${projectId}/`)).toBe(true);
    expect(result).not.toHaveProperty("signedUrl");
  });

  it("canonicalizes an uppercase project id to lowercase before generating the path", async () => {
    let receivedPath: string | undefined;
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async createSignedUploadPath(_client, storagePath) {
        receivedPath = storagePath;
        return { token: "signed-token" };
      },
    };

    await createUploadIntent(projectId.toUpperCase(), validBody, staff, gateway);

    expect(receivedPath?.startsWith(`${projectId}/`)).toBe(true);
  });

  it("repeated calls yield distinct storage paths", async () => {
    const paths: string[] = [];
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async createSignedUploadPath(_client, storagePath) {
        paths.push(storagePath);
        return { token: "signed-token" };
      },
    };

    await createUploadIntent(projectId, validBody, staff, gateway);
    await createUploadIntent(projectId, validBody, staff, gateway);

    expect(paths).toHaveLength(2);
    expect(paths[0]).not.toBe(paths[1]);
  });

  it("propagates a gateway signed-upload failure as INTERNAL (via a plain Error)", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async createSignedUploadPath() {
        throw new Error("Failed to create signed upload URL");
      },
    };

    const error = await createUploadIntent(projectId, validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});
