import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ProjectActivityRecord } from "../../../../../../../lib/server/project-activity/project-activity-types";

/** Task 034B Lịch sử tab: states, row content, load more, read-only boundaries. */

vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({}));

const { ActivityTabView } = await import("../activity-tab");

const ROOT = join(__dirname, "../../../../../../..");
const noop = () => {};

function item(overrides: Partial<ProjectActivityRecord> = {}): ProjectActivityRecord {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    actionType: "PROJECT_MARKED_PAID",
    summary: "Đã xác nhận thanh toán",
    actorType: "STAFF",
    actorDisplayName: "Nguyễn Thị Lan",
    createdAt: "2026-10-01T03:30:00+00:00",
    ...overrides,
  };
}

function render(items: ProjectActivityRecord[], props: { nextCursor?: string | null; loadingMore?: boolean } = {}) {
  return renderToStaticMarkup(
    <ActivityTabView
      items={items}
      nextCursor={props.nextCursor ?? null}
      loadingMore={props.loadingMore ?? false}
      loadMoreError={null}
      refreshing={false}
      onLoadMore={noop}
      onReload={noop}
    />,
  );
}

describe("ActivityTabView", () => {
  it("shows the empty state and no load-more", () => {
    const html = render([]);
    expect(html).toContain("Chưa có lịch sử hoạt động.");
    expect(html).not.toContain("Xem thêm");
  });

  it("shows summary, actor and Vietnamese time, never ids or metadata", () => {
    const html = render([item(), item({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", actorType: "CUSTOMER", actorDisplayName: "Khách hàng", summary: "Khách hàng đã duyệt" })]);
    expect(html).toContain("Đã xác nhận thanh toán");
    expect(html).toContain("Nguyễn Thị Lan");
    expect(html).toContain("Khách hàng đã duyệt");
    expect(html).toContain("10:30");
    expect(html).not.toMatch(/aaaaaaaa-|bbbbbbbb-|metadata|PROJECT_MARKED_PAID/);
  });

  it("Xem thêm appears only with a cursor and is disabled while loading", () => {
    expect(render([item()], { nextCursor: "abc" })).toMatch(/<button[^>]*>Xem thêm<\/button>/);
    const loading = render([item()], { nextCursor: "abc", loadingMore: true });
    expect(loading).toMatch(/<button[^>]*disabled=""[^>]*>Đang tải...<\/button>/);
  });
});

describe("Task 034B boundaries", () => {
  it("read-only, staff-only, no service_role, no activity writes; 034A tasks stay unaudited", () => {
    const activityFiles = [
      "lib/server/project-activity/list-project-activity.ts",
      "lib/server/project-activity/project-activity-gateway.ts",
      "lib/server/supabase/project-activity-repository.ts",
      "lib/server/routes/project-activity.ts",
      "app/api/v2/internal/projects/[id]/activity/route.ts",
      "app/admin/v2/projects/[projectId]/_components/activity-tab.tsx",
    ];
    for (const file of activityFiles) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).not.toMatch(/service-role-client|SERVICE_ROLE_KEY|createServiceRoleSupabaseClient|\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|"log_activity"/);
    }
    for (const file of ["lib/server/project-tasks/manage-project-tasks.ts", "lib/server/supabase/project-tasks-repository.ts"]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).not.toMatch(/\.rpc\(|from\("activity_logs"\)|"log_activity"/);
    }
    expect(readFileSync(join(ROOT, "lib/server/routes/project-activity.ts"), "utf8")).toMatch(/requireStaff\(/);
    expect(readFileSync(join(__dirname, "../workspace-tabs.tsx"), "utf8")).toContain('{ key: "ACTIVITY", label: "Lịch sử" }');
  });

  it("migration 0020 unchanged, no 0043, and the domain union matches the frozen §6 list", async () => {
    const migrations = readdirSync(join(ROOT, "supabase/migrations"));
    expect(migrations.some((name) => /_0043_/.test(name))).toBe(false);
    const m0020 = migrations.find((name) => /_0020_activity_logs\.sql$/.test(name))!;
    expect(execFileSync("git", ["status", "--porcelain", "--", `supabase/migrations/${m0020}`], { cwd: ROOT }).toString()).toBe("");
    const section = readFileSync(join(ROOT, "docs/API_CONTRACT.md"), "utf8").split("## 6. Activity Action Type Union")[1].split("```text")[1].split("```")[0];
    const { ACTIVITY_ACTION_TYPES } = await import("../../../../../../../lib/domain");
    expect([...ACTIVITY_ACTION_TYPES]).toEqual(section.trim().split("\n").map((s) => s.trim()));
  });
});
