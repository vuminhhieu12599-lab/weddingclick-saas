import { describe, expect, it } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import type { ProjectDressCodeGateway } from "../../project-dress-code/project-dress-code-gateway";
import type { ProjectDressCodeSwatchRecord } from "../../project-dress-code/project-dress-code-types";
import type { ProjectDressCodeWriteGateway } from "../../project-dress-code/project-dress-code-write-gateway";
import {
  handleCreateDressCodeSwatchRequest,
  handleDeleteDressCodeSwatchRequest,
  handleGetProjectDressCodeRequest,
  handleSaveProjectDressCodeRequest,
  handleUpdateDressCodeSwatchRequest,
} from "../project-dress-code";

interface FakeClient {
  marker: string;
}

function authGateway(profile: { role: string; displayName: string } | null): StaffAuthGateway<FakeClient> {
  return {
    createClient: (token) => ({ marker: token }),
    getAuthenticatedUserId: async () => "staff-1",
    getActiveStaffProfile: async () => profile,
  };
}

const STAFF = authGateway({ role: "STAFF", displayName: "Staff" });
const AUTH = "Bearer valid-token";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SWATCH_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TS = "2026-10-01T00:00:00Z";

function swatch(color: string, sortOrder: number): ProjectDressCodeSwatchRecord {
  return { id: SWATCH_ID, projectId: PROJECT_ID, color, sortOrder, createdAt: TS, updatedAt: TS };
}

function writeGateway(options: { hasDressCode?: boolean } = {}) {
  const calls: { kind: string; value: unknown }[] = [];
  const gateway: ProjectDressCodeWriteGateway<FakeClient> = {
    projectExists: async (_client, projectId) => projectId === PROJECT_ID,
    upsertDressCode: async (_client, projectId, description) => {
      calls.push({ kind: "upsert", value: { projectId, description } });
      return { projectId, description, createdAt: TS, updatedAt: TS };
    },
    insertSwatch: async (_client, projectId, input) => {
      calls.push({ kind: "insert", value: { projectId, ...input } });
      return options.hasDressCode === false ? null : swatch(input.color, input.sortOrder);
    },
    updateSwatch: async (_client, _projectId, swatchId, patch) => {
      calls.push({ kind: "update", value: patch });
      return swatchId === SWATCH_ID ? swatch(patch.color ?? "#ffffff", patch.sortOrder ?? 0) : null;
    },
    deleteSwatch: async (_client, _projectId, swatchId) => {
      calls.push({ kind: "delete", value: swatchId });
      return swatchId === SWATCH_ID;
    },
  };
  return { gateway, calls };
}

const emptyRead: ProjectDressCodeGateway<FakeClient> = { getProjectDressCode: async () => null };

describe("dress code read", () => {
  it("no Dress Code → data: null (no default description or colours)", async () => {
    const { gateway } = writeGateway();
    const result = await handleGetProjectDressCodeRequest(AUTH, PROJECT_ID, STAFF, gateway, emptyRead);
    expect(result).toEqual({ status: 200, body: { data: null } });
  });

  it("403 for non-staff", async () => {
    const { gateway } = writeGateway();
    expect((await handleGetProjectDressCodeRequest(AUTH, PROJECT_ID, authGateway(null), gateway, emptyRead)).status).toBe(403);
  });
});

describe("dress code description", () => {
  it("persists the trimmed explicit description", async () => {
    const { gateway, calls } = writeGateway();
    const result = await handleSaveProjectDressCodeRequest(AUTH, PROJECT_ID, { description: "  Tông pastel  " }, STAFF, gateway);
    expect(result.status).toBe(200);
    expect(calls).toEqual([{ kind: "upsert", value: { projectId: PROJECT_ID, description: "Tông pastel" } }]);
  });

  it("blank or null description is stored as null", async () => {
    const { gateway, calls } = writeGateway();
    await handleSaveProjectDressCodeRequest(AUTH, PROJECT_ID, { description: "   " }, STAFF, gateway);
    await handleSaveProjectDressCodeRequest(AUTH, PROJECT_ID, { description: null }, STAFF, gateway);
    expect(calls.map((call) => (call.value as { description: unknown }).description)).toEqual([null, null]);
  });

  it.each([
    ["missing key", {}],
    ["number", { description: 5 }],
    ["> 1000 chars", { description: "x".repeat(1001) }],
    ["unknown field", { description: null, swatches: ["#ffffff"] }],
  ])("400 for %s, no write", async (_name, body) => {
    const { gateway, calls } = writeGateway();
    expect((await handleSaveProjectDressCodeRequest(AUTH, PROJECT_ID, body, STAFF, gateway)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("401 without Authorization, no write", async () => {
    const { gateway, calls } = writeGateway();
    expect((await handleSaveProjectDressCodeRequest(null, PROJECT_ID, { description: null }, STAFF, gateway)).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

describe("dress code swatches", () => {
  it("201 with a strict lowercase hex colour and explicit sortOrder", async () => {
    const { gateway, calls } = writeGateway();
    const result = await handleCreateDressCodeSwatchRequest(AUTH, PROJECT_ID, { color: "#a1b2c3", sortOrder: 2 }, STAFF, gateway);
    expect(result.status).toBe(201);
    expect(calls[0].value).toEqual({ projectId: PROJECT_ID, color: "#a1b2c3", sortOrder: 2 });
  });

  it.each(["#A1B2C3", "#fff", "red", "a1b2c3", "#a1b2c3ff", "rgb(1,2,3)", "url(x)", "var(--x)"])(
    "400 for colour %j (never normalized server-side)",
    async (color) => {
      const { gateway, calls } = writeGateway();
      expect((await handleCreateDressCodeSwatchRequest(AUTH, PROJECT_ID, { color, sortOrder: 0 }, STAFF, gateway)).status).toBe(400);
      expect(calls).toHaveLength(0);
    },
  );

  it("409 when the Project has no Dress Code row yet", async () => {
    const { gateway } = writeGateway({ hasDressCode: false });
    expect((await handleCreateDressCodeSwatchRequest(AUTH, PROJECT_ID, { color: "#ffffff", sortOrder: 0 }, STAFF, gateway)).status).toBe(409);
  });

  it("PATCH reorder sends sortOrder only; uppercase colour rejected", async () => {
    const { gateway, calls } = writeGateway();
    expect((await handleUpdateDressCodeSwatchRequest(AUTH, PROJECT_ID, SWATCH_ID, { sortOrder: 1 }, STAFF, gateway)).status).toBe(200);
    expect(calls[0].value).toEqual({ sortOrder: 1 });
    expect((await handleUpdateDressCodeSwatchRequest(AUTH, PROJECT_ID, SWATCH_ID, { color: "#FFFFFF" }, STAFF, gateway)).status).toBe(400);
  });

  it("PATCH/DELETE of a swatch outside the project → 404; DELETE ok → 200", async () => {
    const { gateway } = writeGateway();
    const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    expect((await handleUpdateDressCodeSwatchRequest(AUTH, PROJECT_ID, other, { sortOrder: 1 }, STAFF, gateway)).status).toBe(404);
    expect((await handleDeleteDressCodeSwatchRequest(AUTH, PROJECT_ID, other, STAFF, gateway)).status).toBe(404);
    expect(await handleDeleteDressCodeSwatchRequest(AUTH, PROJECT_ID, SWATCH_ID, STAFF, gateway)).toEqual({
      status: 200,
      body: { deleted: true },
    });
  });

  it("unknown project → 404 with no write", async () => {
    const { gateway, calls } = writeGateway();
    const unknown = "99999999-9999-4999-8999-999999999999";
    expect((await handleCreateDressCodeSwatchRequest(AUTH, unknown, { color: "#ffffff", sortOrder: 0 }, STAFF, gateway)).status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});
