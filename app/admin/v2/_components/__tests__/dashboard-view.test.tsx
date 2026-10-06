import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PROJECT_STATUSES, type ProjectStatus } from "../../../../../lib/domain";
import type { AdminDashboard } from "../../../../../lib/server/dashboard/dashboard-types";
import { DashboardView } from "../dashboard-view";

/** Task 034C Tổng quan: populated/empty rendering and read-only boundaries. */

const ROOT = join(__dirname, "../../../../..");

function dashboard(overrides: Partial<AdminDashboard> = {}): AdminDashboard {
  const byStatus = Object.fromEntries(PROJECT_STATUSES.map((s) => [s, 0])) as Record<ProjectStatus, number>;
  return {
    generatedAt: "2026-10-06T05:00:00.000Z",
    projects: { active: 0, staffAction: 0, waitingForCustomer: 0, overdue: 0, approaching: 0, recentlyCompleted: 0, byStatus },
    tasks: { outstanding: 0, overdue: 0, upcoming: 0 },
    attention: [],
    ...overrides,
  };
}

describe("DashboardView", () => {
  it("renders the summary, task tiles, 12 status rows and attention links", () => {
    const base = dashboard();
    const html = renderToStaticMarkup(
      <DashboardView
        dashboard={dashboard({
          projects: { ...base.projects, active: 17, overdue: 12, approaching: 1, byStatus: { ...base.projects.byStatus, PUBLISHED: 9 } },
          tasks: { outstanding: 4, overdue: 2, upcoming: 1 },
          attention: [
            { id: "11111111-1111-4111-8111-111111111111", projectCode: "WC-2026-000007", status: "IN_PROGRESS", deadlineAt: "2026-10-01T03:00:00Z", overdue: true },
            { id: "22222222-2222-4222-8222-222222222222", projectCode: "WC-2026-000008", status: "NEW", deadlineAt: "2026-10-08T03:00:00Z", overdue: false },
          ],
        })}
      />,
    );
    for (const label of ["Đang hoạt động", "Cần xử lý", "Chờ khách", "Quá hạn", "Sắp đến hạn", "Hoàn thành 30 ngày", "Công việc chưa xong", "Công việc quá hạn", "Công việc 7 ngày tới"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain(">17<");
    expect(html.match(/<li class="flex items-center justify-between/g)).toHaveLength(12);
    expect(html).toContain('href="/admin/v2/projects/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain("WC-2026-000008");
    expect(html).toContain("Hiển thị 2 / 13 dự án");
  });

  it("renders zeros and an empty attention message for an empty system", () => {
    const html = renderToStaticMarkup(<DashboardView dashboard={dashboard()} />);
    expect(html).toContain("Không có dự án quá hạn hoặc sắp đến hạn.");
    expect(html).not.toContain("/admin/v2/projects/");
  });
});

describe("Task 034C boundaries", () => {
  it("staff-only read path, no service_role/RPC/writes/activity_logs, no browser 100-row cap, frozen work untouched", () => {
    const files = [
      "lib/server/dashboard/get-admin-dashboard.ts",
      "lib/server/supabase/dashboard-repository.ts",
      "lib/server/routes/admin-dashboard.ts",
      "app/api/v2/internal/dashboard/route.ts",
      "app/admin/v2/page.tsx",
      "app/admin/v2/_components/dashboard-view.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).not.toMatch(/service-role-client|SERVICE_ROLE_KEY|createServiceRoleSupabaseClient|\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|from\("activity_logs"\)/);
    }
    expect(readFileSync(join(ROOT, "lib/server/routes/admin-dashboard.ts"), "utf8")).toMatch(/requireStaff\(/);
    const page = readFileSync(join(ROOT, "app/admin/v2/page.tsx"), "utf8");
    expect(page).toContain("fetchAdminDashboard()");
    expect(page).not.toMatch(/PROJECT_LIST_LIMIT|isStatusNeedingStaffAttention|\.filter\(/);

    expect(readdirSync(join(ROOT, "supabase/migrations")).some((name) => /_0043_/.test(name))).toBe(false);
    const frozen = ["supabase", "lib/server/project-tasks", "lib/server/project-activity", "lib/server/supabase/project-tasks-repository.ts", "lib/server/supabase/project-activity-repository.ts", "app/api/v2/internal/projects"];
    expect(execFileSync("git", ["status", "--porcelain", "--", ...frozen], { cwd: ROOT }).toString()).toBe("");
  });

  it("owner-approved status groups are exact and partition the 12 statuses", async () => {
    const d = await import("../../../../../lib/domain");
    expect([...d.PROJECT_STAFF_ACTION_STATUSES]).toEqual(["NEW", "IN_PROGRESS", "INTERNAL_REVIEW", "REVISION_REQUIRED", "APPROVED", "READY_TO_PUBLISH"]);
    expect([...d.PROJECT_WAITING_FOR_CUSTOMER_STATUSES]).toEqual(["WAITING_FOR_INFO", "CUSTOMER_REVIEW", "AWAITING_PAYMENT"]);
    expect([...d.PROJECT_CLOSED_STATUSES]).toEqual(["COMPLETED", "ARCHIVED"]);
    expect([...d.PROJECT_DEADLINE_CLOSED_STATUSES]).toEqual(["PUBLISHED", "COMPLETED", "ARCHIVED"]);
    expect([...d.OUTSTANDING_TASK_STATUSES]).toEqual(["TODO", "IN_PROGRESS"]);
    const all = [...d.PROJECT_STAFF_ACTION_STATUSES, ...d.PROJECT_WAITING_FOR_CUSTOMER_STATUSES, ...d.PROJECT_DEADLINE_CLOSED_STATUSES];
    expect([...all].sort()).toEqual([...d.PROJECT_STATUSES].sort());
  });
});
