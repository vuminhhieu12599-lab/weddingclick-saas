import { StorageApiError, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { InsertProjectMediaRow } from "../../media/media-gateway";
import type { UpdateProjectMediaPatch } from "../../media/media-types";
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

describe("supabaseProjectMediaGateway.listProjectMedia (Task 024 Phase 3)", () => {
  function fakeListClient(result: {
    data?: unknown;
    error?: { message: string } | null;
    captureOrder?: (calls: Array<[string, boolean]>) => void;
  }): SupabaseClient {
    const orderCalls: Array<[string, boolean]> = [];
    const chain = {
      eq: (column: string, value: string) => {
        expect(column).toBe("project_id");
        expect(value).toBe(projectId);
        return chain;
      },
      order: (column: string, opts: { ascending: boolean }) => {
        orderCalls.push([column, opts.ascending]);
        result.captureOrder?.(orderCalls);
        return chain;
      },
      then: (resolve: (value: { data: unknown; error: unknown }) => void) =>
        resolve({ data: result.data ?? null, error: result.error ?? null }),
    };
    return {
      from: (table: string) => {
        expect(table).toBe("project_media");
        return { select: () => chain };
      },
    } as unknown as SupabaseClient;
  }

  it("filters exactly by project_id and orders sort_order, created_at, id ascending", async () => {
    let capturedOrder: Array<[string, boolean]> = [];
    const client = fakeListClient({
      data: [successMediaRow],
      captureOrder: (calls) => {
        capturedOrder = calls;
      },
    });

    const result = await supabaseProjectMediaGateway.listProjectMedia(client, projectId);

    expect(capturedOrder).toEqual([
      ["sort_order", true],
      ["created_at", true],
      ["id", true],
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(successMediaRow.id);
  });

  it("returns an empty array when no rows match", async () => {
    const client = fakeListClient({ data: [] });

    const result = await supabaseProjectMediaGateway.listProjectMedia(client, projectId);

    expect(result).toEqual([]);
  });

  it("throws a plain Error on a Postgrest error, never the raw message", async () => {
    const client = fakeListClient({ error: { message: "raw postgres internals" } });

    const error = await supabaseProjectMediaGateway
      .listProjectMedia(client, projectId)
      .catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toMatch(/raw postgres internals/);
  });
});

describe("supabaseProjectMediaGateway.updateProjectMedia (Task 024 Phase 3)", () => {
  function fakeUpdateClient(result: {
    data?: unknown;
    error?: { message: string } | null;
    captureUpdate?: (payload: Record<string, unknown>) => void;
    captureEq?: (calls: Array<[string, string]>) => void;
  }): SupabaseClient {
    const eqCalls: Array<[string, string]> = [];
    return {
      from: (table: string) => {
        expect(table).toBe("project_media");
        return {
          update: (payload: Record<string, unknown>) => {
            result.captureUpdate?.(payload);
            const chain = {
              eq: (column: string, value: string) => {
                eqCalls.push([column, value]);
                result.captureEq?.(eqCalls);
                return chain;
              },
              select: () => ({
                maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }),
              }),
            };
            return chain;
          },
        };
      },
    } as unknown as SupabaseClient;
  }

  it("builds the UPDATE payload from exactly the keys present on the patch — altText only", async () => {
    let captured: Record<string, unknown> | undefined;
    const client = fakeUpdateClient({
      data: successMediaRow,
      captureUpdate: (payload) => {
        captured = payload;
      },
    });

    const patch: UpdateProjectMediaPatch = { altText: "hello" };
    await supabaseProjectMediaGateway.updateProjectMedia(client, projectId, successMediaRow.id, patch);

    expect(captured).toEqual({ alt_text: "hello" });
    expect(captured).not.toHaveProperty("sort_order");
  });

  it("builds the UPDATE payload from exactly the keys present on the patch — sortOrder only", async () => {
    let captured: Record<string, unknown> | undefined;
    const client = fakeUpdateClient({
      data: successMediaRow,
      captureUpdate: (payload) => {
        captured = payload;
      },
    });

    const patch: UpdateProjectMediaPatch = { sortOrder: 7 };
    await supabaseProjectMediaGateway.updateProjectMedia(client, projectId, successMediaRow.id, patch);

    expect(captured).toEqual({ sort_order: 7 });
    expect(captured).not.toHaveProperty("alt_text");
  });

  it("includes both columns when both fields are present", async () => {
    let captured: Record<string, unknown> | undefined;
    const client = fakeUpdateClient({
      data: successMediaRow,
      captureUpdate: (payload) => {
        captured = payload;
      },
    });

    const patch: UpdateProjectMediaPatch = { altText: "x", sortOrder: 2 };
    await supabaseProjectMediaGateway.updateProjectMedia(client, projectId, successMediaRow.id, patch);

    expect(captured).toEqual({ alt_text: "x", sort_order: 2 });
  });

  it("scopes the UPDATE by project_id and id together", async () => {
    let capturedEq: Array<[string, string]> = [];
    const client = fakeUpdateClient({
      data: successMediaRow,
      captureEq: (calls) => {
        capturedEq = calls;
      },
    });

    await supabaseProjectMediaGateway.updateProjectMedia(client, projectId, successMediaRow.id, {
      altText: "x",
    });

    expect(capturedEq).toEqual([
      ["project_id", projectId],
      ["id", successMediaRow.id],
    ]);
  });

  it("returns UPDATED with a mapped camelCase record on success", async () => {
    const client = fakeUpdateClient({ data: successMediaRow });

    const outcome = await supabaseProjectMediaGateway.updateProjectMedia(
      client,
      projectId,
      successMediaRow.id,
      { altText: "x" },
    );

    expect(outcome.kind).toBe("UPDATED");
    if (outcome.kind === "UPDATED") {
      expect(outcome.media.id).toBe(successMediaRow.id);
    }
  });

  it("returns NOT_FOUND when zero rows match (wrong-project or nonexistent media)", async () => {
    const client = fakeUpdateClient({ data: null });

    const outcome = await supabaseProjectMediaGateway.updateProjectMedia(
      client,
      projectId,
      successMediaRow.id,
      { altText: "x" },
    );

    expect(outcome).toEqual({ kind: "NOT_FOUND" });
  });

  it("throws a plain Error on a Postgrest error, never the raw message", async () => {
    const client = fakeUpdateClient({ error: { message: "raw postgres internals" } });

    const error = await supabaseProjectMediaGateway
      .updateProjectMedia(client, projectId, successMediaRow.id, { altText: "x" })
      .catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toMatch(/raw postgres internals/);
  });
});

describe("supabaseProjectMediaGateway.deleteProjectMedia (Task 024 Phase 3)", () => {
  function fakeDeleteClient(result: {
    data?: unknown;
    error?: { code?: string; message: string } | null;
    captureEq?: (calls: Array<[string, string]>) => void;
    captureSelect?: (columns: string) => void;
  }): SupabaseClient {
    const eqCalls: Array<[string, string]> = [];
    return {
      from: (table: string) => {
        expect(table).toBe("project_media");
        return {
          delete: () => {
            const chain = {
              eq: (column: string, value: string) => {
                eqCalls.push([column, value]);
                result.captureEq?.(eqCalls);
                return chain;
              },
              select: (columns: string) => {
                result.captureSelect?.(columns);
                return {
                  maybeSingle: async () => ({
                    data: result.data ?? null,
                    error: result.error ?? null,
                  }),
                };
              },
            };
            return chain;
          },
        };
      },
    } as unknown as SupabaseClient;
  }

  it("issues one DELETE scoped by project_id and id, returning storage_bucket/storage_path", async () => {
    let capturedEq: Array<[string, string]> = [];
    let capturedSelect = "";
    const client = fakeDeleteClient({
      data: { storage_bucket: "project-media", storage_path: storagePath },
      captureEq: (calls) => {
        capturedEq = calls;
      },
      captureSelect: (columns) => {
        capturedSelect = columns;
      },
    });

    const outcome = await supabaseProjectMediaGateway.deleteProjectMedia(
      client,
      projectId,
      "media-1",
    );

    expect(capturedEq).toEqual([
      ["project_id", projectId],
      ["id", "media-1"],
    ]);
    expect(capturedSelect).toBe("storage_bucket, storage_path");
    expect(outcome).toEqual({
      kind: "DELETED",
      storageBucket: "project-media",
      storagePath,
    });
  });

  it("returns NOT_FOUND when zero rows match (wrong-project or nonexistent media)", async () => {
    const client = fakeDeleteClient({ data: null });

    const outcome = await supabaseProjectMediaGateway.deleteProjectMedia(
      client,
      projectId,
      "media-1",
    );

    expect(outcome).toEqual({ kind: "NOT_FOUND" });
  });

  it("classifies a 23503 foreign-key violation as REFERENCED_CONFLICT", async () => {
    const client = fakeDeleteClient({
      error: { code: "23503", message: "update or delete on table violates foreign key" },
    });

    const outcome = await supabaseProjectMediaGateway.deleteProjectMedia(
      client,
      projectId,
      "media-1",
    );

    expect(outcome).toEqual({ kind: "REFERENCED_CONFLICT" });
  });

  it("classifies any other Postgrest error as OTHER_FAILURE, never leaking the raw message", async () => {
    const client = fakeDeleteClient({ error: { code: "XXOOO", message: "raw postgres internals" } });

    const outcome = await supabaseProjectMediaGateway.deleteProjectMedia(
      client,
      projectId,
      "media-1",
    );

    expect(outcome).toEqual({ kind: "OTHER_FAILURE" });
  });
});

describe("supabaseProjectMediaGateway.removeMediaStorageObject (Task 024 Phase 3)", () => {
  function fakeRemoveClient(overrides: {
    remove?: (paths: string[]) => Promise<{ data: unknown; error: unknown }>;
  }): SupabaseClient {
    return {
      storage: {
        from: (bucket: string) => {
          expect(bucket).toBe("project-media");
          return {
            remove:
              overrides.remove ?? (async () => ({ data: null, error: { message: "not configured" } })),
          };
        },
      },
    } as unknown as SupabaseClient;
  }

  it("calls Storage remove() with exactly one path, against project-media, and returns true on success", async () => {
    let receivedPaths: string[] | undefined;
    const client = fakeRemoveClient({
      remove: async (paths) => {
        receivedPaths = paths;
        return { data: [{ name: storagePath }], error: null };
      },
    });

    const result = await supabaseProjectMediaGateway.removeMediaStorageObject(client, storagePath);

    expect(result).toBe(true);
    expect(receivedPaths).toEqual([storagePath]);
  });

  it("returns false (never throws) when Storage reports an error", async () => {
    const client = fakeRemoveClient({
      remove: async () => ({ data: null, error: { message: "object not found" } }),
    });

    const result = await supabaseProjectMediaGateway.removeMediaStorageObject(client, storagePath);

    expect(result).toBe(false);
  });
});
