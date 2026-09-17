import { describe, expect, it } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { MediaGateway } from "../../media/media-gateway";
import type { ProjectMediaRecord } from "../../media/media-types";
import {
  handleCreateMediaUploadIntentRequest,
  handleDeleteProjectMediaRequest,
  handleFinalizeMediaRequest,
  handleListProjectMediaRequest,
  handleUpdateProjectMediaRequest,
} from "../project-media";

interface FakeClient {
  marker: string;
}

function createFakeAuthGateway(options: {
  userId?: string | null;
  profile?: { role: string; displayName: string } | null;
}): StaffAuthGateway<FakeClient> {
  return {
    createClient: (accessToken) => ({ marker: `client-for-${accessToken}` }),
    async getAuthenticatedUserId() {
      return options.userId ?? null;
    },
    async getActiveStaffProfile() {
      return options.profile ?? null;
    },
  };
}

const activeStaffAuth = createFakeAuthGateway({
  userId: "staff-1",
  profile: { role: "STAFF", displayName: "Test Staff" },
});

const projectId = "11111111-1111-1111-1111-111111111111";
const storagePath = `${projectId}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;

const mediaId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const record: ProjectMediaRecord = {
  id: mediaId,
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
  createdBy: "staff-1",
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
};

function unusedGatewayMethods(): Pick<
  MediaGateway<FakeClient>,
  | "createSignedUploadPath"
  | "getStorageObjectInfo"
  | "insertProjectMedia"
  | "listProjectMedia"
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
    async listProjectMedia() {
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

describe("handleCreateMediaUploadIntentRequest", () => {
  it("returns 401 for a missing bearer token", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
    };

    const result = await handleCreateMediaUploadIntentRequest(
      null,
      projectId,
      { mediaType: "COVER", mimeType: "image/jpeg", sizeBytes: 1024 },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(401);
  });

  it("returns 401 for a malformed Authorization header", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
    };

    const result = await handleCreateMediaUploadIntentRequest(
      "not-a-bearer-header",
      projectId,
      { mediaType: "COVER", mimeType: "image/jpeg", sizeBytes: 1024 },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(401);
  });

  it("returns 200 with bucket/storagePath/token on success", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async createSignedUploadPath() {
        return { token: "tok-1" };
      },
    };

    const result = await handleCreateMediaUploadIntentRequest(
      "Bearer valid-token",
      projectId,
      { mediaType: "COVER", mimeType: "image/jpeg", sizeBytes: 1024 },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ bucket: "project-media", token: "tok-1" });
    expect(result.body).not.toHaveProperty("signedUrl");
  });

  it("maps a BAD_REQUEST ApiError to 400", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
    };

    const result = await handleCreateMediaUploadIntentRequest(
      "Bearer valid-token",
      "not-a-uuid",
      { mediaType: "COVER", mimeType: "image/jpeg", sizeBytes: 1024 },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(400);
  });

  it("maps NOT_FOUND to 404", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return false;
      },
    };

    const result = await handleCreateMediaUploadIntentRequest(
      "Bearer valid-token",
      projectId,
      { mediaType: "COVER", mimeType: "image/jpeg", sizeBytes: 1024 },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(404);
  });

  it("maps an unrecognized thrown Error to 500 without leaking its message", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async createSignedUploadPath() {
        throw new Error("raw supabase storage internals");
      },
    };

    const result = await handleCreateMediaUploadIntentRequest(
      "Bearer valid-token",
      projectId,
      { mediaType: "COVER", mimeType: "image/jpeg", sizeBytes: 1024 },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toMatch(/raw supabase storage internals/);
  });
});

describe("handleFinalizeMediaRequest", () => {
  function fullGateway(overrides?: Partial<MediaGateway<FakeClient>>): MediaGateway<FakeClient> {
    return {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async getStorageObjectInfo() {
        return { sizeBytes: 1024, contentType: "image/jpeg" };
      },
      async insertProjectMedia() {
        return { kind: "INSERTED", media: record };
      },
      ...overrides,
    };
  }

  it("returns 401 for a missing bearer token", async () => {
    const result = await handleFinalizeMediaRequest(
      null,
      projectId,
      { mediaType: "COVER", storagePath },
      activeStaffAuth,
      fullGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 201 with { media } on success", async () => {
    const result = await handleFinalizeMediaRequest(
      "Bearer valid-token",
      projectId,
      { mediaType: "COVER", storagePath },
      activeStaffAuth,
      fullGateway(),
    );

    expect(result.status).toBe(201);
    expect(result.body).toEqual({ media: record });
  });

  it("maps CONFLICT (duplicate finalize) to 409", async () => {
    const result = await handleFinalizeMediaRequest(
      "Bearer valid-token",
      projectId,
      { mediaType: "COVER", storagePath },
      activeStaffAuth,
      fullGateway({
        async insertProjectMedia() {
          return { kind: "DUPLICATE" };
        },
      }),
    );

    expect(result.status).toBe(409);
  });

  it("maps INVARIANT (actual MIME mismatch) to 422", async () => {
    const result = await handleFinalizeMediaRequest(
      "Bearer valid-token",
      projectId,
      { mediaType: "COVER", storagePath },
      activeStaffAuth,
      fullGateway({
        async getStorageObjectInfo() {
          return { sizeBytes: 1024, contentType: "audio/mpeg" };
        },
      }),
    );

    expect(result.status).toBe(422);
  });

  it("maps a missing Storage object to 404", async () => {
    const result = await handleFinalizeMediaRequest(
      "Bearer valid-token",
      projectId,
      { mediaType: "COVER", storagePath },
      activeStaffAuth,
      fullGateway({
        async getStorageObjectInfo() {
          return null;
        },
      }),
    );

    expect(result.status).toBe(404);
  });

  it("propagates a StaffAuthError FORBIDDEN as 403", async () => {
    const inactiveStaffAuth = createFakeAuthGateway({ userId: "staff-1", profile: null });

    const result = await handleFinalizeMediaRequest(
      "Bearer valid-token",
      projectId,
      { mediaType: "COVER", storagePath },
      inactiveStaffAuth,
      fullGateway(),
    );

    expect(result.status).toBe(403);
  });
});

// Exercised only to guarantee the ApiError kind/status table stays wired
// end-to-end for this route module, mirroring routes/project-events.ts.
describe("ApiError kind -> HTTP status mapping used by this route", () => {
  it.each([
    ["BAD_REQUEST", 400],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["INVARIANT", 422],
  ] as const)("%s maps to %d", async (kind, status) => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        throw new ApiError(kind, "boom");
      },
    };

    const result = await handleCreateMediaUploadIntentRequest(
      "Bearer valid-token",
      projectId,
      { mediaType: "COVER", mimeType: "image/jpeg", sizeBytes: 1024 },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(status);
  });
});

describe("handleListProjectMediaRequest (Task 024 Phase 3)", () => {
  it("returns 401 for a missing bearer token", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async listProjectMedia() {
        return [];
      },
    };

    const result = await handleListProjectMediaRequest(null, projectId, activeStaffAuth, gateway);

    expect(result.status).toBe(401);
  });

  it("returns 200 with { data: [] } for a project with no media", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async listProjectMedia() {
        return [];
      },
    };

    const result = await handleListProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: [] });
  });

  it("returns 200 with { data: [record] } on success", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async listProjectMedia() {
        return [record];
      },
    };

    const result = await handleListProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: [record] });
  });

  it("maps a malformed project id to 400", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async listProjectMedia() {
        return [];
      },
    };

    const result = await handleListProjectMediaRequest(
      "Bearer valid-token",
      "not-a-uuid",
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(400);
  });

  it("maps a missing project to 404", async () => {
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return false;
      },
      async listProjectMedia() {
        return [];
      },
    };

    const result = await handleListProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(404);
  });

  it("propagates a StaffAuthError FORBIDDEN as 403", async () => {
    const inactiveStaffAuth = createFakeAuthGateway({ userId: "staff-1", profile: null });
    const gateway: MediaGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async listProjectMedia() {
        return [];
      },
    };

    const result = await handleListProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      inactiveStaffAuth,
      gateway,
    );

    expect(result.status).toBe(403);
  });
});

describe("handleUpdateProjectMediaRequest (Task 024 Phase 3)", () => {
  function fullGateway(overrides?: Partial<MediaGateway<FakeClient>>): MediaGateway<FakeClient> {
    return {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
      },
      async updateProjectMedia() {
        return { kind: "UPDATED", media: record };
      },
      ...overrides,
    };
  }

  it("returns 401 for a missing bearer token", async () => {
    const result = await handleUpdateProjectMediaRequest(
      null,
      projectId,
      record.id,
      { altText: "x" },
      activeStaffAuth,
      fullGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 200 with { media } on success", async () => {
    const result = await handleUpdateProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      record.id,
      { altText: "x" },
      activeStaffAuth,
      fullGateway(),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ media: record });
  });

  it("maps a malformed media id to 400", async () => {
    const result = await handleUpdateProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      "not-a-uuid",
      { altText: "x" },
      activeStaffAuth,
      fullGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("maps an unknown field to 400", async () => {
    const result = await handleUpdateProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      record.id,
      { mediaType: "GALLERY" },
      activeStaffAuth,
      fullGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("maps an empty patch to 400", async () => {
    const result = await handleUpdateProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      record.id,
      {},
      activeStaffAuth,
      fullGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("maps a missing project to 404", async () => {
    const result = await handleUpdateProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      record.id,
      { altText: "x" },
      activeStaffAuth,
      fullGateway({
        async projectExists() {
          return false;
        },
      }),
    );

    expect(result.status).toBe(404);
  });

  it("maps a wrong-project/nonexistent media id to 404 with the same message", async () => {
    const result = await handleUpdateProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      record.id,
      { altText: "x" },
      activeStaffAuth,
      fullGateway({
        async updateProjectMedia() {
          return { kind: "NOT_FOUND" };
        },
      }),
    );

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "Media not found" });
  });

  it("propagates a StaffAuthError FORBIDDEN as 403", async () => {
    const inactiveStaffAuth = createFakeAuthGateway({ userId: "staff-1", profile: null });

    const result = await handleUpdateProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      record.id,
      { altText: "x" },
      inactiveStaffAuth,
      fullGateway(),
    );

    expect(result.status).toBe(403);
  });
});

describe("handleDeleteProjectMediaRequest (Task 024 Phase 3)", () => {
  function fullGateway(overrides?: Partial<MediaGateway<FakeClient>>): MediaGateway<FakeClient> {
    return {
      ...unusedGatewayMethods(),
      async projectExists() {
        return true;
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

  it("returns 401 for a missing bearer token", async () => {
    const result = await handleDeleteProjectMediaRequest(
      null,
      projectId,
      record.id,
      activeStaffAuth,
      fullGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 200 with { deleted: true } on success", async () => {
    const result = await handleDeleteProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      record.id,
      activeStaffAuth,
      fullGateway(),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ deleted: true });
  });

  it("returns 200 with { deleted: true } even when Storage removal fails", async () => {
    const result = await handleDeleteProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      record.id,
      activeStaffAuth,
      fullGateway({
        async removeMediaStorageObject() {
          return false;
        },
      }),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ deleted: true });
  });

  it("maps a malformed media id to 400", async () => {
    const result = await handleDeleteProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      "not-a-uuid",
      activeStaffAuth,
      fullGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("maps a missing project to 404", async () => {
    const result = await handleDeleteProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      record.id,
      activeStaffAuth,
      fullGateway({
        async projectExists() {
          return false;
        },
      }),
    );

    expect(result.status).toBe(404);
  });

  it("maps a wrong-project/nonexistent media id to 404", async () => {
    const result = await handleDeleteProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      record.id,
      activeStaffAuth,
      fullGateway({
        async deleteProjectMedia() {
          return { kind: "NOT_FOUND" };
        },
      }),
    );

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "Media not found" });
  });

  it("maps a referenced-media conflict to 409", async () => {
    const result = await handleDeleteProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      record.id,
      activeStaffAuth,
      fullGateway({
        async deleteProjectMedia() {
          return { kind: "REFERENCED_CONFLICT" };
        },
      }),
    );

    expect(result.status).toBe(409);
  });

  it("maps an unexpected DB failure to 500", async () => {
    const result = await handleDeleteProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      record.id,
      activeStaffAuth,
      fullGateway({
        async deleteProjectMedia() {
          return { kind: "OTHER_FAILURE" };
        },
      }),
    );

    expect(result.status).toBe(500);
  });

  it("propagates a StaffAuthError FORBIDDEN as 403", async () => {
    const inactiveStaffAuth = createFakeAuthGateway({ userId: "staff-1", profile: null });

    const result = await handleDeleteProjectMediaRequest(
      "Bearer valid-token",
      projectId,
      record.id,
      inactiveStaffAuth,
      fullGateway(),
    );

    expect(result.status).toBe(403);
  });
});
