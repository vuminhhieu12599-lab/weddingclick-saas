import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ProjectEventRecord } from "../../../../../../../lib/server/project-events/project-events-types";

/** Required-data editor view: empty load, existing ceremony, ambiguous side, preview link only after a save. */

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({
  fetchWeddingDetails: vi.fn(),
  saveWeddingDetails: vi.fn(),
  fetchProjectEvents: vi.fn(),
  createProjectEvent: vi.fn(),
  updateProjectEvent: vi.fn(),
}));

const { RequiredInvitationDataEditor } = await import("../required-invitation-data");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function brideEvent(overrides: Partial<ProjectEventRecord> = {}): ProjectEventRecord {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    projectId: PROJECT_ID,
    occasionType: "VU_QUY",
    side: "BRIDE",
    title: "Lễ Vu Quy nhà gái",
    startsAt: "2026-12-19T02:00:00.000Z",
    timezone: "Asia/Ho_Chi_Minh",
    venueName: null,
    address: null,
    mapUrl: null,
    description: null,
    sortOrder: 0,
    isPrimary: false,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    lunarDateDisplay: null,
    ...overrides,
  };
}

function render(events: ProjectEventRecord[] = []) {
  return renderToStaticMarkup(
    <RequiredInvitationDataEditor projectId={PROJECT_ID} initialDetails={null} initialEvents={events} />,
  );
}

describe("RequiredInvitationDataEditor", () => {
  it("empty project: staff labels, both ceremony cards in GROOM→BRIDE order, no fabricated values, no preview link yet", () => {
    const html = render();
    expect(html).toContain("Tên chú rể");
    expect(html).toContain("Tên cô dâu");
    expect(html.indexOf("Lễ Thành Hôn — Nhà trai")).toBeLessThan(html.indexOf("Lễ Vu Quy — Nhà gái"));
    expect(html.match(/Chưa có — sẽ tạo mới\./g)).toHaveLength(2);
    expect(html).not.toMatch(/value="[^"]+"/);
    expect(html).not.toContain("Xem trước thiệp");
    expect(html).not.toMatch(/groom_name|occasion_type|THANH_HON|VU_QUY|rendererKey/);
  });

  it("existing BRIDE event fills only the Vu Quy card with civil date/time", () => {
    const html = render([brideEvent()]);
    const bride = html.slice(html.indexOf('data-slot="BRIDE"'));
    const groom = html.slice(html.indexOf('data-slot="GROOM"'), html.indexOf('data-slot="BRIDE"'));
    expect(bride).toContain('value="Lễ Vu Quy nhà gái"');
    expect(bride).toContain('value="2026-12-19"');
    expect(bride).toContain('value="09:00"');
    expect(groom).toContain("Chưa có — sẽ tạo mới.");
    expect(groom).not.toContain("Lễ Vu Quy nhà gái");
  });

  it("several non-primary same-side ceremonies are not silently picked", () => {
    const html = render([brideEvent({ id: "a" }), brideEvent({ id: "b" })]);
    expect(html).toContain("chưa có sự kiện chính");
  });
});
