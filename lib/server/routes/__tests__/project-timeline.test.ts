import { describe, expect, it } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import type { ProjectTimelineGateway } from "../../project-timeline/project-timeline-gateway";
import type { ProjectTimelineItemRecord } from "../../project-timeline/project-timeline-types";
import type {
  ProjectTimelineItemInput,
  ProjectTimelineItemPatch,
  ProjectTimelineWriteGateway,
} from "../../project-timeline/project-timeline-write-gateway";
import {
  handleCreateProjectTimelineItemRequest,
  handleDeleteProjectTimelineItemRequest,
  handleListProjectTimelineRequest,
  handleUpdateProjectTimelineItemRequest,
} from "../project-timeline";

interface FakeClient {
  marker: string;
}

function authGateway(profile: { role: string; displayName: string } | null, userId: string | null = "staff-1"): StaffAuthGateway<FakeClient> {
  return {
    createClient: (token) => ({ marker: token }),
    getAuthenticatedUserId: async () => userId,
    getActiveStaffProfile: async () => profile,
  };
}

const STAFF = authGateway({ role: "STAFF", displayName: "Staff" });
const AUTH = "Bearer valid-token";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "99999999-9999-4999-8999-999999999999";
const ITEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function record(input: ProjectTimelineItemInput, id = ITEM_ID): ProjectTimelineItemRecord {
  return { id, projectId: PROJECT_ID, ...input, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
}

function writeGateway() {
  const calls: { kind: string; projectId: string; itemId?: string; input?: ProjectTimelineItemInput | ProjectTimelineItemPatch }[] = [];
  const gateway: ProjectTimelineWriteGateway<FakeClient> = {
    projectExists: async (_client, projectId) => projectId === PROJECT_ID,
    insertTimelineItem: async (_client, projectId, input) => {
      calls.push({ kind: "insert", projectId, input });
      return record(input);
    },
    updateTimelineItem: async (_client, projectId, itemId, patch) => {
      calls.push({ kind: "update", projectId, itemId, input: patch });
      return itemId === ITEM_ID ? record({ time: "09:00", label: "Lễ", sortOrder: 0, ...patch }) : null;
    },
    deleteTimelineItem: async (_client, projectId, itemId) => {
      calls.push({ kind: "delete", projectId, itemId });
      return itemId === ITEM_ID;
    },
  };
  return { gateway, calls };
}

const readGateway: ProjectTimelineGateway<FakeClient> = {
  listProjectTimelineItems: async () => [
    record({ time: "08:30", label: "Đón khách", sortOrder: 0 }),
    record({ time: "07:00", label: "Rước dâu", sortOrder: 1 }, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
  ],
};

const VALID = { time: "08:30", label: "Đón khách", sortOrder: 0 };

describe("timeline auth", () => {
  it("401 without a Bearer header and never reaches the gateway", async () => {
    const { gateway, calls } = writeGateway();
    const result = await handleCreateProjectTimelineItemRequest(null, PROJECT_ID, VALID, STAFF, gateway);
    expect(result.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("401 for a rejected token", async () => {
    const { gateway } = writeGateway();
    const result = await handleListProjectTimelineRequest(AUTH, PROJECT_ID, authGateway(null, null), gateway, readGateway);
    expect(result.status).toBe(401);
  });

  it("403 for an authenticated non-staff user, no write", async () => {
    const { gateway, calls } = writeGateway();
    const result = await handleDeleteProjectTimelineItemRequest(AUTH, PROJECT_ID, ITEM_ID, authGateway(null), gateway);
    expect(result.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});

describe("timeline project scoping", () => {
  it("400 for a non-UUID project id", async () => {
    const { gateway } = writeGateway();
    expect((await handleCreateProjectTimelineItemRequest(AUTH, "abc", VALID, STAFF, gateway)).status).toBe(400);
  });

  it("404 for an unknown project, no insert", async () => {
    const { gateway, calls } = writeGateway();
    const result = await handleCreateProjectTimelineItemRequest(AUTH, OTHER_PROJECT_ID, VALID, STAFF, gateway);
    expect(result.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("400 for a non-UUID item id", async () => {
    const { gateway } = writeGateway();
    expect((await handleUpdateProjectTimelineItemRequest(AUTH, PROJECT_ID, "1", { label: "x" }, STAFF, gateway)).status).toBe(400);
  });
});

describe("timeline list", () => {
  it("returns the gateway's staff order unchanged (never re-sorted by time)", async () => {
    const { gateway } = writeGateway();
    const result = await handleListProjectTimelineRequest(AUTH, PROJECT_ID, STAFF, gateway, readGateway);
    expect(result.status).toBe(200);
    expect("data" in result.body && result.body.data.map((item) => item.time)).toEqual(["08:30", "07:00"]);
  });
});

describe("timeline create", () => {
  it("201 and passes exactly time/label/sortOrder scoped to the URL project", async () => {
    const { gateway, calls } = writeGateway();
    const result = await handleCreateProjectTimelineItemRequest(AUTH, PROJECT_ID.toUpperCase(), { ...VALID, label: "  Đón khách  " }, STAFF, gateway);
    expect(result.status).toBe(201);
    expect(calls).toEqual([{ kind: "insert", projectId: PROJECT_ID, input: { time: "08:30", label: "Đón khách", sortOrder: 0 } }]);
  });

  it.each([
    ["HH:mm:ss", { ...VALID, time: "08:30:00" }],
    ["24:00", { ...VALID, time: "24:00" }],
    ["single-digit hour", { ...VALID, time: "8:30" }],
    ["blank label", { ...VALID, label: "   " }],
    ["label > 200", { ...VALID, label: "x".repeat(201) }],
    ["non-integer sortOrder", { ...VALID, sortOrder: 1.5 }],
    ["missing sortOrder", { time: "08:30", label: "Đón khách" }],
    ["unknown field projectId", { ...VALID, projectId: OTHER_PROJECT_ID }],
    ["array body", [VALID]],
  ])("400 for %s, no insert", async (_name, body) => {
    const { gateway, calls } = writeGateway();
    const result = await handleCreateProjectTimelineItemRequest(AUTH, PROJECT_ID, body, STAFF, gateway);
    expect(result.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("timeline update / delete", () => {
  it("PATCH sends only the provided keys (reorder = sortOrder only)", async () => {
    const { gateway, calls } = writeGateway();
    const result = await handleUpdateProjectTimelineItemRequest(AUTH, PROJECT_ID, ITEM_ID, { sortOrder: 3 }, STAFF, gateway);
    expect(result.status).toBe(200);
    expect(calls[0].input).toEqual({ sortOrder: 3 });
  });

  it("PATCH with an empty body is rejected", async () => {
    const { gateway } = writeGateway();
    expect((await handleUpdateProjectTimelineItemRequest(AUTH, PROJECT_ID, ITEM_ID, {}, STAFF, gateway)).status).toBe(400);
  });

  it("PATCH/DELETE of an item outside the project → 404", async () => {
    const { gateway } = writeGateway();
    const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    expect((await handleUpdateProjectTimelineItemRequest(AUTH, PROJECT_ID, other, { label: "x" }, STAFF, gateway)).status).toBe(404);
    expect((await handleDeleteProjectTimelineItemRequest(AUTH, PROJECT_ID, other, STAFF, gateway)).status).toBe(404);
  });

  it("DELETE → 200 { deleted: true }", async () => {
    const { gateway } = writeGateway();
    const result = await handleDeleteProjectTimelineItemRequest(AUTH, PROJECT_ID, ITEM_ID, STAFF, gateway);
    expect(result).toEqual({ status: 200, body: { deleted: true } });
  });

  it("an unexpected gateway failure is a generic 500", async () => {
    const { gateway } = writeGateway();
    gateway.insertTimelineItem = async () => {
      throw new Error("db detail");
    };
    const result = await handleCreateProjectTimelineItemRequest(AUTH, PROJECT_ID, VALID, STAFF, gateway);
    expect(result).toEqual({ status: 500, body: { error: "Internal server error" } });
  });
});
