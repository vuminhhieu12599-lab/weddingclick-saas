import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LAUNCH-P0-03: the V2 Admin layout mounts the page while `/me` is still
 * confirming the Staff profile (so page reads — each authorized server-side —
 * run in parallel), never mounts it without a local session or after `/me`
 * failed, and offers a working "Thử lại".
 */

let session: Record<string, unknown> & { retry: () => void };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin/v2",
}));
vi.mock("../../_hooks/use-staff-session", () => ({ useStaffSession: () => session }));

const { default: AdminV2Layout } = await import("../../layout");

const PAGE = '<section data-page="dashboard"></section>';
const ROOT = join(__dirname, "../../../../..");

function render(): string {
  return renderToStaticMarkup(
    <AdminV2Layout>
      <section data-page="dashboard" />
    </AdminV2Layout>,
  );
}

beforeEach(() => {
  session = { status: "loading", retry: vi.fn() };
});

describe("AdminV2Layout", () => {
  it("does not mount the page before a local session is known", () => {
    expect(render()).not.toContain(PAGE);
    expect(render()).toContain("Đang xác thực nhân sự...");
  });

  it("does not mount the page without a session (redirects to /login)", () => {
    session = { status: "unauthenticated", retry: vi.fn() };
    expect(render()).not.toContain(PAGE);
  });

  it("mounts the shell and page while /me is verifying, with the Staff identity still pending", () => {
    session = { status: "verifying", retry: vi.fn() };
    const html = render();
    expect(html).toContain(PAGE);
    expect(html).toContain("animate-pulse");
  });

  it("shows the Staff identity once /me confirms it", () => {
    session = { status: "ready", staff: { userId: "u", role: "STAFF", displayName: "Lan Anh" }, retry: vi.fn() };
    const html = render();
    expect(html).toContain(PAGE);
    expect(html).toContain("Lan Anh");
  });

  it("unmounts the page when /me fails and offers Thử lại wired to retry", () => {
    session = { status: "error", message: "No active WeddingClick staff profile", retry: vi.fn() };
    const html = render();
    expect(html).not.toContain(PAGE);
    expect(html).toContain("No active WeddingClick staff profile");
    expect(html).toContain("Thử lại");
  });

  it("the session hook still verifies through /me, redirects on 401 and scopes reuse to the session user", () => {
    const source = readFileSync(join(ROOT, "app/admin/v2/_hooks/use-staff-session.ts"), "utf8");
    expect(source).toContain("await fetchStaffMe()");
    expect(source).toMatch(/isUnauthorized\(err\)[\s\S]*status: "unauthenticated"/);
    expect(source).toContain("setAdminDataScope(userId)");
    expect(source).toContain("onAuthStateChange");
    expect(source).not.toMatch(/jwt|atob|base64|decode/i);
  });
});
