import { renderToStaticMarkup } from "react-dom/server";
import { lookupTemplateEditorManifest } from "../../../../../../../templates/core/production-editor-manifests";
import { describe, expect, it, vi } from "vitest";

import type { ProjectDesignRecord } from "../../../../../../../lib/server/project-design/project-design-types";
import type { TemplateCatalogEntry } from "../../../../../../../lib/server/templates/templates-types";

/** Design tab view: current state, exact explicit selection, save gating and the preview link. */

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({
  fetchTemplateCatalog: vi.fn(),
  fetchProjectDesign: vi.fn(),
  saveProjectDesign: vi.fn(),
}));

const { DesignAssignmentView } = await import("../design-tab");
type SaveStatus = import("../design-tab").SaveStatus;

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "aaaaaaaa-0000-4000-8000-000000000001";

const CATALOG: TemplateCatalogEntry[] = [
  {
    id: "cccccccc-0000-4000-8000-000000000001",
    code: "fixture-editorial",
    eventType: "WEDDING",
    name: "Fixture Editorial",
    description: null,
    isActive: true,
    sortOrder: 1,
    previewMediaPath: null,
    versions: [
      {
        id: VERSION_ID,
        versionNumber: 1,
        rendererKey: "wedding.fixture-editorial.v1",
        designManifest: {
          schemaVersion: 1,
          palettes: ["p"],
          fontPresets: ["f"],
          effectPresets: ["STANDARD"],
          sectionSettingsSchema: {},
          designSettingsSchema: {},
        },
        editorManifest: lookupTemplateEditorManifest("wedding.elegant-editorial.v1")!,
        retiredAt: null,
        selectable: true,
      },
    ],
  },
];

const DESIGN: ProjectDesignRecord = {
  id: "dddddddd-0000-4000-8000-000000000001",
  projectId: PROJECT_ID,
  templateVersionId: VERSION_ID,
  paletteKey: "p",
  fontPresetKey: "f",
  effectPresetKey: "STANDARD",
  sectionSettings: {},
  designSettings: {},
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

function render(design: ProjectDesignRecord | null, selectedVersionId: string, saveStatus: SaveStatus = { kind: "IDLE" }) {
  return renderToStaticMarkup(
    <DesignAssignmentView
      projectId={PROJECT_ID}
      project={{ eventType: "WEDDING" }}
      catalog={CATALOG}
      design={design}
      selectedVersionId={selectedVersionId}
      onSelect={() => {}}
      onSave={() => {}}
      saveStatus={saveStatus}
    />,
  );
}

describe("DesignAssignmentView", () => {
  it("no current design: shows 'Chưa chọn mẫu', nothing pre-selected, save disabled, no preview link", () => {
    const html = render(null, "");
    // TE-05A: template choice is presented as the primary first step.
    expect(html).toContain("Bước 1 — Chọn mẫu thiệp");
    expect(html).toContain("Chưa chọn mẫu");
    expect(html).toContain("Fixture Editorial — phiên bản 1");
    expect(html).not.toContain("checked");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Lưu mẫu<\/button>/);
    expect(html).not.toContain("Xem trước thiệp");
  });

  it("explicit selection enables 'Lưu mẫu'", () => {
    const html = render(null, VERSION_ID);
    expect(html).toContain("checked");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Lưu mẫu<\/button>/);
  });

  it("after a successful save: shows the assigned template and an obvious preview link", () => {
    const html = render(DESIGN, VERSION_ID, { kind: "SAVED" });
    expect(html).toContain("Fixture Editorial — phiên bản 1");
    expect(html).toContain(`href="/admin/v2/projects/${PROJECT_ID}/preview"`);
    expect(html).toContain("Xem trước thiệp");
    expect(html).toContain("chưa xuất bản");
  });

  it("save failure is reported, never shown as success", () => {
    const html = render(null, VERSION_ID, { kind: "ERROR", message: "Không thể lưu mẫu: boom" });
    expect(html).toContain("Không thể lưu mẫu: boom");
    expect(html).not.toContain("Đã lưu mẫu thiệp");
  });
});

describe("DesignAssignmentView — TE-05A-H1 unsupported renderer", () => {
  const UNSUPPORTED_ID = "99999999-9999-4999-8999-999999999999";
  const withUnsupported: TemplateCatalogEntry[] = [
    {
      ...CATALOG[0]!,
      versions: [
        ...CATALOG[0]!.versions,
        { ...CATALOG[0]!.versions[0]!, id: UNSUPPORTED_ID, versionNumber: 9, rendererKey: "wedding.unknown.v9", editorManifest: null, selectable: false },
      ],
    },
  ];
  const view = (design: ProjectDesignRecord | null, selected: string) =>
    renderToStaticMarkup(
      <DesignAssignmentView
        projectId={PROJECT_ID}
        project={{ eventType: "WEDDING" }}
        catalog={withUnsupported}
        design={design}
        selectedVersionId={selected}
        onSelect={() => {}}
        onSave={() => {}}
        saveStatus={{ kind: "IDLE" }}
      />,
    );

  it("an unsupported version is not offered for new selection", () => {
    const html = view(null, "");
    expect(html).not.toContain(`value="${UNSUPPORTED_ID}"`);
    expect(html).not.toContain("phiên bản 9");
  });

  it("an unsupported CURRENT version stays visible with a warning, is marked, and cannot be re-saved as a new pick", () => {
    const current = { ...DESIGN, templateVersionId: UNSUPPORTED_ID };
    const html = view(current, UNSUPPORTED_ID);
    expect(html).toContain("Mẫu này không còn được hệ thống hỗ trợ.");
    expect(html).toContain("data-unsupported-version");
    expect(html).toContain(`value="${UNSUPPORTED_ID}"`);
  });
});
