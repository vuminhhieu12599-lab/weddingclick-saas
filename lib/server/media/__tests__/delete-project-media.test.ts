import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { deleteProjectMedia } from "../delete-project-media";
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
const mediaId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const storagePath = `${projectId}/${mediaId}`;

function baseGateway(overrides?: Partial<MediaGateway<FakeClient>>): MediaGateway<FakeClient> {
  return {
    async projectExists() {
      return true;
    },
    async createSignedUploadPath() {
      throw new Error("should not be called");
    },
    async getStorageObjectInfo() {
      throw new Error("should not be called");
    },
    async insertProjectMedia() {
      throw new Error("should not be called");
    },
    async listProjectMedia() {
      throw new Error("should not be called");
    },
    async updateProjectMedia() {
      throw new Error("should not be called");
    },
    async deleteProjectMedia() {
      return { kind: "DELETED", storageBucket: "project-media", storagePath };
    },
    async removeMediaStorageObject() {
      return true;
    },
    ...overrides,
  };
}

describe("deleteProjectMedia — id scoping / validation", () => {
  it("rejects a malformed project id without touching the gateway", async () => {
    let touched = false;
    const gateway = baseGateway({
      async projectExists() {
        touched = true;
        return true;
      },
    });

    const error = await deleteProjectMedia("not-a-uuid", mediaId, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(touched).toBe(false);
  });

  it("rejects a malformed media id without touching the gateway", async () => {
    let touched = false;
    const gateway = baseGateway({
      async projectExists() {
        touched = true;
        return true;
      },
    });

    const error = await deleteProjectMedia(projectId, "not-a-uuid", staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(touched).toBe(false);
  });

  it("returns NOT_FOUND when the project does not exist, without deleting", async () => {
    let deleteCalled = false;
    const gateway = baseGateway({
      async projectExists() {
        return false;
      },
      async deleteProjectMedia() {
        deleteCalled = true;
        return { kind: "DELETED", storageBucket: "project-media", storagePath };
      },
    });

    const error = await deleteProjectMedia(projectId, mediaId, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
    expect(deleteCalled).toBe(false);
  });

  it("scopes the gateway delete call by both projectId and mediaId", async () => {
    let receivedProjectId: string | undefined;
    let receivedMediaId: string | undefined;
    const gateway = baseGateway({
      async deleteProjectMedia(_client, projId, medId) {
        receivedProjectId = projId;
        receivedMediaId = medId;
        return { kind: "DELETED", storageBucket: "project-media", storagePath };
      },
    });

    await deleteProjectMedia(projectId, mediaId, staff, gateway);

    expect(receivedProjectId).toBe(projectId);
    expect(receivedMediaId).toBe(mediaId);
  });
});

describe("deleteProjectMedia — outcome classification", () => {
  it("NOT_FOUND (wrong-project or nonexistent media) -> ApiError NOT_FOUND, never touches Storage", async () => {
    let storageCalled = false;
    const gateway = baseGateway({
      async deleteProjectMedia() {
        return { kind: "NOT_FOUND" };
      },
      async removeMediaStorageObject() {
        storageCalled = true;
        return true;
      },
    });

    const error = await deleteProjectMedia(projectId, mediaId, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
    expect((error as ApiError).message).toBe("Media not found");
    expect(storageCalled).toBe(false);
  });

  it("REFERENCED_CONFLICT -> ApiError CONFLICT, never touches Storage", async () => {
    let storageCalled = false;
    const gateway = baseGateway({
      async deleteProjectMedia() {
        return { kind: "REFERENCED_CONFLICT" };
      },
      async removeMediaStorageObject() {
        storageCalled = true;
        return true;
      },
    });

    const error = await deleteProjectMedia(projectId, mediaId, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("CONFLICT");
    expect(storageCalled).toBe(false);
  });

  it("OTHER_FAILURE -> ApiError INTERNAL, never touches Storage", async () => {
    let storageCalled = false;
    const gateway = baseGateway({
      async deleteProjectMedia() {
        return { kind: "OTHER_FAILURE" };
      },
      async removeMediaStorageObject() {
        storageCalled = true;
        return true;
      },
    });

    const error = await deleteProjectMedia(projectId, mediaId, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("INTERNAL");
    expect(storageCalled).toBe(false);
  });
});

describe("deleteProjectMedia — Storage cleanup after confirmed DB delete", () => {
  it("calls removeMediaStorageObject with the exact path returned by DELETE, after DB delete", async () => {
    const callOrder: string[] = [];
    let receivedPath: string | undefined;
    const gateway = baseGateway({
      async deleteProjectMedia() {
        callOrder.push("db-delete");
        return { kind: "DELETED", storageBucket: "project-media", storagePath };
      },
      async removeMediaStorageObject(_client, path) {
        callOrder.push("storage-remove");
        receivedPath = path;
        return true;
      },
    });

    const result = await deleteProjectMedia(projectId, mediaId, staff, gateway);

    expect(result).toEqual({ deleted: true });
    expect(receivedPath).toBe(storagePath);
    expect(callOrder).toEqual(["db-delete", "storage-remove"]);
  });

  it("Storage removal reporting failure (false) still returns { deleted: true }", async () => {
    const gateway = baseGateway({
      async removeMediaStorageObject() {
        return false;
      },
    });

    const result = await deleteProjectMedia(projectId, mediaId, staff, gateway);

    expect(result).toEqual({ deleted: true });
  });

  it("Storage removal throwing still returns { deleted: true }, never reinserts or compensates", async () => {
    const gateway = baseGateway({
      async removeMediaStorageObject() {
        throw new Error("network failure talking to Storage");
      },
    });

    const result = await deleteProjectMedia(projectId, mediaId, staff, gateway);

    expect(result).toEqual({ deleted: true });
  });

  it("an unexpected non-project-media bucket on the deleted row skips Storage removal entirely, still returns { deleted: true }", async () => {
    let storageCalled = false;
    const gateway = baseGateway({
      async deleteProjectMedia() {
        return { kind: "DELETED", storageBucket: "some-other-bucket", storagePath };
      },
      async removeMediaStorageObject() {
        storageCalled = true;
        return true;
      },
    });

    const result = await deleteProjectMedia(projectId, mediaId, staff, gateway);

    expect(result).toEqual({ deleted: true });
    expect(storageCalled).toBe(false);
  });
});
