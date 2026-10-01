import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { RUNTIME_MEDIA_SIGNED_URL_TTL_SECONDS, createSupabaseMediaResolver } from "../supabase-media-resolver";

const projectId = "11111111-1111-4111-8111-111111111111";
const cover = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const gallery = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const missing = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function mediaRow(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    project_id: projectId,
    storage_bucket: "project-media",
    storage_path: `${projectId}/${id}`,
    width: null,
    height: null,
    ...extra,
  };
}

interface FakeOptions {
  rows?: unknown;
  queryError?: { message: string } | null;
  signed?: { data: unknown; error: unknown };
}

function fakeClient(options: FakeOptions) {
  const calls: unknown[][] = [];
  const builder = {
    select: (...args: unknown[]) => (calls.push(["select", ...args]), builder),
    eq: (...args: unknown[]) => (calls.push(["eq", ...args]), builder),
    in: (...args: unknown[]) => (calls.push(["in", ...args]), builder),
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: options.rows ?? [], error: options.queryError ?? null }),
  };
  const client = {
    from: (table: string) => (calls.push(["from", table]), builder),
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[], expiresIn: number) => {
          calls.push(["sign", bucket, paths, expiresIn]);
          if (options.signed) return options.signed;
          return {
            data: paths.map((path) => ({ error: null, path, signedURL: null, signedUrl: `https://signed.test/${path}?t=1` })),
            error: null,
          };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("createSupabaseMediaResolver", () => {
  it("resolves with one scoped query and one batch signing call (no N+1)", async () => {
    const { client, calls } = fakeClient({ rows: [mediaRow(cover, { width: 1200, height: 800 }), mediaRow(gallery)] });
    const resolver = await createSupabaseMediaResolver(client, projectId, [cover, gallery, cover]);

    expect(calls).toEqual([
      ["from", "project_media"],
      ["select", "id, project_id, storage_bucket, storage_path, width, height"],
      ["eq", "project_id", projectId],
      ["in", "id", [cover, gallery]],
      ["sign", "project-media", [`${projectId}/${cover}`, `${projectId}/${gallery}`], RUNTIME_MEDIA_SIGNED_URL_TTL_SECONDS],
    ]);
    expect(await resolver.resolveMedia(cover)).toEqual({
      status: "RESOLVED",
      mediaId: cover,
      url: `https://signed.test/${projectId}/${cover}?t=1`,
      width: 1200,
      height: 800,
    });
    expect(await resolver.resolveMedia(gallery)).toMatchObject({ status: "RESOLVED", width: null, height: null });
    expect(calls).toHaveLength(5);
  });

  it("returns UNAVAILABLE for an id with no row in this Project (incl. another Project's id)", async () => {
    const { client } = fakeClient({ rows: [mediaRow(cover)] });
    const resolver = await createSupabaseMediaResolver(client, projectId, [cover, missing]);
    expect(await resolver.resolveMedia(missing)).toEqual({ status: "UNAVAILABLE", mediaId: missing });
  });

  it("returns UNAVAILABLE for a non-UUID id without querying it", async () => {
    const { client, calls } = fakeClient({});
    const resolver = await createSupabaseMediaResolver(client, projectId, ["not-a-uuid"]);
    expect(await resolver.resolveMedia("not-a-uuid")).toEqual({ status: "UNAVAILABLE", mediaId: "not-a-uuid" });
    expect(calls).toEqual([]);
  });

  it("returns UNAVAILABLE for a per-object signing failure (e.g. missing object)", async () => {
    const { client } = fakeClient({
      rows: [mediaRow(cover)],
      signed: {
        data: [{ error: "Either the object does not exist or you do not have access to it", path: `${projectId}/${cover}`, signedURL: null, signedUrl: null }],
        error: null,
      },
    });
    const resolver = await createSupabaseMediaResolver(client, projectId, [cover]);
    expect(await resolver.resolveMedia(cover)).toEqual({ status: "UNAVAILABLE", mediaId: cover });
  });

  it("returns UNAVAILABLE for a row outside the approved bucket and never signs it", async () => {
    const { client, calls } = fakeClient({ rows: [mediaRow(cover, { storage_bucket: "other-bucket" })] });
    const resolver = await createSupabaseMediaResolver(client, projectId, [cover]);
    expect(await resolver.resolveMedia(cover)).toEqual({ status: "UNAVAILABLE", mediaId: cover });
    expect(calls.some(([kind]) => kind === "sign")).toBe(false);
  });

  it("throws (never UNAVAILABLE) on a query error", async () => {
    const { client } = fakeClient({ queryError: { message: "permission denied" } });
    await expect(createSupabaseMediaResolver(client, projectId, [cover])).rejects.toThrow(
      "Failed to query project media for resolution",
    );
  });

  it("throws on a whole-batch signing failure", async () => {
    const { client } = fakeClient({ rows: [mediaRow(cover)], signed: { data: null, error: new Error("storage down") } });
    await expect(createSupabaseMediaResolver(client, projectId, [cover])).rejects.toThrow(
      "Failed to sign project media URLs",
    );
  });

  it.each([
    ["another project's row", mediaRow(cover, { project_id: "22222222-2222-4222-8222-222222222222" })],
    ["a non-positive width", mediaRow(cover, { width: 0 })],
    ["an empty storage path", mediaRow(cover, { storage_path: "" })],
  ])("throws on a malformed row: %s", async (_name, bad) => {
    const { client } = fakeClient({ rows: [bad] });
    await expect(createSupabaseMediaResolver(client, projectId, [cover])).rejects.toThrow(
      "Unexpected result shape from the database",
    );
  });

  it("throws when asked for an id outside its preloaded set", async () => {
    const { client } = fakeClient({ rows: [] });
    const resolver = await createSupabaseMediaResolver(client, projectId, []);
    await expect(resolver.resolveMedia(cover)).rejects.toThrow("outside its preloaded set");
  });

  it("rejects a non-UUID project id", async () => {
    const { client } = fakeClient({});
    await expect(createSupabaseMediaResolver(client, "project-1", [cover])).rejects.toThrow("valid UUID");
  });

  it("exposes only the frozen M2 fields (no bucket, path or signing metadata)", async () => {
    const { client } = fakeClient({ rows: [mediaRow(cover)] });
    const resolver = await createSupabaseMediaResolver(client, projectId, [cover]);
    expect(Object.keys(await resolver.resolveMedia(cover)).sort()).toEqual(["height", "mediaId", "status", "url", "width"]);
  });
});
