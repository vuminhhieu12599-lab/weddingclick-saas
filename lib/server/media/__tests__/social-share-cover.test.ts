import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MEDIA_TYPES, allowedMimeTypesForMediaType, IMAGE_MEDIA_MIME_TYPES, type MediaType } from "../../../domain";
import { buildSnapshotPayload } from "../../../invitation-rendering/build-snapshot-payload";
import { buildRendererFixtureSourceInput } from "../../../../templates/core/fixtures/renderer-fixture-sources";
import type { ProjectMediaRecord } from "../media-types";
import { selectEffectiveSocialShareCover } from "../social-share-cover";
import { validateFinalizeMediaInput } from "../validate-finalize-media-input";
import { validateUploadIntentInput } from "../validate-upload-intent-input";

/** Social Share Cover (PO decision): own image role, independent of COVER, never in the Snapshot. */

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function row(id: string, mediaType: MediaType, sortOrder: number): ProjectMediaRecord {
  return {
    id,
    projectId: PROJECT_ID,
    mediaType,
    storageBucket: "project-media",
    storagePath: `${PROJECT_ID}/${id}`,
    mimeType: "image/jpeg",
    sizeBytes: 1000,
    width: 1200,
    height: 630,
    altText: null,
    sortOrder,
    createdBy: null,
    createdAt: "2026-10-03T00:00:00Z",
    updatedAt: "2026-10-03T00:00:00Z",
  };
}

describe("SOCIAL_SHARE_COVER role", () => {
  it("is a distinct image role accepted by upload-intent and finalize, with dimensions", () => {
    expect(MEDIA_TYPES).toContain("SOCIAL_SHARE_COVER");
    expect(allowedMimeTypesForMediaType("SOCIAL_SHARE_COVER")).toBe(IMAGE_MEDIA_MIME_TYPES);
    expect(validateUploadIntentInput({ mediaType: "SOCIAL_SHARE_COVER", mimeType: "image/jpeg", sizeBytes: 1000 }).mediaType).toBe(
      "SOCIAL_SHARE_COVER",
    );
    const storagePath = `${PROJECT_ID}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
    expect(validateFinalizeMediaInput({ mediaType: "SOCIAL_SHARE_COVER", storagePath, width: 1200, height: 630 }, PROJECT_ID)).toMatchObject({
      mediaType: "SOCIAL_SHARE_COVER",
      width: 1200,
      height: 630,
    });
    expect(() => validateUploadIntentInput({ mediaType: "SOCIAL_SHARE_COVER", mimeType: "audio/mpeg", sizeBytes: 1000 })).toThrow();
  });

  it("effective item: first by sort_order then id, among SOCIAL_SHARE_COVER rows only; never COVER", () => {
    const rows = [row("c0", "COVER", -9), row("s-b", "SOCIAL_SHARE_COVER", 0), row("s-a", "SOCIAL_SHARE_COVER", 0), row("s-old", "SOCIAL_SHARE_COVER", 3)];
    expect(selectEffectiveSocialShareCover(rows)?.id).toBe("s-a");
    expect(selectEffectiveSocialShareCover([row("c0", "COVER", 0), row("g", "GALLERY", 0)])).toBeNull();
    expect(selectEffectiveSocialShareCover([])).toBeNull();
  });

  it("never enters the Snapshot: a project with a social-share row builds the identical payload", () => {
    const input = buildRendererFixtureSourceInput({ variant: "COMMON" });
    const withShare = {
      ...input,
      media: [...input.media, { id: "99999999-9999-4999-8999-999999999999", projectId: input.project.id, mediaType: "SOCIAL_SHARE_COVER" as const, sortOrder: -1 }],
    };
    expect(buildSnapshotPayload(withShare)).toStrictEqual(buildSnapshotPayload(input));
    expect(JSON.stringify(buildSnapshotPayload(withShare))).not.toContain("99999999-9999-4999-8999-999999999999");
  });
});

describe("migration 0035", () => {
  const sql = readFileSync(
    join(__dirname, "..", "..", "..", "..", "supabase", "migrations", "20260911041155_0035_project_media_social_share_cover_type.sql"),
    "utf8",
  );
  const code = sql.replace(/--.*$/gm, "");

  it("recreates the media_type CHECK with every previous role plus SOCIAL_SHARE_COVER, in domain order", () => {
    const values = [...code.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
    expect(values).toEqual([...MEDIA_TYPES]);
  });

  it("is additive only: the one constraint and its comment, no data or other object touched", () => {
    const statements = code.split(/;\s*$/m).map((statement) => statement.trim()).filter(Boolean);
    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/^ALTER TABLE public\.project_media\s+DROP CONSTRAINT project_media_media_type_check$/);
    expect(statements[1]).toMatch(/^ALTER TABLE public\.project_media\s+ADD CONSTRAINT project_media_media_type_check CHECK/);
    expect(statements[2]).toMatch(/^COMMENT ON CONSTRAINT project_media_media_type_check ON public\.project_media IS/);
    expect(code).not.toMatch(/\b(UPDATE|DELETE|INSERT|DROP TABLE|GRANT|POLICY|service_role)\b/i);
  });
});
