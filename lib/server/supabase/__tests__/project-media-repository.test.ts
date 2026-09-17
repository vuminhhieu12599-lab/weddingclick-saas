import { StorageApiError, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { InsertProjectMediaRow } from "../../media/media-gateway";
import { supabaseProjectMediaGateway } from "../project-media-repository";

const projectId = "11111111-1111-1111-1111-111111111111";
const storagePath = `${projectId}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;

const validRow: InsertProjectMediaRow = {
  projectId,
  mediaType: "COVER",
  storagePath,
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  altText: null,
  sortOrder: 0,
  createdBy: "staff-1",
};

const successMediaRow = {
  id: "media-1",
  project_id: projectId,
  media_type: "COVER",
  storage_bucket: "project-media",
  storage_path: storagePath,
  mime_type: "image/jpeg",
  size_bytes: 1024,
  width: null,
  height: null,
  alt_text: null,
  sort_order: 0,
  created_by: "staff-1",
  created_at: "2026-09-17T00:00:00.000Z",
  updated_at: "2026-09-17T00:00:00.000Z",
};

describe("supabaseProjectMediaGateway.projectExists", () => {
  function fakeClient(result: { data?: unknown; error?: { message: string } | null }): SupabaseClient {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
  }

  it("returns true when a row is found", async () => {
    const client = fakeClient({ data: { id: projectId } });
    expect(await supabaseProjectMediaGateway.projectExists(client, projectId)).toBe(true);
  });

  it("returns false when no row is found", async () => {
    const client = fakeClient({ data: null });
    expect(await supabaseProjectMediaGateway.projectExists(client, projectId)).toBe(false);
  });
});

describe("supabaseProjectMediaGateway.insertProjectMedia", () => {
  function fakeInsertClient(result: {
    data?: unknown;
    error?: { code: string; message: string } | null;
    throwOnAwait?: boolean;
    captureInsert?: (row: Record<string, unknown>) => void;
  }): SupabaseClient {
    return {
      from: (table: string) => {
        expect(table).toBe("project_media");
        return {
          insert: (row: Record<string, unknown>) => {
            result.captureInsert?.(row);
            return {
              select: () => ({
                single: async () => {
                  if (result.throwOnAwait) {
                    throw new Error("network transport failure");
                  }
                  return { data: result.data ?? null, error: result.error ?? null };
                },
              }),
            };
          },
        };
      },
    } as unknown as SupabaseClient;
  }

  it("inserts through plain RLS (.from().insert()), never an RPC", async () => {
    let captured: Record<string, unknown> | undefined;
    const client = fakeInsertClient({
      data: successMediaRow,
      captureInsert: (row) => {
        captured = row;
      },
    });

    await supabaseProjectMediaGateway.insertProjectMedia(client, validRow);

    expect(captured).toEqual({
      project_id: validRow.projectId,
      media_type: validRow.mediaType,
      storage_bucket: "project-media",
      storage_path: validRow.storagePath,
      mime_type: validRow.mimeType,
      size_bytes: validRow.sizeBytes,
      width: null,
      height: null,
      alt_text: validRow.altText,
      sort_order: validRow.sortOrder,
      created_by: validRow.createdBy,
    });
  });

  it("returns INSERTED with a mapped camelCase record on success", async () => {
    const client = fakeInsertClient({ data: successMediaRow });

    const outcome = await supabaseProjectMediaGateway.insertProjectMedia(client, validRow);

    expect(outcome.kind).toBe("INSERTED");
    if (outcome.kind === "INSERTED") {
      expect(outcome.media.id).toBe(successMediaRow.id);
      expect(outcome.media.storagePath).toBe(storagePath);
    }
  });

  it("returns DUPLICATE for a 23505 unique-violation", async () => {
    const client = fakeInsertClient({ error: { code: "23505", message: "duplicate key" } });

    const outcome = await supabaseProjectMediaGateway.insertProjectMedia(client, validRow);

    expect(outcome).toEqual({ kind: "DUPLICATE" });
  });

  it("returns OTHER_FAILURE for any other well-formed Postgrest error", async () => {
    const client = fakeInsertClient({ error: { code: "23503", message: "fk violation" } });

    const outcome = await supabaseProjectMediaGateway.insertProjectMedia(client, validRow);

    expect(outcome).toEqual({ kind: "OTHER_FAILURE" });
  });

  it("returns AMBIGUOUS_FAILURE when the call itself throws", async () => {
    const client = fakeInsertClient({ throwOnAwait: true });

    const outcome = await supabaseProjectMediaGateway.insertProjectMedia(client, validRow);

    expect(outcome).toEqual({ kind: "AMBIGUOUS_FAILURE" });
  });
});

describe("supabaseProjectMediaGateway Storage methods", () => {
  function fakeStorageClient(overrides: {
    createSignedUploadUrl?: (path: string) => Promise<{ data: unknown; error: unknown }>;
    info?: (path: string) => Promise<{ data: unknown; error: unknown }>;
  }): SupabaseClient {
    return {
      storage: {
        from: (bucket: string) => {
          expect(bucket).toBe("project-media");
          return {
            createSignedUploadUrl:
              overrides.createSignedUploadUrl ??
              (async () => ({ data: null, error: { message: "not configured" } })),
            info:
              overrides.info ??
              (async () => ({ data: null, error: { message: "not configured" } })),
          };
        },
      },
    } as unknown as SupabaseClient;
  }

  it("createSignedUploadPath calls Storage against project-media without upsert and returns the token", async () => {
    let calledWithPath: string | undefined;
    const client = fakeStorageClient({
      createSignedUploadUrl: async (path) => {
        calledWithPath = path;
        return {
          data: { signedUrl: "https://example/signed", token: "tok-1", path },
          error: null,
        };
      },
    });

    const result = await supabaseProjectMediaGateway.createSignedUploadPath(client, storagePath);

    expect(result).toEqual({ token: "tok-1" });
    expect(calledWithPath).toBe(storagePath);
  });

  it("createSignedUploadPath throws a plain Error on Storage failure", async () => {
    const client = fakeStorageClient({
      createSignedUploadUrl: async () => ({ data: null, error: { message: "bucket missing" } }),
    });

    await expect(
      supabaseProjectMediaGateway.createSignedUploadPath(client, storagePath),
    ).rejects.toThrow();
  });

  it("getStorageObjectInfo uses the exact path and returns sizeBytes/contentType", async () => {
    let calledWithPath: string | undefined;
    const client = fakeStorageClient({
      info: async (path) => {
        calledWithPath = path;
        return { data: { size: 2048, contentType: "image/png" }, error: null };
      },
    });

    const result = await supabaseProjectMediaGateway.getStorageObjectInfo(client, storagePath);

    expect(result).toEqual({ sizeBytes: 2048, contentType: "image/png" });
    expect(calledWithPath).toBe(storagePath);
  });

  describe("getStorageObjectInfo — error classification (Finding 1, Task 024 Phase 2 live-bug patch)", () => {
    it("a confirmed StorageApiError with transport status 404 -> null", async () => {
      const client = fakeStorageClient({
        info: async () => ({
          data: null,
          error: new StorageApiError("Object not found", 404, "404", "storage", "NoSuchKey"),
        }),
      });

      expect(
        await supabaseProjectMediaGateway.getStorageObjectInfo(client, storagePath),
      ).toBeNull();
    });

    it("the confirmed live dev/staging shape (transport 400, body statusCode \"404\", code \"NoSuchKey\") -> null", async () => {
      const client = fakeStorageClient({
        info: async () => ({
          data: null,
          error: new StorageApiError("Object not found", 400, "404", "storage", "NoSuchKey"),
        }),
      });

      expect(
        await supabaseProjectMediaGateway.getStorageObjectInfo(client, storagePath),
      ).toBeNull();
    });

    it("a generic transport 400 unrelated to a missing object -> throws a plain Error, never the raw message", async () => {
      const client = fakeStorageClient({
        info: async () => ({
          data: null,
          error: new StorageApiError("The specified bucket does not exist", 400, "400"),
        }),
      });

      const error = await supabaseProjectMediaGateway
        .getStorageObjectInfo(client, storagePath)
        .catch((e) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toMatch(/specified bucket does not exist/);
    });

    it("transport 400 with body statusCode \"404\" but a non-NoSuchKey code -> throws, never treated as not-found", async () => {
      const client = fakeStorageClient({
        info: async () => ({
          data: null,
          error: new StorageApiError("Resource locked", 400, "404", "storage", "ResourceLocked"),
        }),
      });

      const error = await supabaseProjectMediaGateway
        .getStorageObjectInfo(client, storagePath)
        .catch((e) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toMatch(/Resource locked/);
    });

    it("a StorageApiError with status 403 -> throws a plain Error, never the raw message", async () => {
      const client = fakeStorageClient({
        info: async () => ({
          data: null,
          error: new StorageApiError("Access denied — bucket policy details", 403, "403"),
        }),
      });

      const error = await supabaseProjectMediaGateway
        .getStorageObjectInfo(client, storagePath)
        .catch((e) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toMatch(/Access denied|bucket policy/);
    });

    it("a StorageApiError with status 500 -> throws a plain Error, never the raw message", async () => {
      const client = fakeStorageClient({
        info: async () => ({
          data: null,
          error: new StorageApiError("internal storage service failure", 500, "500"),
        }),
      });

      const error = await supabaseProjectMediaGateway
        .getStorageObjectInfo(client, storagePath)
        .catch((e) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toMatch(/internal storage service failure/);
    });

    it("a non-StorageApiError Storage error (e.g. a network-level failure with no status) -> throws", async () => {
      const client = fakeStorageClient({
        info: async () => ({
          data: null,
          error: new Error("fetch failed: ECONNRESET"),
        }),
      });

      const error = await supabaseProjectMediaGateway
        .getStorageObjectInfo(client, storagePath)
        .catch((e) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toMatch(/ECONNRESET/);
    });

    it("no data and no error -> throws (never silently treated as not-found)", async () => {
      const client = fakeStorageClient({
        info: async () => ({ data: null, error: null }),
      });

      await expect(
        supabaseProjectMediaGateway.getStorageObjectInfo(client, storagePath),
      ).rejects.toThrow();
    });
  });

  describe("getStorageObjectInfo — metadata validation", () => {
    it("throws when size/contentType are missing entirely", async () => {
      const client = fakeStorageClient({
        info: async () => ({ data: { size: undefined, contentType: undefined }, error: null }),
      });

      await expect(
        supabaseProjectMediaGateway.getStorageObjectInfo(client, storagePath),
      ).rejects.toThrow();
    });

    it("Finding 3: throws on a fractional (non-integer) positive size", async () => {
      const client = fakeStorageClient({
        info: async () => ({ data: { size: 1024.5, contentType: "image/jpeg" }, error: null }),
      });

      await expect(
        supabaseProjectMediaGateway.getStorageObjectInfo(client, storagePath),
      ).rejects.toThrow();
    });

    it("Finding 3: throws on a zero size", async () => {
      const client = fakeStorageClient({
        info: async () => ({ data: { size: 0, contentType: "image/jpeg" }, error: null }),
      });

      await expect(
        supabaseProjectMediaGateway.getStorageObjectInfo(client, storagePath),
      ).rejects.toThrow();
    });

    it("Finding 3: throws on a negative size", async () => {
      const client = fakeStorageClient({
        info: async () => ({ data: { size: -1, contentType: "image/jpeg" }, error: null }),
      });

      await expect(
        supabaseProjectMediaGateway.getStorageObjectInfo(client, storagePath),
      ).rejects.toThrow();
    });

    it("Finding 3: throws on NaN size", async () => {
      const client = fakeStorageClient({
        info: async () => ({ data: { size: Number.NaN, contentType: "image/jpeg" }, error: null }),
      });

      await expect(
        supabaseProjectMediaGateway.getStorageObjectInfo(client, storagePath),
      ).rejects.toThrow();
    });

    it("Finding 3: throws on Infinity size", async () => {
      const client = fakeStorageClient({
        info: async () => ({
          data: { size: Number.POSITIVE_INFINITY, contentType: "image/jpeg" },
          error: null,
        }),
      });

      await expect(
        supabaseProjectMediaGateway.getStorageObjectInfo(client, storagePath),
      ).rejects.toThrow();
    });

    it("Finding 3: accepts a valid positive integer size", async () => {
      const client = fakeStorageClient({
        info: async () => ({ data: { size: 4096, contentType: "image/jpeg" }, error: null }),
      });

      const result = await supabaseProjectMediaGateway.getStorageObjectInfo(client, storagePath);

      expect(result).toEqual({ sizeBytes: 4096, contentType: "image/jpeg" });
    });
  });
});
