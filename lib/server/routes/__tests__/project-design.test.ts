import { describe, expect, it } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { ProjectDesignGateway } from "../../project-design/project-design-gateway";
import type { ProjectDesignRecord } from "../../project-design/project-design-types";
import { handleGetProjectDesignRequest, handleSaveProjectDesignRequest } from "../project-design";

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

const nonStaffAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

const existingProjectId = "11111111-1111-1111-1111-111111111111";

const existingRecord: ProjectDesignRecord = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  projectId: existingProjectId,
  templateVersionId: "22222222-2222-2222-2222-222222222222",
  paletteKey: "ivory-champagne",
  fontPresetKey: "editorial-classic",
  effectPresetKey: "NONE",
  sectionSettings: {},
  designSettings: {},
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
};

function createFakeGateway(options?: {
  projectExists?: boolean;
  design?: ProjectDesignRecord | null;
  saveResult?: ProjectDesignGateway<FakeClient>["upsertProjectDesign"];
}): ProjectDesignGateway<FakeClient> {
  return {
    async getProjectForDesign() {
      return options?.projectExists === false
        ? null
        : { id: existingProjectId, eventType: "WEDDING" };
    },
    async getCurrentProjectDesign() {
      return options?.design ?? null;
    },
    async getTemplateVersionForDesign() {
      return {
        id: "22222222-2222-2222-2222-222222222222",
        templateId: "33333333-3333-3333-3333-333333333333",
        manifest: {
          schemaVersion: 1,
          palettes: ["ivory-champagne"],
          fontPresets: ["editorial-classic"],
          effectPresets: ["NONE"],
          sectionSettingsSchema: {},
          designSettingsSchema: {},
        },
        retiredAt: null,
      };
    },
    async getTemplateForDesign() {
      return { id: "33333333-3333-3333-3333-333333333333", eventType: "WEDDING", isActive: true };
    },
    async upsertProjectDesign(...args) {
      if (options?.saveResult) {
        return options.saveResult(...args);
      }
      return existingRecord;
    },
  };
}

const validPutBody = {
  templateVersionId: "22222222-2222-2222-2222-222222222222",
  paletteKey: "ivory-champagne",
  fontPresetKey: "editorial-classic",
  effectPresetKey: "NONE",
  sectionSettings: {},
  designSettings: {},
};

describe("handleGetProjectDesignRequest", () => {
  it("returns 200 with data when a design exists", async () => {
    const result = await handleGetProjectDesignRequest(
      "Bearer good-token",
      existingProjectId,
      activeStaffAuth,
      createFakeGateway({ projectExists: true, design: existingRecord }),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: existingRecord });
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("returns 200 with data: null when the project exists but has no design yet", async () => {
    const result = await handleGetProjectDesignRequest(
      "Bearer good-token",
      existingProjectId,
      activeStaffAuth,
      createFakeGateway({ projectExists: true, design: null }),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: null });
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("returns 404 when the project does not exist", async () => {
    const result = await handleGetProjectDesignRequest(
      "Bearer good-token",
      existingProjectId,
      activeStaffAuth,
      createFakeGateway({ projectExists: false }),
    );

    expect(result.status).toBe(404);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("returns 400 for a malformed project id", async () => {
    const result = await handleGetProjectDesignRequest(
      "Bearer good-token",
      "not-a-uuid",
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleGetProjectDesignRequest(
      null,
      existingProjectId,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const result = await handleGetProjectDesignRequest(
      "Bearer token",
      existingProjectId,
      nonStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(403);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });
});

describe("handleSaveProjectDesignRequest — auth/body ordering", () => {
  it("returns 401 for a missing Authorization header without invoking the body reader", async () => {
    let called = false;
    const readBody = async () => {
      called = true;
      throw new Error("malformed json");
    };

    const result = await handleSaveProjectDesignRequest(
      null,
      existingProjectId,
      readBody,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
    expect(called).toBe(false);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("returns 401 for a wrong Authorization scheme without invoking the body reader", async () => {
    let called = false;
    const readBody = async () => {
      called = true;
      throw new Error("malformed json");
    };

    const result = await handleSaveProjectDesignRequest(
      "Basic dXNlcjpwYXNz",
      existingProjectId,
      readBody,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
    expect(called).toBe(false);
  });

  it("returns 401 for an invalid/expired staff token without invoking the body reader", async () => {
    let called = false;
    const readBody = async () => {
      called = true;
      throw new Error("malformed json");
    };

    const invalidTokenAuth = createFakeAuthGateway({ userId: null });

    const result = await handleSaveProjectDesignRequest(
      "Bearer bad-token",
      existingProjectId,
      readBody,
      invalidTokenAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
    expect(called).toBe(false);
  });

  it("returns 403 for a non-staff caller without invoking the body reader", async () => {
    let called = false;
    const readBody = async () => {
      called = true;
      throw new Error("malformed json");
    };

    const result = await handleSaveProjectDesignRequest(
      "Bearer token",
      existingProjectId,
      readBody,
      nonStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(403);
    expect(called).toBe(false);
  });

  it("returns 400 for an active staff caller with a malformed JSON body", async () => {
    const readBody = async () => {
      throw new SyntaxError("Unexpected token");
    };

    const result = await handleSaveProjectDesignRequest(
      "Bearer good-token",
      existingProjectId,
      readBody,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Request body must be valid JSON" });
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });
});

describe("handleSaveProjectDesignRequest", () => {
  it("returns 200 with the saved record on success", async () => {
    const result = await handleSaveProjectDesignRequest(
      "Bearer good-token",
      existingProjectId,
      async () => validPutBody,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: existingRecord });
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("propagates a 422 INVARIANT from the use case", async () => {
    const gateway = createFakeGateway({
      saveResult: async () => {
        throw new ApiError("INVARIANT", "Selected template version is not available for new selection");
      },
    });

    const result = await handleSaveProjectDesignRequest(
      "Bearer good-token",
      existingProjectId,
      async () => validPutBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(422);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("maps an unexpected failure to a generic 500 without leaking details", async () => {
    const gateway = createFakeGateway({
      saveResult: async () => {
        throw new Error("relation \"public.project_design\" internal constraint detail");
      },
    });

    const result = await handleSaveProjectDesignRequest(
      "Bearer good-token",
      existingProjectId,
      async () => validPutBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("returns 400 for an unknown top-level field without calling the gateway", async () => {
    let called = false;
    const gateway = createFakeGateway({
      saveResult: async () => {
        called = true;
        return existingRecord;
      },
    });

    const result = await handleSaveProjectDesignRequest(
      "Bearer good-token",
      existingProjectId,
      async () => ({ ...validPutBody, isActive: true }),
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(400);
    expect(called).toBe(false);
  });
});
