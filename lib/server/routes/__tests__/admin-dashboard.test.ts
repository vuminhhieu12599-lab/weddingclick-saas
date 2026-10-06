import { describe, expect, it } from "vitest";

import { PROJECT_STATUSES, type ProjectStatus, type ProjectTaskStatus } from "../../../domain";
import type { StaffAuthGateway } from "../../auth/staff-context";
import type { DashboardGateway } from "../../dashboard/dashboard-gateway";
import type { AdminDashboard, DashboardProjectFilter, InstantRange } from "../../dashboard/dashboard-types";
import { ATTENTION_LIST_LIMIT } from "../../dashboard/get-admin-dashboard";
import { handleGetAdminDashboardRequest } from "../admin-dashboard";

/** Task 034C: staff dashboard aggregation over canonical projects/project_tasks. */

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
const ADMIN = authGateway({ role: "ADMIN", displayName: "Admin" });
const AUTH = "Bearer valid-token";
const NOW = new Date("2026-10-06T05:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

interface P {
  id: string;
  status: ProjectStatus;
  deadlineAt?: string | null;
  completedAt?: string | null;
}
interface T {
  status: ProjectTaskStatus;
  projectId: string;
  dueAt?: string | null;
}

let seq = 0;
const pid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function inRange(value: string | null | undefined, range: InstantRange | undefined): boolean {
  if (!range) return true;
  if (value == null) return false;
  const v = Date.parse(value);
  return (
    (range.gte === undefined || v >= Date.parse(range.gte)) &&
    (range.lt === undefined || v < Date.parse(range.lt)) &&
    (range.lte === undefined || v <= Date.parse(range.lte))
  );
}

/** In-memory gateway applying the filters exactly as the SQL would. */
function gateway(projects: P[], tasks: T[] = [], options: { fail?: boolean } = {}) {
  const calls: string[] = [];
  const matches = (p: P, f: DashboardProjectFilter) =>
    (f.status === undefined || p.status === f.status) &&
    !(f.excludeStatuses ?? []).includes(p.status) &&
    inRange(p.deadlineAt, f.deadlineAt) &&
    inRange(p.completedAt, f.completedAt);
  const g: DashboardGateway<FakeClient> = {
    countProjects: async (_c, f) => {
      calls.push("countProjects");
      if (options.fail) throw new Error('relation "projects" secret detail');
      return projects.filter((p) => matches(p, f)).length;
    },
    countTasks: async (_c, f) => {
      calls.push("countTasks");
      return tasks.filter((t) => {
        const parent = projects.find((p) => p.id === t.projectId)!;
        return f.statuses.includes(t.status) && !f.excludeProjectStatuses.includes(parent.status) && inRange(t.dueAt, f.dueAt);
      }).length;
    },
    listDeadlineProjects: async (_c, f, limit) => {
      calls.push("listDeadlineProjects");
      return projects
        .filter((p) => matches(p, f))
        .sort((a, b) => Date.parse(a.deadlineAt!) - Date.parse(b.deadlineAt!) || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map((p) => ({ id: p.id, projectCode: `WC-${p.id.slice(-4)}`, status: p.status, deadlineAt: p.deadlineAt! }));
    },
  };
  return { g, calls };
}

async function dashboard(projects: P[], tasks: T[] = [], auth = STAFF): Promise<AdminDashboard> {
  const result = await handleGetAdminDashboardRequest(AUTH, auth, gateway(projects, tasks).g, NOW);
  expect(result.status).toBe(200);
  return (result.body as { data: AdminDashboard }).data;
}

const onePerStatus = (): P[] => PROJECT_STATUSES.map((status) => ({ id: pid(), status }));

describe("dashboard auth", () => {
  it("401 without/with an invalid credential, 403 for non-staff, never reaching the gateway", async () => {
    const { g, calls } = gateway([]);
    expect((await handleGetAdminDashboardRequest(null, STAFF, g, NOW)).status).toBe(401);
    expect((await handleGetAdminDashboardRequest(AUTH, authGateway(null, null), g, NOW)).status).toBe(401);
    expect((await handleGetAdminDashboardRequest(AUTH, authGateway(null), g, NOW)).status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("STAFF and ADMIN are both allowed", async () => {
    expect((await dashboard(onePerStatus(), [], STAFF)).projects.active).toBe(10);
    expect((await dashboard(onePerStatus(), [], ADMIN)).projects.active).toBe(10);
  });

  it("500 with a fixed body and no DB detail", async () => {
    const result = await handleGetAdminDashboardRequest(AUTH, STAFF, gateway([], [], { fail: true }).g, NOW);
    expect(result).toEqual({ status: 500, body: { error: "Internal server error" } });
  });
});

describe("project status groups", () => {
  it("exact counts for all 12 statuses; ACTIVE excludes only COMPLETED/ARCHIVED (PUBLISHED stays active)", async () => {
    const projects = [...onePerStatus(), { id: pid(), status: "PUBLISHED" as const }, { id: pid(), status: "NEW" as const }];
    const data = await dashboard(projects);
    expect(Object.keys(data.projects.byStatus)).toEqual([...PROJECT_STATUSES]);
    expect(data.projects.byStatus.PUBLISHED).toBe(2);
    expect(data.projects.byStatus.NEW).toBe(2);
    expect(data.projects.byStatus.ARCHIVED).toBe(1);
    expect(data.projects.active).toBe(12);
  });

  it("Cần xử lý is exactly the six staff-side statuses and Chờ khách exactly the three customer-side ones", async () => {
    const data = await dashboard(onePerStatus());
    expect(data.projects.staffAction).toBe(6);
    expect(data.projects.waitingForCustomer).toBe(3);
    for (const status of ["NEW", "IN_PROGRESS", "INTERNAL_REVIEW", "REVISION_REQUIRED", "APPROVED", "READY_TO_PUBLISH"] as const) {
      expect((await dashboard([{ id: pid(), status }])).projects.staffAction).toBe(1);
    }
    for (const status of ["WAITING_FOR_INFO", "CUSTOMER_REVIEW", "AWAITING_PAYMENT"] as const) {
      const d = await dashboard([{ id: pid(), status }]);
      expect([d.projects.waitingForCustomer, d.projects.staffAction]).toEqual([1, 0]);
    }
  });
});

describe("project deadlines", () => {
  it("overdue = deadline < now, excluding PUBLISHED/COMPLETED/ARCHIVED and null deadlines", async () => {
    const past = at(-DAY);
    const data = await dashboard([
      { id: pid(), status: "IN_PROGRESS", deadlineAt: past },
      { id: pid(), status: "AWAITING_PAYMENT", deadlineAt: at(-1) },
      { id: pid(), status: "PUBLISHED", deadlineAt: past },
      { id: pid(), status: "COMPLETED", deadlineAt: past },
      { id: pid(), status: "ARCHIVED", deadlineAt: past },
      { id: pid(), status: "NEW", deadlineAt: null },
    ]);
    expect(data.projects.overdue).toBe(2);
    expect(data.attention.every((p) => p.overdue)).toBe(true);
  });

  it("approaching = now through now + 7 days inclusive; overdue never double-counted", async () => {
    const data = await dashboard([
      { id: pid(), status: "NEW", deadlineAt: at(0) },
      { id: pid(), status: "NEW", deadlineAt: at(7 * DAY) },
      { id: pid(), status: "NEW", deadlineAt: at(7 * DAY + 1) },
      { id: pid(), status: "NEW", deadlineAt: at(-1) },
      { id: pid(), status: "PUBLISHED", deadlineAt: at(DAY) },
    ]);
    expect([data.projects.approaching, data.projects.overdue]).toEqual([2, 1]);
    expect(data.attention.filter((p) => !p.overdue)).toHaveLength(2);
  });

  it("attention list: overdue first, earliest deadline first, id tie-break, bounded", async () => {
    const tie = at(-2 * DAY);
    const a = { id: "00000000-0000-4000-8000-0000000000a2", status: "NEW" as const, deadlineAt: tie };
    const b = { id: "00000000-0000-4000-8000-0000000000a1", status: "NEW" as const, deadlineAt: tie };
    const soon = { id: pid(), status: "IN_PROGRESS" as const, deadlineAt: at(DAY) };
    const older = { id: pid(), status: "NEW" as const, deadlineAt: at(-5 * DAY) };
    const data = await dashboard([soon, a, b, older]);
    expect(data.attention.map((p) => [p.id, p.overdue])).toEqual([
      [older.id, true],
      [b.id, true],
      [a.id, true],
      [soon.id, false],
    ]);
    const many = Array.from({ length: 15 }, (_, i) => ({ id: pid(), status: "NEW" as const, deadlineAt: at(-(i + 1) * DAY) }));
    const bounded = await dashboard([...many, soon]);
    expect(bounded.attention).toHaveLength(ATTENTION_LIST_LIMIT);
    expect(bounded.projects.overdue).toBe(15);
  });

  it("recently completed = COMPLETED with completed_at in the rolling 30 days", async () => {
    const data = await dashboard([
      { id: pid(), status: "COMPLETED", completedAt: at(-30 * DAY) },
      { id: pid(), status: "COMPLETED", completedAt: at(-DAY) },
      { id: pid(), status: "COMPLETED", completedAt: at(-30 * DAY - 1) },
      { id: pid(), status: "COMPLETED", completedAt: null },
      { id: pid(), status: "ARCHIVED", completedAt: at(-DAY) },
    ]);
    expect(data.projects.recentlyCompleted).toBe(2);
  });
});

describe("task aggregation", () => {
  it("outstanding = TODO/IN_PROGRESS on non-closed Projects (PUBLISHED eligible)", async () => {
    const open = { id: pid(), status: "IN_PROGRESS" as const };
    const published = { id: pid(), status: "PUBLISHED" as const };
    const completed = { id: pid(), status: "COMPLETED" as const };
    const archived = { id: pid(), status: "ARCHIVED" as const };
    const data = await dashboard(
      [open, published, completed, archived],
      [
        { status: "TODO", projectId: open.id },
        { status: "IN_PROGRESS", projectId: published.id },
        { status: "DONE", projectId: open.id },
        { status: "CANCELLED", projectId: open.id },
        { status: "TODO", projectId: completed.id, dueAt: at(-DAY) },
        { status: "TODO", projectId: archived.id, dueAt: at(-DAY) },
      ],
    );
    expect(data.tasks).toEqual({ outstanding: 2, overdue: 0, upcoming: 0 });
  });

  it("overdue (< now) and upcoming (now..+7 days) tasks, no double count", async () => {
    const open = { id: pid(), status: "NEW" as const };
    const data = await dashboard(
      [open],
      [
        { status: "TODO", projectId: open.id, dueAt: at(-1) },
        { status: "IN_PROGRESS", projectId: open.id, dueAt: at(0) },
        { status: "TODO", projectId: open.id, dueAt: at(7 * DAY) },
        { status: "TODO", projectId: open.id, dueAt: at(7 * DAY + 1) },
        { status: "TODO", projectId: open.id, dueAt: null },
        { status: "DONE", projectId: open.id, dueAt: at(-DAY) },
      ],
    );
    expect(data.tasks).toEqual({ outstanding: 5, overdue: 1, upcoming: 2 });
  });
});

describe("shape and bounds", () => {
  it("empty data: all zeros and an empty attention list", async () => {
    const data = await dashboard([]);
    expect(Object.values(data.projects.byStatus).every((n) => n === 0)).toBe(true);
    expect({ ...data.projects, byStatus: undefined }).toEqual({
      active: 0, staffAction: 0, waitingForCustomer: 0, overdue: 0, approaching: 0, recentlyCompleted: 0, byStatus: undefined,
    });
    expect(data.tasks).toEqual({ outstanding: 0, overdue: 0, upcoming: 0 });
    expect(data.attention).toEqual([]);
  });

  it("a fixed query count regardless of data size (no N+1)", async () => {
    const small = gateway([]);
    await handleGetAdminDashboardRequest(AUTH, STAFF, small.g, NOW);
    const big = Array.from({ length: 200 }, () => ({ id: pid(), status: "NEW" as const, deadlineAt: at(-DAY) }));
    const large = gateway(big, big.map((p) => ({ status: "TODO" as const, projectId: p.id })));
    await handleGetAdminDashboardRequest(AUTH, STAFF, large.g, NOW);
    expect(large.calls).toEqual(small.calls);
    expect(small.calls).toHaveLength(12 + 3 + 3 + 2);
  });

  it("compact response: aggregate keys only; attention rows carry navigation fields only", async () => {
    const data = await dashboard([{ id: pid(), status: "NEW", deadlineAt: at(-DAY) }]);
    expect(Object.keys(data).sort()).toEqual(["attention", "generatedAt", "projects", "tasks"]);
    expect(Object.keys(data.attention[0]).sort()).toEqual(["deadlineAt", "id", "overdue", "projectCode", "status"]);
    expect(data.generatedAt).toBe(NOW.toISOString());
    expect(JSON.stringify(data)).not.toMatch(/"(customer\w*|email|phone|\w*note|token\w*|metadata|\w*[pP]rice\w*)":/);
  });
});
