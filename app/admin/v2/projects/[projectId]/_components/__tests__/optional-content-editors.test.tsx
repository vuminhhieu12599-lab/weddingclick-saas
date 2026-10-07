import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { MediaType } from "../../../../../../../lib/domain";
import type { ProjectMediaRecord } from "../../../../../../../lib/server/media/media-types";

/** Optional content editors: role separation, no caps, empty states, no fabricated values, boundaries. */

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({}));

const { MediaEditorView } = await import("../media-editor");
const { TimelineEditorView } = await import("../timeline-editor");
const { DressCodeEditorView } = await import("../dress-code-editor");
const { OptionalInvitationContent } = await import("../optional-invitation-content");
const { FamilyEditorView } = await import("../family-editor");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const noop = () => {};

function media(index: number, mediaType: MediaType, sortOrder = index): ProjectMediaRecord {
  const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  return {
    id,
    projectId: PROJECT_ID,
    mediaType,
    storageBucket: "project-media",
    storagePath: `p/${id}`,
    mimeType: "image/jpeg",
    sizeBytes: 2048,
    width: null,
    height: null,
    altText: null,
    sortOrder,
    createdBy: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
}

function roleBlock(html: string, role: MediaType): string {
  const start = html.indexOf(`data-media-role="${role}"`);
  const next = html.indexOf("data-media-role=", start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

describe("MediaEditorView", () => {
  const rows = [
    media(1, "COVER", 1),
    media(2, "COVER", 0),
    ...Array.from({ length: 23 }, (_, i) => media(100 + i, "GALLERY")),
    media(200, "PHOTO_STORY"),
    media(300, "QR_GROOM"),
  ];
  const html = renderToStaticMarkup(<MediaEditorView projectId={PROJECT_ID} initialMedia={rows} onSaved={noop} />);

  it("renders one card per Snapshot role and none for QR roles", () => {
    const roles = [...html.matchAll(/data-media-role="([A-Z_]+)"/g)].map((match) => match[1]);
    expect(roles).toEqual([
      "COVER",
      "PORTRAIT_GROOM",
      // VH-M01: the couple portrait sits between the two side portraits.
      "PORTRAIT_COUPLE",
      "PORTRAIT_BRIDE",
      "PHOTO_STORY",
      "LOVE_STORY_PHOTO",
      "GALLERY",
      "AUDIO",
      "SOCIAL_SHARE_COVER",
    ]);
    // Social Share Cover: its own card, honest empty state, never shown as COVER.
    expect(roleBlock(html, "SOCIAL_SHARE_COVER")).toContain("Ảnh chia sẻ mạng xã hội");
    expect(roleBlock(html, "SOCIAL_SHARE_COVER")).toContain("Chưa chọn ảnh chia sẻ.");
    expect(html).not.toMatch(/QR_/);
  });

  it("SINGLE role marks exactly the first row (sort_order → id) as in use", () => {
    const cover = roleBlock(html, "COVER");
    expect(cover.match(/Đang dùng/g)).toHaveLength(1);
    expect(cover).toContain("Bản cũ");
  });

  it("GALLERY lists every item (no 10-item cap); PHOTO_STORY keeps its own items", () => {
    expect(roleBlock(html, "GALLERY")).toContain("#23");
    expect(roleBlock(html, "PHOTO_STORY").match(/<li/g)).toHaveLength(1);
    expect(roleBlock(html, "LOVE_STORY_PHOTO")).toContain("Chưa có tệp.");
  });
});

describe("TimelineEditorView / DressCodeEditorView", () => {
  it("empty Timeline shows an empty state and no invented rows", () => {
    const html = renderToStaticMarkup(<TimelineEditorView projectId={PROJECT_ID} initialItems={[]} onSaved={noop} />);
    expect(html).toContain("Chưa có mục lịch trình.");
    expect(html).not.toMatch(/value="[^"]+"/);
  });

  it("no Dress Code shows an empty state with no default description or colours", () => {
    const html = renderToStaticMarkup(<DressCodeEditorView projectId={PROJECT_ID} initial={null} onSaved={noop} />);
    expect(html).toContain("Chưa có Dress Code.");
    expect(html).toContain("Tạo Dress Code");
    expect(html).not.toMatch(/#[0-9a-f]{6}/i);
  });
});

describe("FamilyEditorView", () => {
  it("groups groom then bride family with Vietnamese labels and no invented values", () => {
    const html = renderToStaticMarkup(<FamilyEditorView projectId={PROJECT_ID} initialDetails={null} onSaved={noop} />);
    expect(html.indexOf("Gia đình nhà trai")).toBeLessThan(html.indexOf("Gia đình nhà gái"));
    expect(html).toContain("Tên bố chú rể");
    expect(html).toContain("Tên mẹ cô dâu");
    expect(html).not.toMatch(/value="[^"]+"/);
  });
});

describe("OptionalInvitationContent", () => {
  it("shows no preview link before any confirmed save", () => {
    const html = renderToStaticMarkup(<OptionalInvitationContent projectId={PROJECT_ID} />);
    expect(html).toContain("Ảnh &amp; âm thanh");
    expect(html).not.toContain("Xem trước thiệp");
  });
});

describe("static boundaries", () => {
  const root = join(__dirname, "..", "..", "..", "..", "..", "..", "..");
  const read = (file: string) =>
    readFileSync(join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const files = [
    "app/admin/v2/projects/[projectId]/_components/media-editor.tsx",
    "app/admin/v2/projects/[projectId]/_components/timeline-editor.tsx",
    "app/admin/v2/projects/[projectId]/_components/dress-code-editor.tsx",
    "app/admin/v2/projects/[projectId]/_components/gift-content-editor.tsx",
    "app/admin/v2/projects/[projectId]/_components/family-editor.tsx",
    "app/admin/v2/projects/[projectId]/_components/optional-invitation-content.tsx",
    "lib/admin/optional-content-editor.ts",
    "lib/admin/signed-media-upload.ts",
    "lib/admin/image-upload-optimizer.ts",
    "lib/server/routes/project-timeline.ts",
    "lib/server/routes/project-dress-code.ts",
    "lib/server/project-timeline/manage-project-timeline.ts",
    "lib/server/project-dress-code/manage-project-dress-code.ts",
    "lib/server/supabase/project-timeline-repository.ts",
    "lib/server/supabase/project-dress-code-repository.ts",
  ];

  it("no service role, publish, invitation_versions, RSVP, design or template-catalog path", () => {
    for (const file of files) {
      expect(read(file), file).not.toMatch(
        /service_role|SERVICE_ROLE|serviceRole|invitation_versions|\/publish|rsvp|project_design|template_versions|templates\/wedding/i,
      );
    }
  });

  it("server writes touch only projects (read) and the Timeline / Dress Code tables", () => {
    const tables = ["lib/server/supabase/project-timeline-repository.ts", "lib/server/supabase/project-dress-code-repository.ts"]
      .flatMap((file) => [...read(file).matchAll(/\.from\("([a-z_]+)"\)/g)].map((match) => match[1]));
    expect(new Set(tables)).toEqual(
      new Set(["projects", "project_timeline_items", "project_dress_codes", "project_dress_code_swatches"]),
    );
  });

  it("the browser only uploads to a server-issued signed path; the API client never touches Supabase", () => {
    expect(read("lib/admin/signed-media-upload.ts")).toMatch(/uploadToSignedUrl\(storagePath, token/);
    expect(read("lib/admin/signed-media-upload.ts")).not.toMatch(/\.upload\(|\.insert\(|\.remove\(/);
    const client = read("lib/admin/admin-api-client.ts");
    expect(client).not.toMatch(/supabase|\.from\(/);
    expect(client.indexOf("media/upload-intent")).toBeLessThan(client.indexOf("media/finalize"));
  });

  it("image roles say they are optimizing while uploading; AUDIO keeps the plain upload label", () => {
    const editor = read("app/admin/v2/projects/[projectId]/_components/media-editor.tsx");
    expect(editor).toMatch(/isOptimizableImageMediaType\(role\.mediaType\) \? "Đang tối ưu và tải" : "Đang tải"/);
    expect(editor).toContain("${progressVerb} ${index + 1}/${toUpload.length}...");
  });

  it("the preview link is gated on a confirmed save", () => {
    const container = read("app/admin/v2/projects/[projectId]/_components/optional-invitation-content.tsx");
    expect(container).toMatch(/savedAny && \(\s*<Link\s+href=\{`\/admin\/v2\/projects\/\$\{encodeURIComponent\(projectId\)\}\/preview`\}/);
  });
});
