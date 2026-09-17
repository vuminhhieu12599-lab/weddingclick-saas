import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { listProjectMedia } from "../list-project-media";
import type { MediaGateway } from "../media-gateway";
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

const record: ProjectMediaRecord = {
  id: "media-1",
  projectId,
  mediaType: "COVER",
  storageBucket: "project-media",
  storagePath: `${projectId}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
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

function unusedGatewayMethods(): Pick<
  MediaGateway<FakeClient>,
  | "createSignedUploadPath"
  | "getStorageObjectInfo"
  | "insertProjectMedia"
  | "updateProjectMedia"
  | "deleteProjectMedia"
  | "removeMediaStorageObject"
> {
  return {
    async createSignedUploadPath() {
      throw new Error("should not be called");
    },
    async getStorageObjectInfo() {
      throw new Error("should not be called");
    },
    async insertProjectMedia() {
      throw new Error("should not be called");
    },
    async updateProjectMedia() {
      throw new Error("should not be called");
    },
    async deleteProjectMedia() {
      throw new Error("should not be called");
    },
    async removeMediaStorageObject() {
      throw new Error("should not be called");
    },
  };
}

describe("listProjectMedia", () => {
  it("rejects a malformed project id without touching the gateway", async () => {
    let touched = false;
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        touched = true;
        return true;
      },
      async listProjectMedia() {
        touched = true;
        return [];
      },
    };

    const error = await listProjectMedia("not-a-uuid", staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(touched).toBe(false);
  });

  it("returns NOT_FOUND when the project does not exist, without listing", async () => {
    let listCalled = false;
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return false;
      },
      async listProjectMedia() {
        listCalled = true;
        return [];
      },
    };

    const error = await listProjectMedia(projectId, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
    expect(listCalled).toBe(false);
  });

  it("returns an empty array for a project with no media", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async listProjectMedia() {
        return [];
      },
    };

    const result = await listProjectMedia(projectId, staff, gateway);

    expect(result).toEqual([]);
  });

  it("returns whatever the gateway provides, unmodified", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async listProjectMedia() {
        return [record];
      },
    };

    const result = await listProjectMedia(projectId, staff, gateway);

    expect(result).toEqual([record]);
  });
});
