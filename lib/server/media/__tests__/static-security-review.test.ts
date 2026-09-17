import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static/security review checks for Task 024 Phase 2 (signed upload intent
 * + finalize), mirroring
 * lib/server/project-events/__tests__/static-security-review.test.ts
 * (Task 023): the media route/service/gateway code must never reference
 * service_role, must never call log_activity, must never touch V1's
 * wedding-photos bucket, must never call a DB RPC (no media-specific
 * trusted business action exists — API_CONTRACT.md §3.2), must never let
 * the bucket be anything but the PROJECT_MEDIA_BUCKET constant, and the
 * Next.js route handlers must only ever parse a small JSON body — never
 * read/proxy a file body (Task 024 Phase 2 §0).
 *
 * Review-findings patch, Finding 2 (No-Cleanup Rule): finalize-media.ts
 * must never call Storage removal or perform an ownership re-check after a
 * DB insert failure — that synchronous recheck-then-remove sequence is a
 * TOCTOU race. The gateway/repository no longer expose that capability at
 * all (removeStorageObject/findProjectMediaByStoragePath were removed).
 */
const ROOT = join(__dirname, "..", "..", "..", "..");

const FEATURE_FILES = [
  "lib/server/media/media-constants.ts",
  "lib/server/media/media-types.ts",
  "lib/server/media/media-gateway.ts",
  "lib/server/media/generate-media-storage-path.ts",
  "lib/server/media/validate-upload-intent-input.ts",
  "lib/server/media/validate-finalize-media-input.ts",
  "lib/server/media/validate-update-project-media-input.ts",
  "lib/server/media/create-upload-intent.ts",
  "lib/server/media/finalize-media.ts",
  "lib/server/media/list-project-media.ts",
  "lib/server/media/update-project-media.ts",
  "lib/server/media/delete-project-media.ts",
  "lib/server/supabase/project-media-repository.ts",
  "lib/server/routes/project-media.ts",
  "app/api/v2/internal/projects/[id]/media/upload-intent/route.ts",
  "app/api/v2/internal/projects/[id]/media/finalize/route.ts",
  "app/api/v2/internal/projects/[id]/media/route.ts",
  "app/api/v2/internal/projects/[id]/media/[mediaId]/route.ts",
];

const ROUTE_FILES = [
  "app/api/v2/internal/projects/[id]/media/upload-intent/route.ts",
  "app/api/v2/internal/projects/[id]/media/finalize/route.ts",
];

/**
 * Task 024 Phase 3 route files are handled by a separate assertion below
 * (list/PATCH/DELETE): the GET route never reads a body at all, and the
 * PATCH route parses JSON same as finalize/upload-intent — but neither is
 * folded into ROUTE_FILES's formData/body/arrayBuffer/blob check because
 * DELETE deliberately never calls request.json() at all (no body).
 */
const PHASE_3_JSON_BODY_ROUTE_FILES = ["app/api/v2/internal/projects/[id]/media/[mediaId]/route.ts"];

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Task 024 Phase 2 static/security review", () => {
  it.each(FEATURE_FILES)("%s never references service_role", (relativePath) => {
    expect(read(relativePath)).not.toMatch(/service_role/i);
  });

  it.each(FEATURE_FILES)("%s never calls log_activity", (relativePath) => {
    expect(read(relativePath)).not.toMatch(/log_activity/);
  });

  it.each(FEATURE_FILES)("%s never references V1's wedding-photos bucket", (relativePath) => {
    expect(read(relativePath)).not.toMatch(/wedding-photos/);
  });

  it.each(FEATURE_FILES)("%s never calls a Postgres RPC", (relativePath) => {
    expect(read(relativePath)).not.toMatch(/\.rpc\(/);
  });

  it.each(ROUTE_FILES)("%s parses JSON only — never formData/body/arrayBuffer/blob", (relativePath) => {
    const contents = read(relativePath);
    expect(contents).toMatch(/request\.json\(\)/);
    expect(contents).not.toMatch(/request\.formData\(/);
    expect(contents).not.toMatch(/request\.body\b/);
    expect(contents).not.toMatch(/request\.arrayBuffer\(/);
    expect(contents).not.toMatch(/request\.blob\(/);
  });

  it("the repository never derives the Storage bucket from anything but the PROJECT_MEDIA_BUCKET constant", () => {
    const contents = read("lib/server/supabase/project-media-repository.ts");
    const storageFromCalls = contents.match(/\.storage\s*\n?\s*\.from\(([^)]*)\)/g) ?? [];
    expect(storageFromCalls.length).toBeGreaterThan(0);
    for (const call of storageFromCalls) {
      expect(call).toMatch(/PROJECT_MEDIA_BUCKET/);
    }
  });

  it("validate-upload-intent-input.ts's accepted-field set never includes storagePath, storageBucket, projectId, or createdBy", () => {
    const contents = read("lib/server/media/validate-upload-intent-input.ts");
    const setMatch = contents.match(/ACCEPTED_FIELDS = new Set\(\[([\s\S]*?)\]\)/);
    expect(setMatch).not.toBeNull();
    const fields = setMatch![1];
    expect(fields).not.toMatch(/storagePath/);
    expect(fields).not.toMatch(/storageBucket/);
    expect(fields).not.toMatch(/projectId/);
    expect(fields).not.toMatch(/createdBy/);
  });

  it("validate-finalize-media-input.ts's accepted-field set never includes mimeType, sizeBytes, storageBucket, projectId, or createdBy", () => {
    const contents = read("lib/server/media/validate-finalize-media-input.ts");
    const setMatch = contents.match(/ACCEPTED_FIELDS = new Set\(\[([\s\S]*?)\]\)/);
    expect(setMatch).not.toBeNull();
    const fields = setMatch![1];
    expect(fields).not.toMatch(/"mimeType"/);
    expect(fields).not.toMatch(/"sizeBytes"/);
    expect(fields).not.toMatch(/storageBucket/);
    expect(fields).not.toMatch(/projectId/);
    expect(fields).not.toMatch(/createdBy/);
  });

  it("finalize-media.ts never trusts a client-supplied mimeType/sizeBytes field for the insert row", () => {
    const contents = read("lib/server/media/finalize-media.ts");
    expect(contents).toMatch(/mimeType:\s*info\.contentType/);
    expect(contents).toMatch(/sizeBytes:\s*info\.sizeBytes/);
  });

  it("project-media-repository.ts always inserts width/height as a literal null, never from input", () => {
    const contents = read("lib/server/supabase/project-media-repository.ts");
    expect(contents).toMatch(/width:\s*null/);
    expect(contents).toMatch(/height:\s*null/);
  });

  it.each(FEATURE_FILES)(
    "%s never calls removeStorageObject or findProjectMediaByStoragePath (No-Cleanup Rule, Finding 2)",
    (relativePath) => {
      const contents = read(relativePath);
      expect(contents).not.toMatch(/removeStorageObject/);
      expect(contents).not.toMatch(/findProjectMediaByStoragePath/);
    },
  );

  it.each(PHASE_3_JSON_BODY_ROUTE_FILES)(
    "%s parses JSON only for its body-bearing method — never formData/body/arrayBuffer/blob",
    (relativePath) => {
      const contents = read(relativePath);
      expect(contents).toMatch(/request\.json\(\)/);
      expect(contents).not.toMatch(/request\.formData\(/);
      expect(contents).not.toMatch(/request\.body\b/);
      expect(contents).not.toMatch(/request\.arrayBuffer\(/);
      expect(contents).not.toMatch(/request\.blob\(/);
    },
  );

  it("validate-update-project-media-input.ts's accepted-field set is exactly altText and sortOrder", () => {
    const contents = read("lib/server/media/validate-update-project-media-input.ts");
    const setMatch = contents.match(/ACCEPTED_FIELDS = new Set\(\[([\s\S]*?)\]\)/);
    expect(setMatch).not.toBeNull();
    const fields = setMatch![1];
    expect(fields).toMatch(/"altText"/);
    expect(fields).toMatch(/"sortOrder"/);
    for (const forbidden of [
      "id",
      "projectId",
      "mediaType",
      "storageBucket",
      "storagePath",
      "mimeType",
      "sizeBytes",
      "width",
      "height",
      "createdBy",
      "createdAt",
      "updatedAt",
    ]) {
      expect(fields).not.toMatch(new RegExp(`"${forbidden}"`));
    }
  });

  it("Task 024 Phase 3 production files never call Storage .remove(...) directly — only project-media-repository.ts's removeMediaStorageObject may", () => {
    const filesAllowedToCallStorageRemove = new Set([
      "lib/server/supabase/project-media-repository.ts",
    ]);
    for (const relativePath of FEATURE_FILES) {
      if (filesAllowedToCallStorageRemove.has(relativePath)) {
        continue;
      }
      expect(read(relativePath)).not.toMatch(/\.remove\(/);
    }
  });

  it("project-media-repository.ts's only Storage .remove(...) call lives inside removeMediaStorageObject", () => {
    const contents = read("lib/server/supabase/project-media-repository.ts");
    const removeMatches = contents.match(/\.remove\(/g) ?? [];
    expect(removeMatches).toHaveLength(1);
    expect(contents).toMatch(/async removeMediaStorageObject\([^)]*\)[^{]*\{[\s\S]*?\.remove\(/);
  });

  it("no Phase 3 production file is named or exports removeStorageObject — that name is retired by Phase 2's No-Cleanup Rule", () => {
    for (const relativePath of FEATURE_FILES) {
      expect(read(relativePath)).not.toMatch(/removeStorageObject\b/);
    }
  });

  it("Phase 3 delete failure throws (NOT_FOUND/REFERENCED_CONFLICT/OTHER_FAILURE) all appear, in source order, before the one removeMediaStorageObject call", () => {
    const contents = read("lib/server/media/delete-project-media.ts");
    const notFoundThrow = contents.indexOf('throw new ApiError("NOT_FOUND", "Media not found")');
    const conflictThrow = contents.indexOf('throw new ApiError("CONFLICT"');
    const otherFailureThrow = contents.indexOf('throw new ApiError("INTERNAL"');
    const removalCall = contents.indexOf("gateway.removeMediaStorageObject(");

    expect(notFoundThrow).toBeGreaterThan(-1);
    expect(conflictThrow).toBeGreaterThan(-1);
    expect(otherFailureThrow).toBeGreaterThan(-1);
    expect(removalCall).toBeGreaterThan(-1);

    expect(notFoundThrow).toBeLessThan(removalCall);
    expect(conflictThrow).toBeLessThan(removalCall);
    expect(otherFailureThrow).toBeLessThan(removalCall);
  });

  it("delete-project-media.ts never reinserts or compensates a DB row after a Storage failure", () => {
    const contents = read("lib/server/media/delete-project-media.ts");
    expect(contents).not.toMatch(/\.insert\(/);
    expect(contents).not.toMatch(/\.upsert\(/);
  });
});
