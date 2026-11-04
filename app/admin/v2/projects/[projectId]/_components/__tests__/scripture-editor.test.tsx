import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SCRIPTURE_DEFAULT_REFERENCE, SCRIPTURE_DEFAULT_VERSE } from "../../../../../../../lib/admin/scripture-settings-editor";
import type { ProjectDesignRecord } from "../../../../../../../lib/server/project-design/project-design-types";
import { lookupTemplateEditorManifest } from "../../../../../../../templates/core/production-editor-manifests";
import { PRODUCTION_RENDERER_MANIFESTS } from "../../../../../../../templates/core/production-renderer-manifests";

// The admin API client reads a Supabase session at module load in the browser.
vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({
  fetchProjectDesign: vi.fn(),
  saveProjectDesign: vi.fn(),
}));

const { ScriptureEditorView } = await import("../scripture-editor");
const { OptionalInvitationContent } = await import("../optional-invitation-content");

/**
 * HA-CONTENT-01 — the "Cấu hình Lời Chúa" card: its fields and limits, and
 * the rule that it appears only for a template version whose design manifest
 * declares the two settings.
 */

const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const VERSION_ID = "11111111-1111-4111-8111-111111111111";

const designManifestOf = (rendererKey: string) =>
  PRODUCTION_RENDERER_MANIFESTS.find((entry) => entry.compatibility.rendererKey === rendererKey)!.design;

function design(designSettings: Record<string, string | number | boolean>): ProjectDesignRecord {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    projectId: PROJECT_ID,
    templateVersionId: VERSION_ID,
    paletteKey: "hong-an-ivory",
    fontPresetKey: "hong-an-cathedral",
    effectPresetKey: "STANDARD",
    sectionSettings: {},
    designSettings,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };
}

const card = (initialDesign: ProjectDesignRecord | null) =>
  renderToStaticMarkup(
    <ScriptureEditorView projectId={PROJECT_ID} templateVersionId={VERSION_ID} initialDesign={initialDesign} onSaved={() => {}} />,
  );

describe("ScriptureEditorView", () => {
  it("shows the heading, both fields and both actions", () => {
    const html = card(design({}));
    expect(html).toContain("Cấu hình Lời Chúa");
    expect(html).toContain("Nội dung câu Lời Chúa");
    expect(html).toContain("Nguồn trích dẫn");
    expect(html).toContain("<textarea");
    expect(html).toContain('type="text"');
    expect(html).toContain(">Lưu<");
    expect(html).toContain("Khôi phục mặc định");
  });

  it("enforces the 500 and 80 character limits on the inputs themselves", () => {
    const html = card(design({}));
    expect(html).toContain('maxLength="500"');
    expect(html).toContain('maxLength="80"');
  });

  it("leaves both fields empty with no override, showing the default as placeholder only", () => {
    const html = card(design({}));
    // The default is offered as guidance, never prefilled as a value — a
    // prefill would store the default as an override on the next save.
    expect(html).toContain(`placeholder="${SCRIPTURE_DEFAULT_VERSE}"`);
    expect(html).toContain(`placeholder="${SCRIPTURE_DEFAULT_REFERENCE}"`);
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/);
    expect(html).toContain('value=""');
    expect(html).not.toMatch(/value="Điều gì Thiên Chúa/);
  });

  it("prefills the Project's own override when there is one", () => {
    const html = card(design({ scriptureVerse: "Câu riêng của gia đình.", scriptureReference: "Ga 2,1" }));
    expect(html).toContain("Câu riêng của gia đình.");
    expect(html).toContain('value="Ga 2,1"');
  });

  it("says plainly that a custom verse without a reference is left unattributed", () => {
    expect(card(design({}))).toContain(`không tự gán ${SCRIPTURE_DEFAULT_REFERENCE}`);
  });

  it("says it is a draft and never claims to publish", () => {
    const html = card(design({}));
    expect(html).toContain("chưa xuất bản");
    expect(html).not.toMatch(/xuất bản ngay|published/i);
  });

  it("shows no success state before a save is confirmed", () => {
    expect(card(design({}))).not.toContain("Đã lưu.");
  });
});

describe("the card is offered by the design manifest, never by a renderer key", () => {
  const renderContent = (rendererKey: string) => {
    const manifest = lookupTemplateEditorManifest(rendererKey)!;
    return renderToStaticMarkup(
      <OptionalInvitationContent
        projectId={PROJECT_ID}
        templateVersionId={VERSION_ID}
        manifest={manifest}
        designManifest={designManifestOf(rendererKey)}
      />,
    );
  };

  // `ScriptureEditor` fetches the design row, so static markup shows its own
  // loading state — a label no other card uses.
  const SCRIPTURE_CARD = "Đang tải cấu hình Lời Chúa";

  it("shows it for wedding.hong-an.v2", () => {
    expect(renderContent("wedding.hong-an.v2")).toContain(SCRIPTURE_CARD);
  });

  it("shows it for no other production template, Hồng Ân v1 included", () => {
    const others = PRODUCTION_RENDERER_MANIFESTS.map((entry) => entry.compatibility.rendererKey).filter(
      (key) => key !== "wedding.hong-an.v2",
    );
    // Every other registered renderer, so a future template cannot acquire
    // the card by accident.
    expect(others).toContain("wedding.hong-an.v1");
    expect(others.length).toBeGreaterThan(5);
    for (const rendererKey of others) {
      expect(renderContent(rendererKey), rendererKey).not.toContain(SCRIPTURE_CARD);
      expect(renderContent(rendererKey), rendererKey).not.toContain("Cấu hình Lời Chúa");
    }
  });

  it("names no renderer key in the Staff editor source", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const file of ["optional-invitation-content.tsx", "scripture-editor.tsx"]) {
      const code = readFileSync(join(__dirname, "..", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/wedding\.[\w-]+\.v\d+/);
    }
  });
});
