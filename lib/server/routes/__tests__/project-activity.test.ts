import { describe, expect, it } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import { ACTIVITY_PAGE_SIZE, encodeActivityCursor } from "../../project-activity/list-project-activity";
import type { ProjectActivityGateway } from "../../project-activity/project-activity-gateway";
import type { ActivityCursor, ProjectActivityPage, ProjectActivityRow } from "../../project-activity/project-activity-types";
import { handleListProjectActivityRequest } from "../project-activity";

/** Task 034B: staff read-only Project Activity history. */

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
const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_PROJECT = "99999999-9999-4999-8999-999999999999";

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function row(n: number, overrides: Partial<ProjectActivityRow> = {}): ProjectActivityRow {
  return {
    id: uuid(n),
    actionType: "CANONICAL_DATA_APPLIED",
    summary: `Sự kiện ${n}`,
    actorType: "SYSTEM",
    staffDisplayName: null,
    createdAt: `2026-10-01T00:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}+00:00`,
    ...overrides,
  };
}

/** Fake gateway implementing created_at DESC, id DESC keyset over per-Project rows. */
function gateway(rowsByProject: Record<string, ProjectActivityRow[]>, options: { throwOnList?: boolean } = {}) {
  const calls: { projectId: string; before: ActivityCursor | null; limit: number }[] = [];
  const desc = (a: ProjectActivityRow, b: ProjectActivityRow) =>
    a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : Date.parse(b.createdAt) - Date.parse(a.createdAt);
  const g: ProjectActivityGateway<FakeClient> = {
    projectExists: async (_c, projectId) => projectId in rowsByProject,
    listProjectActivity: async (_c, projectId, { before, limit }) => {
      calls.push({ projectId, before, limit });
      if (options.throwOnList) throw new Error('relation "activity_logs" secret detail');
      return [...(rowsByProject[projectId] ?? [])]
        .sort(desc)
        .filter((r) => before === null || desc(r, { ...r, createdAt: before.createdAt, id: before.id }) > 0)
        .slice(0, limit);
    },
  };
  return { g, calls };
}

function list(g: ProjectActivityGateway<FakeClient>, projectId = PROJECT_A, cursor: string | null = null, auth = STAFF) {
  return handleListProjectActivityRequest(AUTH, projectId, cursor, auth, g);
}

function page(result: Awaited<ReturnType<typeof list>>): ProjectActivityPage {
  expect(result.status).toBe(200);
  return (result.body as { data: ProjectActivityPage }).data;
}

const many = Array.from({ length: ACTIVITY_PAGE_SIZE + 5 }, (_, i) => row(i + 1));

describe("project activity auth", () => {
  it("401 without a Bearer header and never reaches the gateway", async () => {
    const { g, calls } = gateway({ [PROJECT_A]: [row(1)] });
    const result = await handleListProjectActivityRequest(null, PROJECT_A, null, STAFF, g);
    expect(result.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("401 for an invalid token and 403 for an inactive/non-staff caller", async () => {
    const { g, calls } = gateway({ [PROJECT_A]: [row(1)] });
    expect((await list(g, PROJECT_A, null, authGateway(null, null))).status).toBe(401);
    expect((await list(g, PROJECT_A, null, authGateway(null))).status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("STAFF and ADMIN both read the Project's history", async () => {
    const { g } = gateway({ [PROJECT_A]: [row(1)] });
    expect(page(await list(g, PROJECT_A, null, STAFF)).items).toHaveLength(1);
    expect(page(await list(g, PROJECT_A, null, ADMIN)).items).toHaveLength(1);
  });
});

describe("project scoping", () => {
  it("returns only the route Project's rows (A never sees B)", async () => {
    const { g, calls } = gateway({ [PROJECT_A]: [row(1)], [PROJECT_B]: [row(2, { summary: "Của dự án B" })] });
    const data = page(await list(g, PROJECT_A));
    expect(data.items.map((i) => i.summary)).toEqual(["Sự kiện 1"]);
    expect(calls.every((c) => c.projectId === PROJECT_A)).toBe(true);
  });

  it("404 for an unknown Project; 400 for a malformed id", async () => {
    const { g, calls } = gateway({ [PROJECT_A]: [] });
    expect((await list(g, UNKNOWN_PROJECT)).status).toBe(404);
    expect((await list(g, "not-a-uuid")).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("a cursor taken from Project B still reads only Project A", async () => {
    const { g, calls } = gateway({ [PROJECT_A]: [row(1), row(3)], [PROJECT_B]: [row(2)] });
    const cursor = encodeActivityCursor({ createdAt: row(2).createdAt, id: row(2).id });
    const data = page(await list(g, PROJECT_A, cursor));
    expect(data.items.map((i) => i.id)).toEqual([uuid(1)]);
    expect(calls.at(-1)?.projectId).toBe(PROJECT_A);
  });

  it("500 with a fixed body and no DB detail", async () => {
    const { g } = gateway({ [PROJECT_A]: [] }, { throwOnList: true });
    const result = await list(g);
    expect(result).toEqual({ status: 500, body: { error: "Internal server error" } });
  });
});

describe("response model", () => {
  it("serializes exactly id/actionType/summary/actorType/actorDisplayName/createdAt", async () => {
    const { g } = gateway({ [PROJECT_A]: [row(1)] });
    const [item] = page(await list(g)).items;
    expect(Object.keys(item).sort()).toEqual(["actionType", "actorDisplayName", "actorType", "createdAt", "id", "summary"]);
    expect(JSON.stringify(item)).not.toMatch(/projectId|actorProfileId|metadata|11111111-/);
  });

  it("resolves actor display names with safe fallbacks", async () => {
    const { g } = gateway({
      [PROJECT_A]: [
        row(5, { actorType: "STAFF", staffDisplayName: "Nguyễn Thị Lan" }),
        row(4, { actorType: "STAFF", staffDisplayName: null }),
        row(3, { actorType: "CUSTOMER" }),
        row(2, { actorType: "GUEST" }),
        row(1, { actorType: "SYSTEM" }),
      ],
    });
    expect(page(await list(g)).items.map((i) => i.actorDisplayName)).toEqual([
      "Nguyễn Thị Lan",
      "Nhân viên",
      "Khách hàng",
      "Khách mời",
      "Hệ thống",
    ]);
  });
});

describe("pagination", () => {
  it("first page is bounded, newest first, and asks for one extra row only", async () => {
    const { g, calls } = gateway({ [PROJECT_A]: many });
    const data = page(await list(g));
    expect(data.items).toHaveLength(ACTIVITY_PAGE_SIZE);
    expect(data.items[0].id).toBe(uuid(many.length));
    expect(data.nextCursor).not.toBeNull();
    expect(calls).toEqual([{ projectId: PROJECT_A, before: null, limit: ACTIVITY_PAGE_SIZE + 1 }]);
  });

  it("the cursor continues with strictly older rows, no overlap, ending with null", async () => {
    const tied = [...many, row(900, { createdAt: many[0].createdAt })];
    const { g } = gateway({ [PROJECT_A]: tied });
    const first = page(await list(g));
    const second = page(await list(g, PROJECT_A, first.nextCursor));
    const ids = [...first.items, ...second.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(tied.length);
    expect(second.nextCursor).toBeNull();
    // Same created_at: id DESC tie-break puts uuid(900) before uuid(1).
    expect(ids.slice(-2)).toEqual([uuid(900), uuid(1)]);
  });

  it("rejects malformed cursors with 400 before any read", async () => {
    const { g, calls } = gateway({ [PROJECT_A]: many });
    const bad = [
      "",
      "not base64!",
      Buffer.from("2026-10-01T00:00:00+00:00", "utf8").toString("base64url"),
      Buffer.from(`2026-10-01T00:00:00|${uuid(1)}`, "utf8").toString("base64url"),
      Buffer.from("2026-10-01T00:00:00+00:00|nope", "utf8").toString("base64url"),
      Buffer.from(`2026-10-01T00:00:00+00:00|${uuid(1)}|x`, "utf8").toString("base64url"),
    ];
    for (const cursor of bad) {
      expect((await list(g, PROJECT_A, cursor)).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });
});
