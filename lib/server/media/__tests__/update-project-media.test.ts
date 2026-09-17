import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { MediaGateway } from "../media-gateway";
import type { ProjectMediaRecord } from "../media-types";
import { updateProjectMedia } from "../update-project-media";

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

const record: ProjectMediaRecord = {
  id: mediaId,
  projectId,
  mediaType: "COVER",
  storageBucket: "project-media",
  storagePath: `${projectId}/${mediaId}`,
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  width: null,
  height: null,
  altText: "hello",
  sortOrder: 3,
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
      throw new Error("should not be called");
    },
    async insertProjectMedia() {
      throw new Error("should not be called");
    },
    async listProjectMedia() {
      throw new Error("should not be called");
    },
    async updateProjectMedia() {
      return { kind: "UPDATED", media: record };
    },
    async deleteProjectMedia() {
      throw new Error("should not be called");
    },
    async removeMediaStorageObject() {
      throw new Error("should not be called");
    },
    ...overrides,
  };
}

describe("updateProjectMedia — id scoping", () => {
  it("rejects a malformed project id without touching the gateway", async () => {
    let touched = false;
    const gateway = baseGateway({
      async projectExists() {
        touched = true;
        return true;
      },
    });

    const error = await updateProjectMedia(
      "not-a-uuid",
      mediaId,
      { altText: "x" },
      staff,
      gateway,
    ).catch((e) => e);

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

    const error = await updateProjectMedia(
      projectId,
      "not-a-uuid",
      { altText: "x" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(touched).toBe(false);
  });

  it("returns NOT_FOUND when the project does not exist, without validating the body or updating", async () => {
    let updateCalled = false;
    const gateway = baseGateway({
      async projectExists() {
        return false;
      },
      async updateProjectMedia() {
        updateCalled = true;
        return { kind: "UPDATED", media: record };
      },
    });

    // Deliberately an invalid body (unknown field) — project-missing must
    // still win, proving project existence is checked before body shape.
    const error = await updateProjectMedia(
      projectId,
      mediaId,
      { notAField: true },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
    expect(updateCalled).toBe(false);
  });

  it("maps a gateway NOT_FOUND outcome (wrong-project or nonexistent media) to 'Media not found'", async () => {
    const gateway = baseGateway({
      async updateProjectMedia() {
        return { kind: "NOT_FOUND" };
      },
    });

    const error = await updateProjectMedia(
      projectId,
      mediaId,
      { altText: "x" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
    expect((error as ApiError).message).toBe("Media not found");
  });
});

describe("updateProjectMedia — validation", () => {
  it("rejects an unknown field as BAD_REQUEST without calling the gateway's update", async () => {
    let updateCalled = false;
    const gateway = baseGateway({
      async updateProjectMedia() {
        updateCalled = true;
        return { kind: "UPDATED", media: record };
      },
    });

    const error = await updateProjectMedia(
      projectId,
      mediaId,
      { mediaType: "GALLERY" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(updateCalled).toBe(false);
  });

  it("rejects an empty patch as BAD_REQUEST without calling the gateway's update", async () => {
    let updateCalled = false;
    const gateway = baseGateway({
      async updateProjectMedia() {
        updateCalled = true;
        return { kind: "UPDATED", media: record };
      },
    });

    const error = await updateProjectMedia(projectId, mediaId, {}, staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(updateCalled).toBe(false);
  });
});

describe("updateProjectMedia — partial-update forwarding", () => {
  it("forwards only altText when only altText is provided", async () => {
    let receivedPatch: unknown;
    const gateway = baseGateway({
      async updateProjectMedia(_client, _projectId, _mediaId, patch) {
        receivedPatch = patch;
        return { kind: "UPDATED", media: record };
      },
    });

    await updateProjectMedia(projectId, mediaId, { altText: "only alt" }, staff, gateway);

    expect(receivedPatch).toEqual({ altText: "only alt" });
    expect(receivedPatch).not.toHaveProperty("sortOrder");
  });

  it("forwards only sortOrder when only sortOrder is provided", async () => {
    let receivedPatch: unknown;
    const gateway = baseGateway({
      async updateProjectMedia(_client, _projectId, _mediaId, patch) {
        receivedPatch = patch;
        return { kind: "UPDATED", media: record };
      },
    });

    await updateProjectMedia(projectId, mediaId, { sortOrder: 9 }, staff, gateway);

    expect(receivedPatch).toEqual({ sortOrder: 9 });
    expect(receivedPatch).not.toHaveProperty("altText");
  });

  it("forwards both fields when both are provided", async () => {
    let receivedPatch: unknown;
    const gateway = baseGateway({
      async updateProjectMedia(_client, _projectId, _mediaId, patch) {
        receivedPatch = patch;
        return { kind: "UPDATED", media: record };
      },
    });

    await updateProjectMedia(projectId, mediaId, { altText: "x", sortOrder: 1 }, staff, gateway);

    expect(receivedPatch).toEqual({ altText: "x", sortOrder: 1 });
  });

  it("scopes the gateway call by both projectId and mediaId", async () => {
    let receivedProjectId: string | undefined;
    let receivedMediaId: string | undefined;
    const gateway = baseGateway({
      async updateProjectMedia(_client, projId, medId) {
        receivedProjectId = projId;
        receivedMediaId = medId;
        return { kind: "UPDATED", media: record };
      },
    });

    await updateProjectMedia(projectId, mediaId, { altText: "x" }, staff, gateway);

    expect(receivedProjectId).toBe(projectId);
    expect(receivedMediaId).toBe(mediaId);
  });

  it("issues the update unconditionally even for a same-value patch (no pre-read/compare)", async () => {
    let updateCallCount = 0;
    const gateway = baseGateway({
      async updateProjectMedia() {
        updateCallCount += 1;
        return { kind: "UPDATED", media: record };
      },
    });

    // record.altText/sortOrder already equal these values — this must
    // still issue the UPDATE (no gateway.projectExists-style read-compare
    // step exists in this use case at all).
    await updateProjectMedia(
      projectId,
      mediaId,
      { altText: record.altText, sortOrder: record.sortOrder },
      staff,
      gateway,
    );

    expect(updateCallCount).toBe(1);
  });

  it("returns { media } on success", async () => {
    const gateway = baseGateway();

    const result = await updateProjectMedia(projectId, mediaId, { altText: "x" }, staff, gateway);

    expect(result).toEqual({ media: record });
  });
});
