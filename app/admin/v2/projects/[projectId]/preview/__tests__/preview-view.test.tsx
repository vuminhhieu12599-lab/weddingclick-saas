import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../../../../../../lib/admin/admin-api-error";
import type { InvitationViewModel } from "../../../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../../../../../../lib/invitation-rendering/renderer-selection";
import type { InvitationRendererHostProps } from "../../../../../../../templates/core/invitation-renderer-host";

/**
 * Staff preview UI: variant parsing, backend-error → staff state mapping,
 * READY passes the backend's host inputs through untouched, and the
 * BLOCKED / no-design states render safely. The renderer host is a spy.
 */

const hostProps: InvitationRendererHostProps[] = [];

vi.mock("../../../../../../../templates/core/invitation-renderer-host", () => ({
  InvitationRendererHost: (props: InvitationRendererHostProps) => {
    hostProps.push(props);
    return <div data-host="spy" />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode } & Record<string, unknown>) => {
    const target =
      typeof href === "string" ? href : `?variant=${(href as { query: { variant: string } }).query.variant}`;
    const anchorProps = { "aria-current": rest["aria-current"], className: rest.className } as Record<string, unknown>;
    return (
      <a href={target} {...anchorProps}>
        {children}
      </a>
    );
  },
}));

const { PREVIEW_FRAME_WIDTH_PX, StaffPreviewView, previewFrameSrc } = await import("../_components/preview-view");
const { loadPreviewState, parsePreviewVariant, previewErrorState } = await import("../_components/preview-state");
type PreviewState = import("../_components/preview-state").PreviewState;
type InvitationVariant = import("../../../../../../../lib/domain").InvitationVariant;

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const viewModel = { marker: "vm" } as unknown as InvitationViewModel;
const sections = { marker: "sections" } as unknown as RendererEffectiveSections;
const READY: PreviewState = { status: "READY", rendererKey: "wedding.backend-chosen.v3", viewModel, sections };

function render(state: PreviewState | null, variant: InvitationVariant | null = "COMMON", loading = false) {
  return renderToStaticMarkup(
    <StaffPreviewView
      projectId={PROJECT_ID}
      variant={variant}
      state={state}
      loading={loading}
      onRetry={() => {}}
      width="MOBILE"
      onWidthChange={() => {}}
    />,
  );
}

beforeEach(() => {
  hostProps.length = 0;
});

describe("parsePreviewVariant", () => {
  it("defaults to COMMON when absent", () => {
    expect(parsePreviewVariant(null)).toBe("COMMON");
  });

  it.each(["COMMON", "GROOM", "BRIDE"] as const)("accepts %s", (variant) => {
    expect(parsePreviewVariant(variant)).toBe(variant);
  });

  it.each(["", "groom", "PUBLIC", "BRIDE "])("rejects %j instead of guessing", (raw) => {
    expect(parsePreviewVariant(raw)).toBeNull();
  });
});

describe("loadPreviewState", () => {
  it("never calls the backend for an invalid variant", async () => {
    const fetchPreview = vi.fn();
    await expect(loadPreviewState(PROJECT_ID, null, fetchPreview)).resolves.toEqual({ status: "INVALID_VARIANT" });
    expect(fetchPreview).not.toHaveBeenCalled();
  });

  it.each(["COMMON", "GROOM", "BRIDE"] as const)("requests %s and returns the backend body unchanged", async (variant) => {
    const fetchPreview = vi.fn().mockResolvedValue(READY);
    await expect(loadPreviewState(PROJECT_ID, variant, fetchPreview)).resolves.toBe(READY);
    expect(fetchPreview).toHaveBeenCalledWith(PROJECT_ID, variant);
  });

  it.each([
    [409, { status: "NO_DESIGN" }],
    [404, { status: "NOT_FOUND" }],
  ] as const)("maps HTTP %i", async (status, expected) => {
    const fetchPreview = vi.fn().mockRejectedValue(new AdminApiError(status, "server text"));
    await expect(loadPreviewState(PROJECT_ID, "COMMON", fetchPreview)).resolves.toEqual(expected);
  });

  it.each([400, 401, 403, 500, 0])("HTTP %i → fixed Vietnamese message, never the server text", (status) => {
    const state = previewErrorState(new AdminApiError(status, "relation invitation_versions / storage/path"));
    expect(state.status).toBe("ERROR");
    expect(JSON.stringify(state)).not.toMatch(/relation|storage/);
  });

  it("only load failures (500/network/unknown) are retryable", () => {
    expect(previewErrorState(new AdminApiError(500, "x"))).toMatchObject({ retryable: true });
    expect(previewErrorState(new TypeError("boom"))).toMatchObject({ retryable: true });
    expect(previewErrorState(new AdminApiError(400, "x"))).toMatchObject({ retryable: false });
  });
});

describe("StaffPreviewView", () => {
  it("READY renders an isolated same-origin iframe (390px mobile viewport), never the host in the parent", () => {
    const html = render(READY, "GROOM");
    expect(hostProps).toHaveLength(0);
    expect(html).toContain('data-preview-frame="MOBILE"');
    expect(html).toContain(`src="/admin/preview-frame/${PROJECT_ID}?variant=GROOM"`);
    expect(html).toContain('width="390"');
    expect(html).toMatch(/style="width:390px;height:[^"]*"/);
    expect(html).not.toMatch(/transform|scale\(/);
    expect(html).toContain("Bản xem trước — chưa xuất bản");
  });

  it.each(["COMMON", "GROOM", "BRIDE"] as const)("variant %s propagates to the frame URL", (variant) => {
    expect(render(READY, variant)).toContain(`?variant=${variant}"`);
  });

  it("desktop mode gives the frame the full available width", () => {
    const html = renderToStaticMarkup(
      <StaffPreviewView
        projectId={PROJECT_ID}
        variant="COMMON"
        state={READY}
        loading={false}
        onRetry={() => {}}
        width="DESKTOP"
        onWidthChange={() => {}}
      />,
    );
    expect(html).toContain('data-preview-frame="DESKTOP"');
    expect(html).toMatch(/style="width:100%;height:[^"]*"/);
    expect(html).not.toContain('width="390"');
  });

  it("frame URL carries only the project id and variant (no token)", () => {
    const src = previewFrameSrc(PROJECT_ID, "BRIDE");
    expect(src).toBe(`/admin/preview-frame/${PROJECT_ID}?variant=BRIDE`);
    expect(src).not.toMatch(/token|bearer|access|key=/i);
    expect(PREVIEW_FRAME_WIDTH_PX).toEqual({ MOBILE: 390, DESKTOP: null });
  });

  it("renders the three variant links with the current one marked and a back link", () => {
    const html = render(READY, "BRIDE");
    expect(html).toContain('href="?variant=COMMON"');
    expect(html).toContain('href="?variant=GROOM"');
    expect(html).toContain('aria-current="page" class="');
    expect(html).toMatch(/aria-current="page"[^>]*>Nhà gái</);
    expect(html).toContain(`href="/admin/v2/projects/${PROJECT_ID}"`);
  });

  it("BLOCKED shows the existing issue code + message and no renderer", () => {
    const html = render(
      {
        status: "BLOCKED",
        issues: [
          { code: "BRIDE_NAME_MISSING", severity: "BLOCKING", message: "Bride name is missing" },
          {
            code: "REQUIRED_CEREMONY_EVENT_MISSING",
            severity: "BLOCKING",
            message: "No visible VU_QUY event exists for the BRIDE invitation",
          },
        ],
      },
      "BRIDE",
    );
    expect(hostProps).toHaveLength(0);
    expect(html).toContain("Chưa thể xem trước thiệp mời");
    expect(html).toContain("BRIDE_NAME_MISSING");
    expect(html).toContain("Bride name is missing");
    expect(html).toContain("REQUIRED_CEREMONY_EVENT_MISSING");
    expect(html).toContain(`href="/admin/v2/projects/${PROJECT_ID}?tab=DATA"`);
  });

  it("NO_DESIGN shows the design-not-configured state", () => {
    const html = render({ status: "NO_DESIGN" });
    expect(hostProps).toHaveLength(0);
    expect(html).toContain("Dự án này chưa được cấu hình thiết kế.");
    expect(html).toContain(`href="/admin/v2/projects/${PROJECT_ID}?tab=DESIGN"`);
    expect(html).toContain("Chọn mẫu thiệp");
  });

  it("invalid variant shows a safe state while keeping the variant selector", () => {
    const html = render(null, null, true);
    expect(hostProps).toHaveLength(0);
    expect(html).toContain("Biến thể xem trước không hợp lệ");
    expect(html).toContain('href="?variant=COMMON"');
  });

  it("NOT_FOUND and ERROR never render the host", () => {
    expect(render({ status: "NOT_FOUND" })).toContain("Không tìm thấy dự án");
    expect(render({ status: "ERROR", message: "Không thể tạo bản xem trước lúc này.", retryable: true })).toContain(
      "Thử lại",
    );
    expect(hostProps).toHaveLength(0);
  });
});

describe("staff preview UI — static boundary", () => {
  const dir = join(__dirname, "..");
  const files = [
    join(dir, "page.tsx"),
    ...readdirSync(join(dir, "_components")).map((name) => join(dir, "_components", name)),
  ];
  const code = files
    .map((file) => readFileSync(file, "utf8"))
    .map((source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))
    .join("\n");

  it("never hard-codes a renderer key or imports a template implementation", () => {
    expect(code).not.toMatch(/elegant-editorial|ElegantEditorial|wedding\.[a-z-]+\.v\d/);
    expect(code).not.toMatch(/templates\/wedding\//);
  });

  it("has no Supabase access, service_role, write or publish path", () => {
    expect(code).not.toMatch(/supabase|service_role|serviceRole/i);
    expect(code).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)/);
    expect(code).not.toMatch(/invitation_versions|publish|localStorage|sessionStorage/i);
  });
});
