import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InvitationViewModel } from "../../../../lib/invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../../../lib/invitation-rendering/renderer-selection";
import type { InvitationRendererHostProps } from "../../../../templates/core/invitation-renderer-host";

/**
 * Isolated staff preview document: fetches the real staff preview API via
 * the shared loader (Bearer from the browser staff session, never the URL),
 * renders the frozen host only for READY, and nothing otherwise.
 */

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const hostProps: InvitationRendererHostProps[] = [];
const fetchStaffInvitationPreview = vi.fn();
let queryResult: { data: unknown; loading: boolean };
let capturedFetcher: (() => Promise<unknown>) | null = null;
let variantParam: string | null = "BRIDE";

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: PROJECT_ID }),
  useSearchParams: () => ({ get: (key: string) => (key === "variant" ? variantParam : null) }),
}));

vi.mock("../../../../lib/admin/admin-api-client", () => ({
  fetchStaffInvitationPreview: (...args: unknown[]) => fetchStaffInvitationPreview(...args),
}));

vi.mock("../../../../lib/admin/use-admin-query", () => ({
  useAdminQuery: (fetcher: () => Promise<unknown>) => {
    capturedFetcher = fetcher;
    return { ...queryResult, error: null, reload: () => {} };
  },
}));

vi.mock("../staff-preview-renderer", () => ({
  StaffPreviewRenderer: (props: InvitationRendererHostProps) => {
    hostProps.push(props);
    return <div data-host="spy" />;
  },
}));

const { default: PreviewFramePage } = await import("../[projectId]/page");

const viewModel = { marker: "vm" } as unknown as InvitationViewModel;
const sections = { marker: "sections" } as unknown as RendererEffectiveSections;
const READY = { status: "READY", rendererKey: "wedding.backend-chosen.v3", viewModel, sections };

beforeEach(() => {
  hostProps.length = 0;
  fetchStaffInvitationPreview.mockReset();
  capturedFetcher = null;
  variantParam = "BRIDE";
});

describe("preview frame document", () => {
  it("READY renders the staff preview wrapper with exactly the backend renderer key, ViewModel and sections", () => {
    queryResult = { data: READY, loading: false };
    renderToStaticMarkup(<PreviewFramePage />);
    expect(hostProps).toEqual([{ rendererKey: "wedding.backend-chosen.v3", viewModel, sections }]);
  });

  it("loads through the real staff preview API with the URL's project id and variant", async () => {
    queryResult = { data: null, loading: true };
    fetchStaffInvitationPreview.mockResolvedValue(READY);
    renderToStaticMarkup(<PreviewFramePage />);
    await expect(capturedFetcher?.()).resolves.toBe(READY);
    expect(fetchStaffInvitationPreview).toHaveBeenCalledWith(PROJECT_ID, "BRIDE");
  });

  it("an invalid variant never calls the API", async () => {
    variantParam = "PUBLIC";
    queryResult = { data: null, loading: true };
    renderToStaticMarkup(<PreviewFramePage />);
    await expect(capturedFetcher?.()).resolves.toEqual({ status: "INVALID_VARIANT" });
    expect(fetchStaffInvitationPreview).not.toHaveBeenCalled();
  });

  it.each([
    { status: "BLOCKED", issues: [{ code: "WEDDING_DETAILS_MISSING", severity: "BLOCKING", message: "x" }] },
    { status: "NO_DESIGN" },
    { status: "ERROR", message: "Phiên đăng nhập nhân sự đã hết hạn.", retryable: false },
  ])("non-READY ($status, incl. auth failure) renders no invitation", (state) => {
    queryResult = { data: state, loading: false };
    const html = renderToStaticMarkup(<PreviewFramePage />);
    expect(hostProps).toHaveLength(0);
    expect(html).toContain("Không thể hiển thị bản xem trước");
    expect(html).not.toContain("WEDDING_DETAILS_MISSING");
  });

  it("loading renders no invitation", () => {
    queryResult = { data: null, loading: true };
    expect(renderToStaticMarkup(<PreviewFramePage />)).toContain("Đang tải bản xem trước");
    expect(hostProps).toHaveLength(0);
  });
});

describe("preview frame — static boundary", () => {
  const dir = join(__dirname, "..");
  const files = ["layout.tsx", join("[projectId]", "page.tsx")].map((file) => join(dir, file));
  const code = files
    .map((file) => readFileSync(file, "utf8"))
    .map((source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))
    .join("\n");

  it("no hard-coded renderer key, template import, Supabase, service_role, write, publish or token handling", () => {
    expect(code).not.toMatch(/elegant-editorial|wedding\.[a-z-]+\.v\d|templates\/wedding\//);
    expect(code).not.toMatch(/supabase|service_role|getStaffAccessToken|access_token|Bearer/i);
    expect(code).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)|invitation_versions|publish/i);
  });

  it("is outside the /admin/v2 AdminShell layout and has no editing controls", () => {
    expect(code).not.toMatch(/AdminShell|<button|<input|<form/);
    expect(statSync(join(dir, "..", "v2", "layout.tsx")).isFile()).toBe(true);
    expect(readdirSync(join(dir, ".."))).toContain("preview-frame");
  });
});
