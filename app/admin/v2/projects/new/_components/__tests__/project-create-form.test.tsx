import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "../../../../../../../lib/server/projects/project-types";

/** Launch Hardening 03 / P0-3 — Staff "Tạo dự án" UI. */

let listData: ProjectSummary[] | null = [];

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("../../../../../../../lib/admin/use-admin-query", () => ({
  useAdminQuery: () => ({ data: listData, loading: false, error: null, reload: () => {} }),
}));
vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({
  PROJECT_LIST_LIMIT: 100,
  fetchProjects: vi.fn(),
  createCustomer: vi.fn(),
  createProject: vi.fn(),
}));

const { ProjectCreateFormView, EMPTY_PROJECT_CREATION_FORM } = await import("../project-create-form");
const { default: NewProjectPage } = await import("../../page");
const { default: ProjectsListPage } = await import("../../../page");

const ROOT = join(__dirname, "../../../../../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const LH03_UI_FILES = [
  "lib/admin/project-creation.ts",
  "app/admin/v2/projects/new/page.tsx",
  "app/admin/v2/projects/new/_components/project-create-form.tsx",
];

const noop = () => {};
function view(overrides: Partial<Parameters<typeof ProjectCreateFormView>[0]> = {}): string {
  return renderToStaticMarkup(
    <ProjectCreateFormView
      form={EMPTY_PROJECT_CREATION_FORM}
      createdCustomer={null}
      submitting={false}
      error={null}
      onChange={noop}
      onSubmit={noop}
      onResetCustomer={noop}
      {...overrides}
    />,
  );
}

describe("Staff project creation UI", () => {
  it("entry point: the Projects list offers “Tạo dự án” linking to the dedicated creation route", () => {
    listData = [];
    const html = renderToStaticMarkup(<ProjectsListPage />);
    expect(html).toContain('href="/admin/v2/projects/new"');
    expect(html).toContain("Tạo dự án");
  });

  it("creation page renders the form with a way back to the list", () => {
    const html = renderToStaticMarkup(<NewProjectPage />);
    expect(html).toContain('data-testid="project-create-form"');
    expect(html).toContain('href="/admin/v2/projects"');
  });

  it("form shows Customer fields, both canonical packages and the PERSONALIZED_GUEST add-on with Vietnamese labels, no hard-coded price", () => {
    const html = view();
    for (const text of ["Tên khách hàng", "Số điện thoại", "Email", "Ghi chú", "Thiệp chung hai bên", "Thiệp riêng nhà trai / nhà gái", "Cá nhân hóa tên khách mời"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('value="COMMON"');
    expect(html).toContain('value="SEPARATE"');
    expect(html).toContain('value="PERSONALIZED_GUEST"');
    expect(html).toContain('maxLength="200"');
    expect(html).not.toMatch(/150[.,]000|250[.,]000|50[.,]000|VND|₫/);
    expect(html).toMatch(/<button type="submit"[^>]*>Tạo dự án<\/button>/);
    expect(html).not.toContain('disabled=""');
  });

  it("double submit: while in flight every input and the submit button are disabled", () => {
    const html = view({ submitting: true, form: { ...EMPTY_PROJECT_CREATION_FORM, packageCode: "COMMON" } });
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Đang tạo\.\.\.<\/button>/);
    const inputs = html.match(/<(input|textarea)\b[^>]*>/g) ?? [];
    expect(inputs.length).toBeGreaterThanOrEqual(7);
    for (const input of inputs) {
      expect(input).toContain('disabled=""');
    }
  });

  it("double submit: the container blocks a second submit with a ref guard before re-render", () => {
    const source = read("app/admin/v2/projects/new/_components/project-create-form.tsx");
    const submitFn = source.slice(source.indexOf("async function submit()"), source.indexOf("return (\n    <ProjectCreateFormView"));
    expect(submitFn.indexOf("if (inFlight.current)")).toBeGreaterThan(-1);
    expect(submitFn.indexOf("if (inFlight.current)")).toBeLessThan(submitFn.indexOf("inFlight.current = true"));
    expect(submitFn.indexOf("inFlight.current = true")).toBeLessThan(submitFn.indexOf("await submitProjectCreation"));
  });

  it("partial success: the created Customer is locked in, the retry button says it only creates the Project", () => {
    const html = view({
      createdCustomer: { id: "11111111-1111-4111-8111-111111111111", displayName: "Em và sự cô đơn" },
      error: "Không thể tạo dự án lúc này. Vui lòng thử lại.",
    });
    expect(html).toContain('data-testid="created-customer-notice"');
    expect(html).toContain("Đã tạo khách hàng “Em và sự cô đơn”");
    expect(html).toContain("hệ thống sẽ không tạo thêm khách hàng");
    expect(html).not.toContain("Tên khách hàng *");
    expect(html).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(html).toMatch(/>Thử lại tạo dự án<\/button>/);
    expect(html).toMatch(/role="alert"[^>]*>Không thể tạo dự án lúc này\. Vui lòng thử lại\.<\/p>/);
  });

  it("redirect: success replaces the route with the server-returned Project id only; failure keeps the created Customer", () => {
    const source = read("app/admin/v2/projects/new/_components/project-create-form.tsx");
    expect(source).toContain("router.replace(`/admin/v2/projects/${encodeURIComponent(outcome.projectId)}`)");
    expect(source.match(/router\.(replace|push)\(/g)).toHaveLength(1);
    expect(source).toContain('outcome.kind === "PROJECT_FAILED"');
    expect(source).toContain("setCreatedCustomer({ id: outcome.customerId, displayName: outcome.customerName })");
  });

  it("security: no browser Supabase access, no table mutation, no service_role, no secrets, no debug output", () => {
    for (const file of LH03_UI_FILES) {
      const contents = read(file);
      expect(contents).not.toMatch(/@supabase\/|lib\/supabase"|from "\.\.\/supabase"/);
      expect(contents).not.toMatch(/\.(from|insert|update|upsert|delete|rpc)\(/);
      expect(contents).not.toMatch(/service[-_]?role|SERVICE_ROLE|SUPABASE_|process\.env/);
      expect(contents).not.toMatch(/console\.|localStorage|sessionStorage|WC-2026-/);
    }
    const apiClient = read("lib/admin/admin-api-client.ts");
    expect(apiClient).toContain('requestJson<CustomerRecord>("/api/v2/internal/customers", token, { method: "POST", body: input })');
    expect(apiClient).toContain('requestJson<{ id: string }>("/api/v2/internal/projects", token, { method: "POST", body: input })');
  });

  it("no migration 0044; backend, LH02 and 035A/035B surfaces are byte-identical to HEAD", () => {
    // Launch Hardening 04 (owner-approved checkpoint maintenance): only the approved 0044; no 0045 or later.
    // TE-03B (checkpoint maintenance): exactly 0046 may follow 0044; 0045 is retired and must stay absent.
    expect(readdirSync(join(ROOT, "supabase/migrations")).filter((name) => /_(004[4-9]|00[5-9]\d|0[1-9]\d\d)_/.test(name))).toEqual(["20260911041204_0044_republish_after_published.sql", "20260911041206_0046_project_template_media_slots.sql"]);
    const changed = execFileSync(
      "git",
      [
        "diff",
        "--name-only",
        "HEAD",
        "--",
        "supabase",
        "lib/server",
        "app/api",
        "proxy.ts",
        "next.config.ts",
        "package.json",
        "package-lock.json",
        "app/admin/v2/projects/[projectId]",
        "lib/presentation",
        "lib/domain",
        "app/portal",
        "app/i",
        "app/review",
        "components",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(changed.trim()).toBe("");
  });
});
