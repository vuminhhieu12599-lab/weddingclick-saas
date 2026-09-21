import { describe, expect, it } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import type { TemplatesGateway } from "../../templates/templates-gateway";
import type { RawTemplateCatalogRow } from "../../templates/templates-types";
import { handleListTemplatesRequest } from "../templates";

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

function createFakeGateway(rows: RawTemplateCatalogRow[]): TemplatesGateway<FakeClient> {
  return {
    async listTemplatesWithVersions() {
      return rows;
    },
  };
}

const sampleRow: RawTemplateCatalogRow = {
  id: "33333333-3333-3333-3333-333333333333",
  code: "elegant-editorial",
  eventType: "WEDDING",
  name: "Elegant Editorial",
  description: null,
  isActive: true,
  sortOrder: 1,
  previewMediaPath: null,
  versions: [
    {
      id: "22222222-2222-2222-2222-222222222222",
      versionNumber: 1,
      rendererKey: "wedding.elegant-editorial.v1",
      manifest: {
        schemaVersion: 1,
        palettes: ["ivory-champagne"],
        fontPresets: ["editorial-classic"],
        effectPresets: ["NONE"],
        sectionSettingsSchema: {},
        designSettingsSchema: {},
      },
      retiredAt: null,
    },
  ],
};

describe("handleListTemplatesRequest", () => {
  it("returns 200 with the catalog on success", async () => {
    const result = await handleListTemplatesRequest(
      "Bearer good-token",
      activeStaffAuth,
      createFakeGateway([sampleRow]),
    );

    expect(result.status).toBe(200);
    expect((result.body as { data: unknown[] }).data).toHaveLength(1);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleListTemplatesRequest(null, activeStaffAuth, createFakeGateway([]));

    expect(result.status).toBe(401);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const result = await handleListTemplatesRequest(
      "Bearer token",
      nonStaffAuth,
      createFakeGateway([]),
    );

    expect(result.status).toBe(403);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("maps an unexpected failure (e.g. malformed manifest) to a generic 500 without leaking details", async () => {
    const gateway: TemplatesGateway<FakeClient> = {
      async listTemplatesWithVersions() {
        throw new Error("Template version design manifest is malformed");
      },
    };

    const result = await handleListTemplatesRequest("Bearer good-token", activeStaffAuth, gateway);

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });
});
