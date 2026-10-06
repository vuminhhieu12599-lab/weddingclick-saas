import { describe, expect, it } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import type { ProjectTaskInput, ProjectTaskPatch, ProjectTaskRecord } from "../../project-tasks/project-task-types";
import type { ProjectTasksGateway } from "../../project-tasks/project-tasks-gateway";
import {
  handleCreateProjectTaskRequest,
  handleDeleteProjectTaskRequest,
  handleListProjectTasksRequest,
  handleUpdateProjectTaskRequest,
} from "../project-tasks";

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
const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTIVE_STAFF_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INACTIVE_STAFF_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function record(overrides: Partial<ProjectTaskRecord> = {}): ProjectTaskRecord {
  return {
    id: TASK_ID,
    projectId: PROJECT_ID,
    title: "Gửi bản review",
    status: "TODO",
    dueAt: null,
    assignedStaffId: null,
    assignedStaffDisplayName: null,
    sortOrder: 0,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

type Call = { kind: string; projectId?: string; taskId?: string; input?: ProjectTaskInput | ProjectTaskPatch; staffId?: string };

/** Fake gateway: only TASK_ID exists, and only inside PROJECT_ID. */
function gateway(options: { throwOnList?: boolean } = {}) {
  const calls: Call[] = [];
  const g: ProjectTasksGateway<FakeClient> = {
    projectExists: async (_c, projectId) => projectId === PROJECT_ID || projectId === OTHER_PROJECT_ID,
    listProjectTasks: async (_c, projectId) => {
      calls.push({ kind: "list", projectId });
      if (options.throwOnList) throw new Error('relation "project_tasks" secret detail');
      return projectId === PROJECT_ID ? [record()] : [];
    },
    insertProjectTask: async (_c, projectId, input) => {
      calls.push({ kind: "insert", projectId, input });
      return record({ title: input.title, dueAt: input.dueAt, assignedStaffId: input.assignedStaffId });
    },
    updateProjectTask: async (_c, projectId, taskId, patch) => {
      calls.push({ kind: "update", projectId, taskId, input: patch });
      return projectId === PROJECT_ID && taskId === TASK_ID ? record({ ...patch }) : null;
    },
    deleteProjectTask: async (_c, projectId, taskId) => {
      calls.push({ kind: "delete", projectId, taskId });
      return projectId === PROJECT_ID && taskId === TASK_ID;
    },
    isActiveStaffProfile: async (_c, staffId) => {
      calls.push({ kind: "staff", staffId });
      return staffId === ACTIVE_STAFF_ID;
    },
    listAssignableStaff: async () => [{ id: ACTIVE_STAFF_ID, displayName: "Lan" }],
  };
  return { g, calls };
}

function create(body: unknown) {
  const { g, calls } = gateway();
  return handleCreateProjectTaskRequest(AUTH, PROJECT_ID, body, STAFF, g).then((result) => ({ result, calls }));
}

describe("project tasks auth", () => {
  it("401 without a Bearer header and never reaches the gateway", async () => {
    const { g, calls } = gateway();
    const result = await handleCreateProjectTaskRequest(null, PROJECT_ID, { title: "A" }, STAFF, g);
    expect(result.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("403 for an authenticated non-staff caller", async () => {
    const { g, calls } = gateway();
    const result = await handleListProjectTasksRequest(AUTH, PROJECT_ID, authGateway(null), g);
    expect(result.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});

describe("list", () => {
  it("lists only the route Project's tasks", async () => {
    const { g, calls } = gateway();
    const result = await handleListProjectTasksRequest(AUTH, PROJECT_ID, STAFF, g);
    expect(result).toEqual({ status: 200, body: { data: [record()] } });
    expect(calls).toEqual([{ kind: "list", projectId: PROJECT_ID }]);
  });

  it("Project B's list never includes Project A's tasks", async () => {
    const { g, calls } = gateway();
    const result = await handleListProjectTasksRequest(AUTH, OTHER_PROJECT_ID, STAFF, g);
    expect(result).toEqual({ status: 200, body: { data: [] } });
    expect(calls).toEqual([{ kind: "list", projectId: OTHER_PROJECT_ID }]);
  });

  it("404 for an unknown Project; 400 for a malformed id", async () => {
    const { g } = gateway();
    expect((await handleListProjectTasksRequest(AUTH, "22222222-2222-4222-8222-222222222222", STAFF, g)).status).toBe(404);
    expect((await handleListProjectTasksRequest(AUTH, "not-a-uuid", STAFF, g)).status).toBe(400);
  });

  it("500 with a fixed body and no DB detail", async () => {
    const { g } = gateway({ throwOnList: true });
    const result = await handleListProjectTasksRequest(AUTH, PROJECT_ID, STAFF, g);
    expect(result).toEqual({ status: 500, body: { error: "Internal server error" } });
  });
});

describe("create", () => {
  it("trims the title, defaults due/assignee to null and never sends a status (DB default TODO)", async () => {
    const { result, calls } = await create({ title: "  Chuẩn bị ảnh cưới  " });
    expect(result.status).toBe(201);
    expect(calls).toEqual([{ kind: "insert", projectId: PROJECT_ID, input: { title: "Chuẩn bị ảnh cưới", dueAt: null, assignedStaffId: null } }]);
    expect((result.body as { data: ProjectTaskRecord }).data.status).toBe("TODO");
  });

  it("rejects a blank title", async () => {
    const { result, calls } = await create({ title: "   " });
    expect(result.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("counts the 200-character limit in code points", async () => {
    expect((await create({ title: "😀".repeat(200) })).result.status).toBe(201);
    expect((await create({ title: "a".repeat(201) })).result.status).toBe(400);
  });

  it("accepts a valid TIMESTAMPTZ due date and explicit null", async () => {
    const { calls } = await create({ title: "A", dueAt: "2026-10-10T02:00:00.000Z" });
    expect(calls[0].input).toMatchObject({ dueAt: "2026-10-10T02:00:00.000Z" });
    expect((await create({ title: "A", dueAt: null })).result.status).toBe(201);
  });

  it("rejects date-only, offsetless, impossible and non-string due dates", async () => {
    for (const dueAt of ["2026-10-10", "2026-10-10T09:00:00", "2026-02-30T09:00:00Z", 1760000000]) {
      const { result, calls } = await create({ title: "A", dueAt });
      expect(result.status).toBe(400);
      expect(calls).toHaveLength(0);
    }
  });

  it("assigns an active staff profile", async () => {
    const { result, calls } = await create({ title: "A", assignedStaffId: ACTIVE_STAFF_ID });
    expect(result.status).toBe(201);
    expect(calls.map((c) => c.kind)).toEqual(["staff", "insert"]);
  });

  it("rejects an inactive/unknown staff id with 404 and a malformed one with 400 — nothing written", async () => {
    const unknown = await create({ title: "A", assignedStaffId: INACTIVE_STAFF_ID });
    expect(unknown.result.status).toBe(404);
    expect(unknown.calls.some((c) => c.kind === "insert")).toBe(false);
    const malformed = await create({ title: "A", assignedStaffId: "nope" });
    expect(malformed.result.status).toBe(400);
    expect(malformed.calls).toHaveLength(0);
  });

  it("rejects projectId/status/createdAt in the body (exact keys)", async () => {
    for (const extra of [{ projectId: OTHER_PROJECT_ID }, { status: "DONE" }, { createdAt: "2026-10-01T00:00:00Z" }]) {
      const { result, calls } = await create({ title: "A", ...extra });
      expect(result.status).toBe(400);
      expect(calls).toHaveLength(0);
    }
  });
});

describe("update", () => {
  function patch(body: unknown, projectId = PROJECT_ID, taskId = TASK_ID) {
    const { g, calls } = gateway();
    return handleUpdateProjectTaskRequest(AUTH, projectId, taskId, body, STAFF, g).then((result) => ({ result, calls }));
  }

  it("updates the title (trimmed), scoped by Project and task id", async () => {
    const { result, calls } = await patch({ title: " Gửi bản review 2 " });
    expect(result.status).toBe(200);
    expect(calls).toEqual([{ kind: "update", projectId: PROJECT_ID, taskId: TASK_ID, input: { title: "Gửi bản review 2" } }]);
  });

  it("accepts every status (TODO → IN_PROGRESS → DONE, CANCELLED) with no transition rules", async () => {
    for (const status of ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]) {
      const { result } = await patch({ status });
      expect(result.status).toBe(200);
      expect((result.body as { data: ProjectTaskRecord }).data.status).toBe(status);
    }
  });

  it("rejects an unknown or localized status", async () => {
    expect((await patch({ status: "BLOCKED" })).result.status).toBe(400);
    expect((await patch({ status: "Hoàn thành" })).result.status).toBe(400);
  });

  it("unassigns with null without a staff lookup", async () => {
    const { result, calls } = await patch({ assignedStaffId: null });
    expect(result.status).toBe(200);
    expect(calls.map((c) => c.kind)).toEqual(["update"]);
  });

  it("404 when the task belongs to another Project (no cross-Project oracle)", async () => {
    const { result, calls } = await patch({ title: "X" }, OTHER_PROJECT_ID);
    expect(result).toEqual({ status: 404, body: { error: "Task not found" } });
    expect(calls).toEqual([{ kind: "update", projectId: OTHER_PROJECT_ID, taskId: TASK_ID, input: { title: "X" } }]);
  });

  it("400 for an empty patch or a malformed task id", async () => {
    expect((await patch({})).result.status).toBe(400);
    const malformed = await patch({ title: "X" }, PROJECT_ID, "bad");
    expect(malformed.result.status).toBe(400);
    expect(malformed.calls).toHaveLength(0);
  });
});

describe("delete", () => {
  it("deletes a task of the route Project", async () => {
    const { g, calls } = gateway();
    const result = await handleDeleteProjectTaskRequest(AUTH, PROJECT_ID, TASK_ID, STAFF, g);
    expect(result).toEqual({ status: 200, body: { deleted: true } });
    expect(calls).toEqual([{ kind: "delete", projectId: PROJECT_ID, taskId: TASK_ID }]);
  });

  it("404 for a task id used against another Project", async () => {
    const { g } = gateway();
    const result = await handleDeleteProjectTaskRequest(AUTH, OTHER_PROJECT_ID, TASK_ID, STAFF, g);
    expect(result).toEqual({ status: 404, body: { error: "Task not found" } });
  });
});
