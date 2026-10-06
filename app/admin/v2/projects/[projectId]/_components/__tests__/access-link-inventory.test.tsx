import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../../../../../../lib/admin/admin-api-error";
import type { AccessLinkInventoryItem } from "../../../../../../../lib/server/access-links/access-link-inventory-types";
import type { ProjectPublishState } from "../../../../../../../lib/server/invitation-publish/invitation-publish-types";
import type { ProjectSummary } from "../../../../../../../lib/server/projects/project-types";

/** Launch Hardening 02 / P0-1 — Publish-tab access-link inventory (Y–AC). */

let queryData: ProjectPublishState | null = null;

vi.mock("../../../../../../../lib/admin/use-admin-query", () => ({
  useAdminQuery: () => ({ data: queryData, loading: false, error: null, reload: () => {} }),
}));
vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({
  fetchProjectPublishState: vi.fn(),
  publishInvitationVariant: vi.fn(),
  markProjectPaid: vi.fn(),
  transitionProjectStatus: vi.fn(),
  issuePortalAccessLink: vi.fn(),
  rotateAccessLink: vi.fn(),
  fetchProjectAccessLinks: vi.fn(),
  revokeProjectAccessLink: vi.fn(),
}));

const { AccessLinkInventoryView, revokeErrorMessage, revokeThenReload } = await import("../access-link-inventory");
const { PublishTab } = await import("../publish-tab");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REVOKED_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ITEMS: AccessLinkInventoryItem[] = [
  { id: ACTIVE_ID, linkType: "PORTAL", status: "ACTIVE", createdAt: "2026-10-05T03:00:00.000Z", expiresAt: null, revokedAt: null, lastUsedAt: "2026-10-05T04:00:00.000Z" },
  { id: REVOKED_ID, linkType: "REVIEW", status: "REVOKED", createdAt: "2026-10-04T03:00:00.000Z", expiresAt: null, revokedAt: "2026-10-04T05:00:00.000Z", lastUsedAt: null },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", linkType: "INTAKE", status: "EXPIRED", createdAt: "2026-10-01T03:00:00.000Z", expiresAt: "2026-10-02T03:00:00.000Z", revokedAt: null, lastUsedAt: null },
];

const noop = () => {};
function view(overrides: Partial<Parameters<typeof AccessLinkInventoryView>[0]> = {}): string {
  return renderToStaticMarkup(
    <AccessLinkInventoryView
      items={ITEMS}
      loading={false}
      listError={null}
      notice={null}
      confirmingId={null}
      pendingId={null}
      onReload={noop}
      onAskRevoke={noop}
      onCancelRevoke={noop}
      onConfirmRevoke={noop}
      {...overrides}
    />,
  );
}

describe("AccessLinkInventoryView", () => {
  it("Y: lists every link with Vietnamese type/status labels and timestamps; revoke offered only on active rows; no UUID shown", () => {
    const html = view();
    expect(html).toContain("Liên kết truy cập");
    expect(html).toContain("Cổng khách hàng");
    expect(html).toContain("Duyệt thiệp");
    expect(html).toContain("Thu thập thông tin");
    expect(html).toContain("Đang hoạt động");
    expect(html).toContain("Đã thu hồi");
    expect(html).toContain("Đã hết hạn");
    expect(html).toContain("Dùng gần nhất:");
    expect(html).toContain("Thu hồi lúc:");
    expect(html).toContain("Hết hạn:");
    expect(html.match(/Thu hồi link/g)).toHaveLength(1);
    expect(html).not.toContain(ACTIVE_ID);
    expect(html).not.toContain(REVOKED_ID);
    expect(html).not.toMatch(/\/portal\/|\/review\/|token/i);
  });

  it("Z: empty, loading and list-error states", () => {
    expect(view({ items: [] })).toContain("Dự án chưa có liên kết truy cập nào.");
    expect(view({ items: null, loading: true })).toContain("Đang tải liên kết truy cập...");
    expect(view({ items: null, listError: "Không thể tải danh sách liên kết truy cập. Vui lòng thử lại." })).toContain('role="alert"');
  });

  it("AA: in-page confirmation explains immediate, irreversible revocation; no window.confirm", () => {
    const html = view({ confirmingId: ACTIVE_ID });
    expect(html).toContain('data-testid="access-link-revoke-confirm"');
    expect(html).toContain("ngừng hoạt động ngay lập tức và không thể khôi phục");
    expect(html).toContain("Xác nhận thu hồi");
    expect(html).toContain("Hủy");
    expect(html).not.toContain("Thu hồi link");
    const source = readFileSync(join(__dirname, "../access-link-inventory.tsx"), "utf8");
    expect(source).not.toMatch(/window\.confirm|confirm\(|localStorage|sessionStorage/);
  });
});

describe("revokeThenReload (AB)", () => {
  it("AB: success is reported only after the server revoke, and the list is always re-read from the server", async () => {
    const order: string[] = [];
    const after = [{ ...ITEMS[0], status: "REVOKED" as const, revokedAt: "2026-10-06T00:00:00.000Z" }];
    const outcome = await revokeThenReload(PROJECT_ID, ACTIVE_ID, {
      revoke: async (projectId, linkId) => {
        order.push(`revoke:${projectId}:${linkId}`);
      },
      fetch: async (projectId) => {
        order.push(`fetch:${projectId}`);
        return after;
      },
    });
    expect(order).toEqual([`revoke:${PROJECT_ID}:${ACTIVE_ID}`, `fetch:${PROJECT_ID}`]);
    expect(outcome).toEqual({ items: after, listError: null, notice: { kind: "SUCCESS", message: "Đã thu hồi liên kết. Liên kết cũ không còn sử dụng được." } });
  });

  it("AB: a failed revoke never reports success, still reloads, and maps 409/404/401 to fixed messages", async () => {
    const outcome = await revokeThenReload(PROJECT_ID, ACTIVE_ID, {
      revoke: async () => {
        throw new AdminApiError(409, "Access link is already revoked");
      },
      fetch: async () => ITEMS,
    });
    expect(outcome.notice).toEqual({ kind: "ERROR", message: "Liên kết này đã được thu hồi trước đó." });
    expect(outcome.items).toBe(ITEMS);
    expect(revokeErrorMessage(new AdminApiError(404, "x"))).toBe("Không tìm thấy liên kết này trong dự án.");
    expect(revokeErrorMessage(new AdminApiError(401, "x"))).toContain("hết hạn");
    expect(revokeErrorMessage(new Error("raw db detail"))).toBe("Không thể thu hồi liên kết lúc này. Vui lòng thử lại.");
  });

  it("AB: if the reload fails after a successful revoke, the success stands and the list shows an error (no stale optimistic rows)", async () => {
    const outcome = await revokeThenReload(PROJECT_ID, ACTIVE_ID, {
      revoke: async () => {},
      fetch: async () => {
        throw new AdminApiError(500, "x");
      },
    });
    expect(outcome.items).toBeNull();
    expect(outcome.notice.kind).toBe("SUCCESS");
    expect(outcome.listError).not.toBeNull();
  });
});

describe("PublishTab integration (AC)", () => {
  it("AC: the existing Portal issuer is preserved and the inventory renders beside it, even before publication", () => {
    const published = {
      id: "e1",
      invitationId: "a1",
      projectId: PROJECT_ID,
      versionNumber: 2,
      sourceReviewVersionId: "f1",
      sourceReviewVersionNumber: 1,
      templateVersionId: "t",
      rendererKeySnapshot: "r",
      publishedAt: "2026-10-02T00:00:00.000Z",
    };
    queryData = {
      projectId: PROJECT_ID,
      projectStatus: "PUBLISHED",
      paymentStatus: "PAID",
      packageCode: "COMMON",
      requiredVariants: ["COMMON"],
      projectBlocker: "PROJECT_CLOSED",
      allRequiredVariantsPublished: true,
      variants: [{ variant: "COMMON", invitationId: "a1", currentReview: null, publishedVersion: published, upToDate: true, canPublish: false, blocker: "PROJECT_CLOSED" }],
    };
    const html = renderToStaticMarkup(<PublishTab project={{ id: PROJECT_ID, status: "PUBLISHED" } as ProjectSummary} />);
    expect(html).toContain('data-testid="portal-link-issuer"');
    expect(html).toContain("Tạo link Portal khách hàng");
    expect(html).toContain('data-testid="access-link-inventory"');

    queryData = { ...queryData, projectStatus: "IN_PROGRESS", allRequiredVariantsPublished: false, variants: [] };
    const unpublished = renderToStaticMarkup(<PublishTab project={{ id: PROJECT_ID, status: "IN_PROGRESS" } as ProjectSummary} />);
    expect(unpublished).not.toContain('data-testid="portal-link-issuer"');
    expect(unpublished).toContain('data-testid="access-link-inventory"');
  });
});
