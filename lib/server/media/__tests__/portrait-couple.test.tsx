import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { IMAGE_MEDIA_MAX_BYTES, IMAGE_MEDIA_MIME_TYPES, MEDIA_TYPES, allowedMimeTypesForMediaType, maxBytesForMediaType } from "../../../domain";
import { OPTIMIZED_MAX_LONG_EDGE, OPTIMIZED_WEBP_QUALITY, isOptimizableImageMediaType, optimizeImageForUpload } from "../../../admin/image-upload-optimizer";
import { MEDIA_EDITOR_ROLES, validateMediaFile } from "../../../admin/optional-content-editor";
import { buildInvitationViewModel } from "../../../invitation-rendering/build-invitation-view-model";
import { buildSnapshotPayload } from "../../../invitation-rendering/build-snapshot-payload";
import { extractSnapshotMediaRefs } from "../../../invitation-rendering/extract-snapshot-media-refs";
import type { BuildSnapshotPayloadInput, SnapshotPayloadV1 } from "../../../invitation-rendering/snapshot-payload-types";
import { createFixtureMediaResolver, fixtureMediaUrl } from "../../../../templates/core/fixtures/fixture-media-resolver";
import { runRendererFixturePipeline } from "../../../../templates/core/fixtures/renderer-fixture-pipeline";
import { FIXTURE_MEDIA_IDS, FIXTURE_PROJECT_ID, buildRendererFixtureSourceInput } from "../../../../templates/core/fixtures/renderer-fixture-sources";
import { assertStoredReviewSnapshot } from "../../invitation-review/assert-stored-review-snapshot";
import { validateFinalizeMediaInput } from "../validate-finalize-media-input";
import { validateUploadIntentInput } from "../validate-upload-intent-input";

vi.mock("../../../../templates/wedding/elegant-editorial/v1/fonts", () => ({
  ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables",
}));

const { ElegantEditorialV1 } = await import("../../../../templates/wedding/elegant-editorial/v1/elegant-editorial-v1");

/**
 * VH-M01 — PORTRAIT_COUPLE media role (docs/DECISIONS.md "VH-M01", Product
 * Owner correction 2026-10-07): an independent, optional, single-effective
 * image role, additive in Snapshot v1 and the ViewModel, never substituted.
 */

const COUPLE_A = "00000000-0000-4000-8000-0000000002c1";
const COUPLE_B = "00000000-0000-4000-8000-0000000002c2";
const COUPLE_OLD = "00000000-0000-4000-8000-0000000002c3";

type MediaRow = BuildSnapshotPayloadInput["media"][number];

function coupleRow(id: string, sortOrder: number): MediaRow {
  return { id, projectId: FIXTURE_PROJECT_ID, mediaType: "PORTRAIT_COUPLE", sortOrder };
}

function withMedia(input: BuildSnapshotPayloadInput, extra: readonly MediaRow[]): BuildSnapshotPayloadInput {
  return { ...input, media: [...input.media, ...extra] };
}

function payloadOf(input: BuildSnapshotPayloadInput): SnapshotPayloadV1 {
  const built = buildSnapshotPayload(input);
  if (built.status !== "SUCCESS") throw new Error("expected SUCCESS");
  return built.payload;
}

describe("1. domain", () => {
  it("MEDIA_TYPES contains PORTRAIT_COUPLE once, appended last; image upload policy", () => {
    expect(MEDIA_TYPES.filter((type) => type === "PORTRAIT_COUPLE")).toHaveLength(1);
    expect(MEDIA_TYPES.at(-1)).toBe("PORTRAIT_COUPLE");
    expect(allowedMimeTypesForMediaType("PORTRAIT_COUPLE")).toBe(IMAGE_MEDIA_MIME_TYPES);
    expect(maxBytesForMediaType("PORTRAIT_COUPLE")).toBe(IMAGE_MEDIA_MAX_BYTES);
  });
});

describe("2. migration 0045", () => {
  const dir = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");
  const sql = readFileSync(join(dir, "20260911041205_0045_project_media_portrait_couple_type.sql"), "utf8");
  const code = sql.replace(/--.*$/gm, "");
  const previous = readFileSync(join(dir, "20260911041155_0035_project_media_social_share_cover_type.sql"), "utf8").replace(/--.*$/gm, "");

  it("recreates the CHECK with every previous role (0035, in order) plus PORTRAIT_COUPLE, matching the domain list", () => {
    const values = [...code.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
    const before = [...previous.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
    expect(values).toEqual([...before, "PORTRAIT_COUPLE"]);
    expect(values).toEqual([...MEDIA_TYPES]);
  });

  it("only drops/adds the one named CHECK and comments it: no table, column, index, trigger, RLS, grant, Storage or data change", () => {
    const statements = code.split(/;\s*$/m).map((statement) => statement.trim()).filter(Boolean);
    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/^ALTER TABLE public\.project_media\s+DROP CONSTRAINT project_media_media_type_check$/);
    expect(statements[1]).toMatch(/^ALTER TABLE public\.project_media\s+ADD CONSTRAINT project_media_media_type_check CHECK \(\s*media_type IN \(/);
    expect(statements[2]).toMatch(/^COMMENT ON CONSTRAINT project_media_media_type_check ON public\.project_media IS/);
    expect(code).not.toMatch(
      /\b(UPDATE|DELETE|INSERT|CREATE|DROP TABLE|ADD COLUMN|UNIQUE|INDEX|TRIGGER|GRANT|REVOKE|POLICY|ROW LEVEL|storage\.|service_role)\b/i,
    );
  });
});

describe("3. upload and Staff media editor", () => {
  it("exposes a separate SINGLE 'Ảnh cặp đôi' slot between the side portraits, distinct from Ảnh bìa", () => {
    const roles = MEDIA_EDITOR_ROLES.map((role) => role.mediaType);
    expect(roles.slice(0, 4)).toEqual(["COVER", "PORTRAIT_GROOM", "PORTRAIT_COUPLE", "PORTRAIT_BRIDE"]);
    const couple = MEDIA_EDITOR_ROLES.find((role) => role.mediaType === "PORTRAIT_COUPLE");
    expect(couple).toMatchObject({ label: "Ảnh cặp đôi", cardinality: "SINGLE" });
    expect(couple?.hint).toContain("Tách biệt với Ảnh bìa");
    expect(MEDIA_EDITOR_ROLES.find((role) => role.mediaType === "COVER")?.label).toBe("Ảnh bìa");
  });

  it("uses the normal image MIME/size policy on the client and the server", () => {
    expect(validateMediaFile("PORTRAIT_COUPLE", { type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateMediaFile("PORTRAIT_COUPLE", { type: "audio/mpeg", size: 1000 })).not.toBeNull();
    expect(validateMediaFile("PORTRAIT_COUPLE", { type: "image/png", size: IMAGE_MEDIA_MAX_BYTES + 1 })).not.toBeNull();
    expect(validateUploadIntentInput({ mediaType: "PORTRAIT_COUPLE", mimeType: "image/webp", sizeBytes: 1000 }).mediaType).toBe("PORTRAIT_COUPLE");
    expect(() => validateUploadIntentInput({ mediaType: "PORTRAIT_COUPLE", mimeType: "audio/mpeg", sizeBytes: 1000 })).toThrow();
    const storagePath = `${FIXTURE_PROJECT_ID}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
    expect(validateFinalizeMediaInput({ mediaType: "PORTRAIT_COUPLE", storagePath, width: 900, height: 1200 }, FIXTURE_PROJECT_ID)).toMatchObject({
      mediaType: "PORTRAIT_COUPLE",
    });
  });
});

describe("4. image optimizer", () => {
  it("optimizes PORTRAIT_COUPLE as a photograph with the shared P1-MEDIA-01 policy", async () => {
    expect(isOptimizableImageMediaType("PORTRAIT_COUPLE")).toBe(true);
    const encodeCalls: { width: number; height: number; quality: number }[] = [];
    const codec = {
      decode: async () => ({ width: 4000, height: 3000, release: () => undefined }),
      encode: async (_image: unknown, size: { width: number; height: number }, mimeType: string, quality: number) => {
        encodeCalls.push({ ...size, quality });
        return new Blob([new Uint8Array(1000)], { type: mimeType });
      },
    };
    const original = new File([new Uint8Array(3 * 1024 * 1024)], "couple.jpg", { type: "image/jpeg" });
    const result = await optimizeImageForUpload("PORTRAIT_COUPLE", original, codec);
    expect(result.file.type).toBe("image/webp");
    expect(encodeCalls).toEqual([{ width: OPTIMIZED_MAX_LONG_EDGE, height: 1200, quality: OPTIMIZED_WEBP_QUALITY }]);
  });
});

describe("5. Snapshot builder", () => {
  const base = buildRendererFixtureSourceInput({ variant: "COMMON", portraits: "PRESENT" });

  it("writes portrait.coupleMediaId from the effective PORTRAIT_COUPLE row (sort_order, then id)", () => {
    const payload = payloadOf(withMedia(base, [coupleRow(COUPLE_OLD, 5), coupleRow(COUPLE_B, 0), coupleRow(COUPLE_A, 0)]));
    expect(payload.media.portrait).toEqual({
      groomMediaId: FIXTURE_MEDIA_IDS.PORTRAIT_GROOM,
      coupleMediaId: COUPLE_A,
      brideMediaId: FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE,
    });
    expect(Object.keys(payload.media.portrait ?? {})).toEqual(["groomMediaId", "coupleMediaId", "brideMediaId"]);
  });

  it("a couple portrait alone still emits the portrait object", () => {
    const payload = payloadOf(withMedia(buildRendererFixtureSourceInput({ variant: "GROOM" }), [coupleRow(COUPLE_A, 0)]));
    expect(payload.media.portrait).toEqual({ coupleMediaId: COUPLE_A });
  });

  it("never substitutes COVER, GALLERY, PHOTO_STORY or LOVE_STORY_PHOTO", () => {
    const input = buildRendererFixtureSourceInput({ variant: "COMMON", photoStory: "PRESENT", loveStoryPhoto: "PRESENT" });
    const payload = payloadOf(input);
    expect(payload.media.coverMediaId).toBe(FIXTURE_MEDIA_IDS.COVER);
    expect(payload.media.portrait).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("coupleMediaId");
  });

  it("without PORTRAIT_COUPLE the payload is exactly the previous shape (byte-identical JSON)", () => {
    const json = JSON.stringify(payloadOf(base));
    expect(json).not.toContain("couple");
    expect(json).toContain(
      `"portrait":{"groomMediaId":"${FIXTURE_MEDIA_IDS.PORTRAIT_GROOM}","brideMediaId":"${FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE}"}`,
    );
  });
});

describe("6. media reference extraction", () => {
  it("includes the couple id in portrait order groom → couple → bride; dedup unchanged", () => {
    const payload = payloadOf(withMedia(buildRendererFixtureSourceInput({ variant: "COMMON", portraits: "PRESENT" }), [coupleRow(COUPLE_A, 0)]));
    const refs = extractSnapshotMediaRefs(payload);
    const groom = refs.indexOf(FIXTURE_MEDIA_IDS.PORTRAIT_GROOM);
    expect(refs.slice(groom, groom + 3)).toEqual([FIXTURE_MEDIA_IDS.PORTRAIT_GROOM, COUPLE_A, FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE]);
    expect(new Set(refs).size).toBe(refs.length);

    const shared: SnapshotPayloadV1 = { ...payload, media: { ...payload.media, portrait: { coupleMediaId: FIXTURE_MEDIA_IDS.COVER } } };
    expect(extractSnapshotMediaRefs(shared).filter((id) => id === FIXTURE_MEDIA_IDS.COVER)).toHaveLength(1);
  });

  it("without coupleMediaId the existing order is unchanged", () => {
    const payload = payloadOf(buildRendererFixtureSourceInput({ variant: "COMMON", portraits: "PRESENT" }));
    const refs = extractSnapshotMediaRefs(payload);
    const groom = refs.indexOf(FIXTURE_MEDIA_IDS.PORTRAIT_GROOM);
    expect(refs[groom + 1]).toBe(FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE);
  });
});

describe("7. ViewModel", () => {
  async function viewModelOf(unavailableMediaIds: readonly string[], extra: readonly MediaRow[]) {
    const input = withMedia(buildRendererFixtureSourceInput({ variant: "COMMON", portraits: "PRESENT" }), extra);
    return (await runRendererFixturePipeline(input, { resolver: createFixtureMediaResolver({ unavailableMediaIds }) })).viewModel;
  }

  it("RESOLVED couple slot", async () => {
    const viewModel = await viewModelOf([], [coupleRow(COUPLE_A, 0)]);
    expect(viewModel.media.portrait.couple).toEqual({ status: "RESOLVED", mediaId: COUPLE_A, url: fixtureMediaUrl(COUPLE_A), width: null, height: null });
    expect(Object.keys(viewModel.media.portrait)).toEqual(["groom", "couple", "bride"]);
  });

  it("UNAVAILABLE couple slot stays honest; nothing is substituted", async () => {
    const viewModel = await viewModelOf([COUPLE_A], [coupleRow(COUPLE_A, 0)]);
    expect(viewModel.media.portrait.couple).toEqual({ status: "UNAVAILABLE", mediaId: COUPLE_A });
    expect(viewModel.media.cover?.status).toBe("RESOLVED");
  });

  it("absent remains absent (no COVER/GALLERY derivation)", async () => {
    const viewModel = await viewModelOf([], []);
    expect("couple" in viewModel.media.portrait).toBe(false);
    expect(viewModel.media.cover?.status).toBe("RESOLVED");
    expect(viewModel.media.gallery.length).toBeGreaterThan(0);
  });
});

describe("8. persisted Snapshot compatibility", () => {
  function stored(payload: SnapshotPayloadV1) {
    return {
      variant: payload.variant,
      templateVersionId: payload.template.templateVersionId,
      rendererKey: payload.template.rendererKey,
      payload: JSON.parse(JSON.stringify(payload)) as unknown,
    };
  }

  it("a stored payload with portrait.coupleMediaId and an older one without it both load and build a ViewModel", async () => {
    const withCouple = payloadOf(withMedia(buildRendererFixtureSourceInput({ variant: "BRIDE", portraits: "PRESENT" }), [coupleRow(COUPLE_A, 0)]));
    const older = payloadOf(buildRendererFixtureSourceInput({ variant: "BRIDE", portraits: "PRESENT" }));
    for (const payload of [withCouple, older]) {
      const loaded = assertStoredReviewSnapshot(stored(payload));
      const resolver = createFixtureMediaResolver();
      const mediaResolutions = await Promise.all(extractSnapshotMediaRefs(loaded).map((id) => resolver.resolveMedia(id)));
      const viewModel = buildInvitationViewModel({ snapshot: loaded, mediaResolutions });
      expect(viewModel.media.portrait.groom?.status).toBe("RESOLVED");
      expect(viewModel.media.portrait.couple?.status).toBe(payload === withCouple ? "RESOLVED" : undefined);
    }
  });
});

describe("9. Elegant Editorial is unaffected", () => {
  it("renders identical markup with or without a couple portrait and never shows it", async () => {
    const render = async (extra: readonly MediaRow[]) => {
      const input = withMedia(buildRendererFixtureSourceInput({ variant: "COMMON", portraits: "PRESENT" }), extra);
      const { viewModel, selection } = await runRendererFixturePipeline(input, { resolver: createFixtureMediaResolver() });
      return renderToStaticMarkup(<ElegantEditorialV1 viewModel={viewModel} sections={selection.effectiveSections} capabilities={{}} />);
    };
    const withCouple = await render([coupleRow(COUPLE_A, 0)]);
    expect(withCouple).not.toContain(fixtureMediaUrl(COUPLE_A));
    expect(withCouple).toBe(await render([]));
  });
});
