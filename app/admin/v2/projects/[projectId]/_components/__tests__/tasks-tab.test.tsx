import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ProjectTaskRecord } from "../../../../../../../lib/server/project-tasks/project-task-types";

/** Task 034A Công việc tab: states, labels, in-page delete, form mapping, boundaries. */

vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({}));

const { TasksTabView } = await import("../tasks-tab");
const { buildCreateTaskBody, buildTaskPatch, taskFormFrom } = await import("../../../../../../../lib/admin/project-task-form");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const ROOT = join(__dirname, "../../../../../../..");
const noop = () => {};

function task(overrides: Partial<ProjectTaskRecord> = {}): ProjectTaskRecord {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    projectId: PROJECT_ID,
    title: "Kiểm tra thông tin nhà gái",
    status: "IN_PROGRESS",
    dueAt: "2026-10-10T02:00:00.000Z",
    assignedStaffId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    assignedStaffDisplayName: "Nguyễn Thị Lan",
    sortOrder: 0,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function render(tasks: ProjectTaskRecord[], initialMode?: Parameters<typeof TasksTabView>[0]["initialMode"]) {
  return renderToStaticMarkup(
    <TasksTabView projectId={PROJECT_ID} tasks={tasks} assignees={[]} refreshing={false} onChanged={noop} initialMode={initialMode} />,
  );
}

describe("TasksTabView", () => {
  it("shows the empty state and the create action", () => {
    const html = render([]);
    expect(html).toContain("Chưa có công việc nào.");
    expect(html).toContain("Thêm công việc");
  });

  it("shows title, Vietnamese status label, due time in Asia/Ho_Chi_Minh, assignee, Edit/Delete", () => {
    const html = render([task()]);
    expect(html).toContain("Kiểm tra thông tin nhà gái");
    expect(html).toContain("Đang làm");
    expect(html).not.toContain("IN_PROGRESS<");
    expect(html).toContain("10/10/2026 09:00");
    expect(html).toContain("Nguyễn Thị Lan");
    expect(html).toContain("Sửa");
    expect(html).toContain("Xoá");
  });

  it("delete uses an in-page confirmation naming the task, never window.confirm", () => {
    const html = render([task()], { kind: "DELETE", taskId: task().id });
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("Xoá công việc <span");
    expect(html).toContain("“Kiểm tra thông tin nhà gái”");
    const source = readFileSync(join(__dirname, "../tasks-tab.tsx"), "utf8");
    expect(source).not.toMatch(/confirm\(/);
  });

  it("edit form keeps a deactivated assignee selectable and exposes no sort-order input", () => {
    const html = render([task()], { kind: "EDIT", taskId: task().id });
    expect(html).toContain("Trạng thái");
    expect(html).toContain("Nguyễn Thị Lan (ngừng hoạt động)");
    expect(html).toContain("Không phân công");
    expect(html).not.toMatch(/sort/i);
  });
});

describe("project task form mapping", () => {
  it("create converts the wall-clock due time from Asia/Ho_Chi_Minh and maps blanks to null", () => {
    expect(buildCreateTaskBody({ title: " A ", status: "TODO", dueLocal: "2026-10-10T09:00", assignedStaffId: "" })).toEqual({
      ok: true,
      body: { title: " A ", dueAt: "2026-10-10T02:00:00.000Z", assignedStaffId: null },
    });
    expect(buildCreateTaskBody({ title: "  ", status: "TODO", dueLocal: "", assignedStaffId: "" }).ok).toBe(false);
  });

  it("edit sends only changed fields (status change never rewrites the assignee)", () => {
    const original = task();
    expect(buildTaskPatch(original, { ...taskFormFrom(original), status: "DONE" })).toEqual({ ok: true, body: { status: "DONE" } });
    expect(buildTaskPatch(original, { ...taskFormFrom(original), assignedStaffId: "", dueLocal: "" })).toEqual({
      ok: true,
      body: { dueAt: null, assignedStaffId: null },
    });
  });
});

describe("Task 034A boundaries", () => {
  it("staff-only, no service_role, no Project assignment write, no public/portal route, no migration 0043", () => {
    const files = [
      "lib/server/project-tasks/manage-project-tasks.ts",
      "lib/server/supabase/project-tasks-repository.ts",
      "lib/server/routes/project-tasks.ts",
      "app/api/v2/internal/projects/[id]/tasks/route.ts",
      "app/api/v2/internal/projects/[id]/tasks/[taskId]/route.ts",
      "app/api/v2/internal/projects/[id]/tasks/assignees/route.ts",
    ];
    for (const file of files) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).not.toMatch(/service-role-client|SERVICE_ROLE_KEY|createServiceRoleSupabaseClient|\.rpc\(|from\("activity_logs"\)/);
      expect(source).not.toMatch(/from\("projects"\)\s*\.update/);
    }
    expect(readFileSync(join(ROOT, "lib/server/routes/project-tasks.ts"), "utf8")).toMatch(/requireStaff\(/);
    for (const dir of ["app/api/v2/public", "app/api/v2/portal", "app/api/v2/review"]) {
      if (existsSync(join(ROOT, dir))) {
        expect(readdirSync(join(ROOT, dir), { recursive: true }).join("\n")).not.toMatch(/task/i);
      }
    }
    // Task 035B: the only migration allowed after 0042 is the owner-approved legacy V1 lockdown.
    expect(readdirSync(join(ROOT, "supabase/migrations")).filter((name) => /_0043_/.test(name))).toEqual(["20260911041203_0043_legacy_v1_lockdown.sql"]);
    expect(readFileSync(join(__dirname, "../workspace-tabs.tsx"), "utf8")).toContain('{ key: "TASKS", label: "Công việc" }');
  });
});
