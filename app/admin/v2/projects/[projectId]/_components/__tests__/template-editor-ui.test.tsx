import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { lookupTemplateEditorManifest } from "../../../../../../../templates/core/production-editor-manifests";
import type { EditorReadiness } from "../../../../../../../lib/server/template-editor/editor-readiness";
import type { PhotoLibraryItem } from "../../../../../../../lib/server/template-editor/photo-library";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/v2/projects/x", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({}));

const { TemplateMediaSlotEditorView, PhotoPicker, SHARED_SLOTS_NOTE } = await import("../template-media-slot-editor");
const { OptionalInvitationContent } = await import("../optional-invitation-content");
const { NoTemplateCard } = await import("../data-tab");
const { EditorReadinessView } = await import("../editor-readiness-panel");
const { DesignAssignmentView } = await import("../design-tab");

/**
 * TE-05A — template-first Staff editor UI. Static render checks only (no DOM
 * runtime); interaction rules are covered by lib/admin/template-slot-editor.
 */

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "22222222-2222-4222-8222-222222222222";
const VH = lookupTemplateEditorManifest("wedding.vietnamese-heritage.v1")!;
const EE = lookupTemplateEditorManifest("wedding.elegant-editorial.v1")!;
const noop = () => {};

function photo(n: number, mediaType: PhotoLibraryItem["mediaType"] = "PHOTO", previewUrl: string | null = `https://signed.example/${n}`): PhotoLibraryItem {
  return { id: `33333333-3333-4333-8333-33333333330${n}`, mediaType, mimeType: "image/webp", sizeBytes: 1000, width: 1200, height: 1600, createdAt: "2026-10-01T00:00:00Z", previewUrl };
}
const LIBRARY = [photo(1), photo(2, "COVER"), photo(3, "GALLERY"), photo(4, "PORTRAIT_GROOM", null)];

describe("TemplateMediaSlotEditorView", () => {
  const html = renderToStaticMarkup(
    <TemplateMediaSlotEditorView
      projectId={PROJECT_ID}
      templateVersionId={VERSION_ID}
      manifest={VH}
      initialLibrary={LIBRARY}
      initialAssignments={{ portraitCluster: [LIBRARY[0]!.id, LIBRARY[1]!.id], gallery: [LIBRARY[0]!.id] }}
      onSaved={noop}
    />,
  );

  it("renders one card per manifest slot, in manifest order, with label/hint/requirement", () => {
    const keys = [...html.matchAll(/data-template-slot="([^"]+)"/g)].map((match) => match[1]);
    expect(keys).toEqual(VH.mediaSlots.map((slot) => slot.key));
    for (const slot of VH.mediaSlots) {
      expect(html).toContain(slot.label);
    }
    expect(html).toContain("Nên có");
    expect(html).toContain("Tuỳ chọn");
  });

  it("shows positions #1/#2 and counts from the manifest; never groom/couple/bride labels", () => {
    expect(html).toContain("#1");
    expect(html).toContain("#2");
    expect(html).toMatch(/data-slot-count="?"?[^>]*>2\/3</);
    expect(html).not.toMatch(/>\s*(Chú rể|Cặp đôi|Cô dâu)\s*</);
  });

  it("the same photo appears in two slots; the shared-variant note is shown", () => {
    expect(html.split(`src="https://signed.example/1"`).length - 1).toBeGreaterThanOrEqual(3);
    expect(html).toContain(SHARED_SLOTS_NOTE);
  });

  it("shows the photo library with legacy photos and an unsigned placeholder; no storage path", () => {
    expect(html).toContain("Thêm ảnh vào thư viện");
    expect(html).toContain("Ảnh bìa (cũ)");
    expect(html).toContain("Không xem được");
    expect(html).not.toMatch(/storagePath|project-media\//);
  });

  it("has no fixed-width table (cards stack on phones)", () => {
    expect(html).not.toMatch(/<table|min-w-\[|w-\[\d{3,}px\]/);
  });
});

describe("PhotoPicker", () => {
  const cluster = VH.mediaSlots.find((slot) => slot.key === "portraitCluster")!;

  it("disables photos already in the slot and labels legacy photos", () => {
    const html = renderToStaticMarkup(<PhotoPicker slot={cluster} current={[LIBRARY[0]!.id]} library={LIBRARY} onCancel={noop} onConfirm={noop} />);
    expect(html).toMatch(new RegExp(`disabled=""[^>]*data-picker-photo="${LIBRARY[0]!.id}"|data-picker-photo="${LIBRARY[0]!.id}"[^>]*disabled=""`));
    expect(html).toContain("Đã có trong mục này");
    expect(html).toContain("Album (cũ)");
    expect(html).toContain("Có thể chọn thêm 2 ảnh");
    expect(html).toContain("min-h-11");
  });

  it("SINGLE explains replacement", () => {
    const hero = VH.mediaSlots.find((slot) => slot.key === "heroPhoto")!;
    expect(renderToStaticMarkup(<PhotoPicker slot={hero} current={[]} library={LIBRARY} onCancel={noop} onConfirm={noop} />)).toContain("Chọn 1 ảnh (thay ảnh hiện tại).");
  });
});

describe("OptionalInvitationContent media model", () => {
  it("TEMPLATE_SLOTS shows the slot editor and no legacy layout role editor", () => {
    const html = renderToStaticMarkup(<OptionalInvitationContent projectId={PROJECT_ID} templateVersionId={VERSION_ID} manifest={VH} />);
    expect(html).toContain('data-media-model="TEMPLATE_SLOTS"');
    expect(html).toContain("Ảnh của mẫu thiệp");
    expect(html).toContain("Âm thanh &amp; ảnh chia sẻ");
  });

  it("LEGACY_ROLES keeps the legacy media editor and no slot editor", () => {
    const html = renderToStaticMarkup(<OptionalInvitationContent projectId={PROJECT_ID} templateVersionId={VERSION_ID} manifest={EE} />);
    expect(html).toContain('data-media-model="LEGACY_ROLES"');
    expect(html).toContain("Ảnh &amp; âm thanh");
    expect(html).not.toContain("Ảnh của mẫu thiệp");
  });
});

describe("template-first presentation", () => {
  it("no-template card points to the Design tab", () => {
    const html = renderToStaticMarkup(<NoTemplateCard title="Chưa chọn mẫu thiệp" message="Chọn mẫu trước để WeddingClick hiển thị đúng các nội dung và ảnh mà mẫu này cần." />);
    expect(html).toContain("Chưa chọn mẫu thiệp");
    expect(html).toContain('href="?tab=DESIGN"');
    expect(html).toContain("Chọn mẫu thiệp");
  });

  it("readiness shows statuses without a percentage and neutral NOT_USED", () => {
    const readiness: EditorReadiness = {
      overall: "WARNING",
      items: [
        { key: "COUPLE", kind: "CONTENT", label: "Cô dâu & chú rể", status: "COMPLETE", message: "Đã có tên cô dâu và chú rể" },
        { key: "portraitCluster", kind: "MEDIA_SLOT", label: "Cụm ảnh ba khung", status: "WARNING", message: "Đã có 2/3 ảnh" },
        { key: "MUSIC", kind: "CONTENT", label: "Nhạc nền", status: "NOT_USED", message: "Không sử dụng" },
      ],
      nextAction: "Thêm 1 ảnh vào Cụm ảnh ba khung",
    };
    const html = renderToStaticMarkup(<EditorReadinessView readiness={readiness} templateName="Vietnamese Heritage" />);
    expect(html).toContain("Tiến độ nội dung — Vietnamese Heritage");
    expect(html).toContain("Thêm 1 ảnh vào Cụm ảnh ba khung");
    expect(html).not.toMatch(/\d+\s*%/);
    expect(html).toMatch(/data-readiness-status="NOT_USED"[\s\S]*?text-slate-400/);
    expect(html).not.toMatch(/data-readiness-status="NOT_USED"[^]*?text-red/);
  });

  it("after a successful save the Design tab offers 'Tiếp tục nhập nội dung'", () => {
    const html = renderToStaticMarkup(
      <DesignAssignmentView
        projectId={PROJECT_ID}
        project={{ eventType: "WEDDING" }}
        catalog={[]}
        design={null}
        selectedVersionId=""
        onSelect={noop}
        onSave={noop}
        saveStatus={{ kind: "SAVED" }}
      />,
    );
    expect(html).toContain("Tiếp tục nhập nội dung");
    expect(html).toContain('href="?tab=DATA"');
  });

  it("the Data tab no longer renders template-specific content without a template", () => {
    const source = readFileSync(join(process.cwd(), "app/admin/v2/projects/[projectId]/_components/data-tab.tsx"), "utf8");
    expect(source).toMatch(/data\.design === null[\s\S]*NoTemplateCard/);
    expect(source).not.toMatch(/<OptionalInvitationContent projectId=\{project\.id\} \/>/);
  });
});
