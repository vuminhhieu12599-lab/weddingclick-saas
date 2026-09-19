import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { createAccessLinkResolutionRepository } from "../access-link-resolution-repository";

const accessLinkId = "11111111-1111-1111-1111-111111111111";
const projectId = "22222222-2222-2222-2222-222222222222";
const tokenHash = new Uint8Array(32).fill(0xab);

interface Captured {
  table?: string;
  selectColumns?: string;
  eqCalls: Array<{ column: string; value: unknown }>;
  updatePayload?: Record<string, unknown>;
  updateSelectColumns?: string;
  singleCalled?: boolean;
}

/**
 * Minimal fake mirroring the exact chain shape the repository calls:
 * lookup   -> .from(table).select(cols).eq(col, val).maybeSingle()
 * touch    -> .from(table).update(payload).eq(col, val).select(cols).single()
 *
 * The touch chain's terminal `.single()` is where the installed
 * @supabase/postgrest-js client models PostgREST's real cardinality
 * enforcement (Accept: application/vnd.pgrst.object+json — a zero-row or
 * multi-row match comes back as a non-2xx `error`, proven against the
 * installed client via an intercepted-fetch probe during authoring; see
 * the repository's touchLastUsedAt comment). `singleResult` lets each test
 * supply exactly the { data, error } shape the real client would produce.
 */
function fakeClient(options: {
  maybeSingleResult?: { data?: unknown; error?: { message: string } | null };
  singleResult?: { data?: unknown; error?: { message: string; code?: string } | null };
  captured: Captured;
}): SupabaseClient {
  const { maybeSingleResult, singleResult, captured } = options;

  return {
    from(table: string) {
      captured.table = table;
      return {
        select(columns: string) {
          captured.selectColumns = columns;
          return {
            eq(column: string, value: unknown) {
              captured.eqCalls.push({ column, value });
              return {
                async maybeSingle() {
                  return maybeSingleResult ?? { data: null, error: null };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          captured.updatePayload = payload;
          return {
            eq(column: string, value: unknown) {
              captured.eqCalls.push({ column, value });
              return {
                select(columns: string) {
                  captured.updateSelectColumns = columns;
                  return {
                    async single() {
                      captured.singleCalled = true;
                      return singleResult ?? { data: null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

const validRow = {
  id: accessLinkId,
  project_id: projectId,
  link_type: "REVIEW",
  expires_at: null,
  revoked_at: null,
};

describe("createAccessLinkResolutionRepository.lookupByTokenHash", () => {
  it("queries exactly the project_access_links table", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({ maybeSingleResult: { data: null, error: null }, captured });
    await createAccessLinkResolutionRepository(client).lookupByTokenHash(tokenHash);
    expect(captured.table).toBe("project_access_links");
  });

  it("selects only id, project_id, link_type, expires_at, revoked_at — never SELECT *", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({ maybeSingleResult: { data: null, error: null }, captured });
    await createAccessLinkResolutionRepository(client).lookupByTokenHash(tokenHash);
    expect(captured.selectColumns).toBe("id, project_id, link_type, expires_at, revoked_at");
    expect(captured.selectColumns).not.toContain("*");
    expect(captured.selectColumns).not.toContain("token_hash");
    expect(captured.selectColumns).not.toContain("token_hint");
  });

  it("filters by token_hash serialized as a Postgres bytea hex literal", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({ maybeSingleResult: { data: null, error: null }, captured });
    await createAccessLinkResolutionRepository(client).lookupByTokenHash(tokenHash);
    expect(captured.eqCalls).toHaveLength(1);
    expect(captured.eqCalls[0].column).toBe("token_hash");
    expect(captured.eqCalls[0].value).toBe(`\\x${"ab".repeat(32)}`);
  });

  it("returns null on zero-row result", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({ maybeSingleResult: { data: null, error: null }, captured });
    const result = await createAccessLinkResolutionRepository(client).lookupByTokenHash(tokenHash);
    expect(result).toBeNull();
  });

  it("maps a valid row to the narrow ResolvedAccessLinkRow shape", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({ maybeSingleResult: { data: validRow, error: null }, captured });
    const result = await createAccessLinkResolutionRepository(client).lookupByTokenHash(tokenHash);
    expect(result).toEqual({
      id: accessLinkId,
      projectId,
      linkType: "REVIEW",
      expiresAt: null,
      revokedAt: null,
    });
  });

  it("throws a generic error (never leaking raw detail) on a Supabase error", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({
      maybeSingleResult: { data: null, error: { message: "raw postgres detail" } },
      captured,
    });
    const error = await createAccessLinkResolutionRepository(client)
      .lookupByTokenHash(tokenHash)
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("throws a generic error when the returned id is not a valid UUID", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({
      maybeSingleResult: { data: { ...validRow, id: "not-a-uuid" }, error: null },
      captured,
    });
    await expect(
      createAccessLinkResolutionRepository(client).lookupByTokenHash(tokenHash),
    ).rejects.toThrow();
  });

  it("throws a generic error when link_type is not a recognized AccessLinkType", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({
      maybeSingleResult: { data: { ...validRow, link_type: "BOGUS" }, error: null },
      captured,
    });
    await expect(
      createAccessLinkResolutionRepository(client).lookupByTokenHash(tokenHash),
    ).rejects.toThrow();
  });

  it("throws a generic error when expires_at is a malformed timestamp", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({
      maybeSingleResult: { data: { ...validRow, expires_at: "not-a-timestamp" }, error: null },
      captured,
    });
    await expect(
      createAccessLinkResolutionRepository(client).lookupByTokenHash(tokenHash),
    ).rejects.toThrow();
  });

  it("throws a generic error when revoked_at is a malformed timestamp", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({
      maybeSingleResult: { data: { ...validRow, revoked_at: "not-a-timestamp" }, error: null },
      captured,
    });
    await expect(
      createAccessLinkResolutionRepository(client).lookupByTokenHash(tokenHash),
    ).rejects.toThrow();
  });

  it("accepts a valid non-null expires_at/revoked_at timestamp", async () => {
    const captured: Captured = { eqCalls: [] };
    const row = {
      ...validRow,
      expires_at: "2026-01-01T00:00:00.000Z",
      revoked_at: "2026-01-02T00:00:00.000Z",
    };
    const client = fakeClient({ maybeSingleResult: { data: row, error: null }, captured });
    const result = await createAccessLinkResolutionRepository(client).lookupByTokenHash(tokenHash);
    expect(result?.expiresAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result?.revokedAt).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("createAccessLinkResolutionRepository.touchLastUsedAt", () => {
  const oneRowSuccess = { data: { id: accessLinkId }, error: null };

  it("filters the update by exact id", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({ singleResult: oneRowSuccess, captured });
    await createAccessLinkResolutionRepository(client).touchLastUsedAt(accessLinkId);
    expect(captured.table).toBe("project_access_links");
    expect(captured.eqCalls).toHaveLength(1);
    expect(captured.eqCalls[0]).toEqual({ column: "id", value: accessLinkId });
  });

  it("updates only last_used_at, no other column", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({ singleResult: oneRowSuccess, captured });
    await createAccessLinkResolutionRepository(client).touchLastUsedAt(accessLinkId);
    expect(Object.keys(captured.updatePayload ?? {})).toEqual(["last_used_at"]);
    expect(typeof captured.updatePayload?.last_used_at).toBe("string");
  });

  it("requests only id as the returned representation, proving single-row cardinality", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({ singleResult: oneRowSuccess, captured });
    await createAccessLinkResolutionRepository(client).touchLastUsedAt(accessLinkId);
    expect(captured.updateSelectColumns).toBe("id");
    expect(captured.singleCalled).toBe(true);
  });

  it("exactly one correct returned row -> success", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({ singleResult: oneRowSuccess, captured });
    await expect(
      createAccessLinkResolutionRepository(client).touchLastUsedAt(accessLinkId),
    ).resolves.toBeUndefined();
  });

  it("resolves without error on success", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({ singleResult: oneRowSuccess, captured });
    await expect(
      createAccessLinkResolutionRepository(client).touchLastUsedAt(accessLinkId),
    ).resolves.toBeUndefined();
  });

  it("throws a generic error (never leaking raw detail) on a Supabase error", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({
      singleResult: { data: null, error: { message: "raw postgres detail" } },
      captured,
    });
    const error = await createAccessLinkResolutionRepository(client)
      .touchLastUsedAt(accessLinkId)
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("zero-row update (PostgREST PGRST116 via .single()) -> generic failure, does NOT silently resolve", async () => {
    // Exact real-client outcome for an UPDATE + .select("id").single() matching
    // zero rows: PostgREST returns a non-2xx response with a PGRST116 error
    // body, so @supabase/postgrest-js resolves `error` (non-null) and
    // `data: null` — never `{ error: null }` on top of zero rows updated.
    // Proven against the installed client (2.112.3) via an intercepted-fetch
    // probe during authoring; the repository must never treat this as success.
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({
      singleResult: {
        data: null,
        error: {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
        },
      },
      captured,
    });
    const error = await createAccessLinkResolutionRepository(client)
      .touchLastUsedAt(accessLinkId)
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("PGRST116");
    expect((error as Error).message).not.toContain("JSON object requested");
  });

  it("multi-row update (PostgREST PGRST116 via .single()) -> generic failure", async () => {
    // Same PGRST116 shape as the zero-row case — PostgREST's Accept:
    // application/vnd.pgrst.object+json enforcement is symmetric for 0 and
    // >1 matched rows, so the repository's single `error` check covers both.
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({
      singleResult: {
        data: null,
        error: {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
        },
      },
      captured,
    });
    await expect(
      createAccessLinkResolutionRepository(client).touchLastUsedAt(accessLinkId),
    ).rejects.toThrow();
  });

  it("malformed returned id (missing/non-string/non-UUID) -> generic failure, not silent success", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({
      singleResult: { data: { id: "not-a-uuid" }, error: null },
      captured,
    });
    await expect(
      createAccessLinkResolutionRepository(client).touchLastUsedAt(accessLinkId),
    ).rejects.toThrow();
  });

  it("returned data with no id field -> generic failure", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({ singleResult: { data: {}, error: null }, captured });
    await expect(
      createAccessLinkResolutionRepository(client).touchLastUsedAt(accessLinkId),
    ).rejects.toThrow();
  });

  it("returned valid UUID that does not match the requested id -> generic failure", async () => {
    const otherValidId = "99999999-9999-9999-9999-999999999999";
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({
      singleResult: { data: { id: otherValidId }, error: null },
      captured,
    });
    await expect(
      createAccessLinkResolutionRepository(client).touchLastUsedAt(accessLinkId),
    ).rejects.toThrow();
  });

  it("null data with no error (defensive: should never happen given .single(), but must not resolve) -> generic failure", async () => {
    const captured: Captured = { eqCalls: [] };
    const client = fakeClient({ singleResult: { data: null, error: null }, captured });
    await expect(
      createAccessLinkResolutionRepository(client).touchLastUsedAt(accessLinkId),
    ).rejects.toThrow();
  });
});
