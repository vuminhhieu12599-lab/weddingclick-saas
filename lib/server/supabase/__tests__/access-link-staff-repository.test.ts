import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { DirectIssueAccessLinkRow } from "../../access-links/access-link-staff-types";
import { supabaseAccessLinkStaffGateway } from "../access-link-staff-repository";

const projectId = "11111111-1111-1111-1111-111111111111";
const linkId = "22222222-2222-2222-2222-222222222222";
const staffId = "33333333-3333-3333-3333-333333333333";
const tokenHash = new Uint8Array(32).fill(0xab);
const tokenHashHex = `\\x${"ab".repeat(32)}`;

function fakeFromClient(options: {
  maybeSingleResult?: { data?: unknown; error?: { message: string } | null };
  insertResult?: { data?: unknown; error?: { message: string; code?: string } | null };
  captureInsert?: (table: string, row: Record<string, unknown>) => void;
  captureSelectEq?: (table: string, column: string, value: unknown) => void;
}): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: unknown) => {
          options.captureSelectEq?.(table, column, value);
          return {
            async maybeSingle() {
              return options.maybeSingleResult ?? { data: null, error: null };
            },
          };
        },
      }),
      insert: (row: Record<string, unknown>) => {
        options.captureInsert?.(table, row);
        return {
          select: () => ({
            async single() {
              return options.insertResult ?? { data: null, error: null };
            },
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;
}

function fakeRpcClient(result: {
  data?: unknown;
  error?: { code: string; message: string } | null;
  captureCall?: (fn: string, params: Record<string, unknown>) => void;
}): SupabaseClient {
  return {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      result.captureCall?.(fn, params);
      return { data: result.data ?? null, error: result.error ?? null };
    },
  } as unknown as SupabaseClient;
}

describe("supabaseAccessLinkStaffGateway.projectExists", () => {
  it("returns true when a row is found", async () => {
    const client = fakeFromClient({ maybeSingleResult: { data: { id: projectId } } });
    expect(await supabaseAccessLinkStaffGateway.projectExists(client, projectId)).toBe(true);
  });

  it("returns false when no row is found", async () => {
    const client = fakeFromClient({ maybeSingleResult: { data: null } });
    expect(await supabaseAccessLinkStaffGateway.projectExists(client, projectId)).toBe(false);
  });

  it("throws a generic error (never leaking raw detail) on a Supabase error", async () => {
    const client = fakeFromClient({
      maybeSingleResult: { data: null, error: { message: "raw postgres detail" } },
    });
    const error = await supabaseAccessLinkStaffGateway
      .projectExists(client, projectId)
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });
});

describe("supabaseAccessLinkStaffGateway.issueDirectAccessLink", () => {
  const row: DirectIssueAccessLinkRow = {
    projectId,
    linkType: "INTAKE",
    tokenHash,
    tokenHint: "abcdefgh",
    expiresAt: null,
    createdBy: staffId,
  };

  const successRow = {
    id: linkId,
    project_id: projectId,
    link_type: "INTAKE",
    expires_at: null,
    created_at: "2026-09-19T00:00:00.000Z",
  };

  it("inserts into project_access_links with exactly the six issuance columns, bytea-hex-encoding the hash", async () => {
    let captured: { table: string; row: Record<string, unknown> } | undefined;
    const client = fakeFromClient({
      insertResult: { data: successRow, error: null },
      captureInsert: (table, insertedRow) => {
        captured = { table, row: insertedRow };
      },
    });

    await supabaseAccessLinkStaffGateway.issueDirectAccessLink(client, row);

    expect(captured?.table).toBe("project_access_links");
    expect(Object.keys(captured?.row ?? {}).sort()).toEqual(
      ["project_id", "link_type", "token_hash", "token_hint", "expires_at", "created_by"].sort(),
    );
    expect(captured?.row.project_id).toBe(projectId);
    expect(captured?.row.link_type).toBe("INTAKE");
    expect(captured?.row.token_hash).toBe(tokenHashHex);
    expect(captured?.row.token_hint).toBe("abcdefgh");
    expect(captured?.row.expires_at).toBeNull();
    expect(captured?.row.created_by).toBe(staffId);
  });

  it("never includes id, created_at, revoked_at, or last_used_at in the insert payload", async () => {
    let captured: Record<string, unknown> | undefined;
    const client = fakeFromClient({
      insertResult: { data: successRow, error: null },
      captureInsert: (_table, insertedRow) => {
        captured = insertedRow;
      },
    });

    await supabaseAccessLinkStaffGateway.issueDirectAccessLink(client, row);

    expect(captured).not.toHaveProperty("id");
    expect(captured).not.toHaveProperty("created_at");
    expect(captured).not.toHaveProperty("revoked_at");
    expect(captured).not.toHaveProperty("last_used_at");
  });

  it("maps a valid row to IssuedAccessLinkRecord", async () => {
    const client = fakeFromClient({ insertResult: { data: successRow, error: null } });
    const result = await supabaseAccessLinkStaffGateway.issueDirectAccessLink(client, row);
    expect(result).toEqual({
      id: linkId,
      projectId,
      linkType: "INTAKE",
      expiresAt: null,
      createdAt: successRow.created_at,
    });
  });

  it("throws a generic error on a Supabase error (never leaking raw detail)", async () => {
    const client = fakeFromClient({
      insertResult: { data: null, error: { message: "raw postgres detail", code: "23503" } },
    });
    const error = await supabaseAccessLinkStaffGateway
      .issueDirectAccessLink(client, row)
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("throws generic on malformed returned row (missing field)", async () => {
    const client = fakeFromClient({ insertResult: { data: { id: linkId }, error: null } });
    await expect(
      supabaseAccessLinkStaffGateway.issueDirectAccessLink(client, row),
    ).rejects.toThrow();
  });

  it("throws generic when the returned project_id/link_type does not match the request", async () => {
    const client = fakeFromClient({
      insertResult: { data: { ...successRow, link_type: "PORTAL" }, error: null },
    });
    await expect(
      supabaseAccessLinkStaffGateway.issueDirectAccessLink(client, row),
    ).rejects.toThrow();
  });

  it("never selects token_hash/token_hint back", async () => {
    // The mapper only reads id/project_id/link_type/expires_at/created_at —
    // proven by isIssuedAccessLinkRow's field set and toIssuedAccessLinkRecord,
    // which never reference token_hash/token_hint even if present on the row.
    const client = fakeFromClient({
      insertResult: {
        data: { ...successRow, token_hash: "leak", token_hint: "leak" },
        error: null,
      },
    });
    const result = await supabaseAccessLinkStaffGateway.issueDirectAccessLink(client, row);
    expect(result).not.toHaveProperty("tokenHash");
    expect(result).not.toHaveProperty("tokenHint");
  });
});

describe("supabaseAccessLinkStaffGateway.issueReviewLink", () => {
  const successRow = {
    id: linkId,
    project_id: projectId,
    link_type: "REVIEW",
    expires_at: null,
    created_at: "2026-09-19T00:00:00.000Z",
  };

  it("calls issue_review_link with exactly p_project_id/p_token_hash/p_token_hint/p_expires_at", async () => {
    let captured: { fn: string; params: Record<string, unknown> } | undefined;
    const client = fakeRpcClient({
      data: [successRow],
      captureCall: (fn, params) => {
        captured = { fn, params };
      },
    });

    await supabaseAccessLinkStaffGateway.issueReviewLink(client, {
      projectId,
      tokenHash,
      tokenHint: "abcdefgh",
      expiresAt: null,
    });

    expect(captured?.fn).toBe("issue_review_link");
    expect(captured?.params).toEqual({
      p_project_id: projectId,
      p_token_hash: tokenHashHex,
      p_token_hint: "abcdefgh",
      p_expires_at: null,
    });
  });

  it("maps the RPC row to IssuedAccessLinkRecord", async () => {
    const client = fakeRpcClient({ data: [successRow] });
    const result = await supabaseAccessLinkStaffGateway.issueReviewLink(client, {
      projectId,
      tokenHash,
      tokenHint: "abcdefgh",
      expiresAt: null,
    });
    expect(result).toEqual({
      id: linkId,
      projectId,
      linkType: "REVIEW",
      expiresAt: null,
      createdAt: successRow.created_at,
    });
  });

  it.each([
    ["AL001", "FORBIDDEN"],
    ["AL002", "NOT_FOUND"],
  ])("maps known RPC error code %s to ApiError(%s) without leaking the raw message", async (code, kind) => {
    const client = fakeRpcClient({ error: { code, message: "raw postgres detail" } });
    const error = await supabaseAccessLinkStaffGateway
      .issueReviewLink(client, { projectId, tokenHash, tokenHint: "abcdefgh", expiresAt: null })
      .catch((e) => e);
    expect(error).toMatchObject({ kind });
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("maps an unrecognized RPC error code to a generic (non-ApiError) failure", async () => {
    const client = fakeRpcClient({ error: { code: "23505", message: "raw postgres detail" } });
    const error = await supabaseAccessLinkStaffGateway
      .issueReviewLink(client, { projectId, tokenHash, tokenHint: "abcdefgh", expiresAt: null })
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("throws generic on zero-row / multi-row RPC result", async () => {
    const client = fakeRpcClient({ data: [] });
    await expect(
      supabaseAccessLinkStaffGateway.issueReviewLink(client, {
        projectId,
        tokenHash,
        tokenHint: "abcdefgh",
        expiresAt: null,
      }),
    ).rejects.toThrow();
  });

  it("never returns token_hash even if present on the row", async () => {
    const client = fakeRpcClient({ data: [{ ...successRow, token_hash: "leak" }] });
    const result = await supabaseAccessLinkStaffGateway.issueReviewLink(client, {
      projectId,
      tokenHash,
      tokenHint: "abcdefgh",
      expiresAt: null,
    });
    expect(result).not.toHaveProperty("tokenHash");
  });

  it("identity hardening: throws generic when the returned row belongs to a different project", async () => {
    const otherProjectId = "99999999-9999-9999-9999-999999999999";
    const client = fakeRpcClient({ data: [{ ...successRow, project_id: otherProjectId }] });
    await expect(
      supabaseAccessLinkStaffGateway.issueReviewLink(client, {
        projectId,
        tokenHash,
        tokenHint: "abcdefgh",
        expiresAt: null,
      }),
    ).rejects.toThrow();
  });

  it("identity hardening: throws generic when the returned row's link_type is a structurally valid but non-REVIEW canonical type", async () => {
    const client = fakeRpcClient({ data: [{ ...successRow, link_type: "INTAKE" }] });
    await expect(
      supabaseAccessLinkStaffGateway.issueReviewLink(client, {
        projectId,
        tokenHash,
        tokenHint: "abcdefgh",
        expiresAt: null,
      }),
    ).rejects.toThrow();
  });
});

describe("supabaseAccessLinkStaffGateway.rotateAccessLink", () => {
  const successRow = {
    id: "44444444-4444-4444-4444-444444444444",
    project_id: projectId,
    link_type: "REVIEW",
    expires_at: null,
    created_at: "2026-09-19T00:00:00.000Z",
  };

  it("calls rotate_access_link with exactly p_project_id/p_access_link_id/p_new_token_hash/p_new_token_hint", async () => {
    let captured: { fn: string; params: Record<string, unknown> } | undefined;
    const client = fakeRpcClient({
      data: [successRow],
      captureCall: (fn, params) => {
        captured = { fn, params };
      },
    });

    await supabaseAccessLinkStaffGateway.rotateAccessLink(client, {
      projectId,
      accessLinkId: linkId,
      newTokenHash: tokenHash,
      newTokenHint: "abcdefgh",
    });

    expect(captured?.fn).toBe("rotate_access_link");
    expect(captured?.params).toEqual({
      p_project_id: projectId,
      p_access_link_id: linkId,
      p_new_token_hash: tokenHashHex,
      p_new_token_hint: "abcdefgh",
    });
  });

  it.each([
    ["AL001", "FORBIDDEN"],
    ["AL003", "NOT_FOUND"],
    ["AL004", "CONFLICT"],
    ["AL005", "CONFLICT"],
  ])("maps known RPC error code %s to ApiError(%s)", async (code, kind) => {
    const client = fakeRpcClient({ error: { code, message: "raw postgres detail" } });
    const error = await supabaseAccessLinkStaffGateway
      .rotateAccessLink(client, {
        projectId,
        accessLinkId: linkId,
        newTokenHash: tokenHash,
        newTokenHint: "abcdefgh",
      })
      .catch((e) => e);
    expect(error).toMatchObject({ kind });
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("throws generic on malformed RPC result", async () => {
    const client = fakeRpcClient({ data: [{ id: "not-a-uuid" }] });
    await expect(
      supabaseAccessLinkStaffGateway.rotateAccessLink(client, {
        projectId,
        accessLinkId: linkId,
        newTokenHash: tokenHash,
        newTokenHint: "abcdefgh",
      }),
    ).rejects.toThrow();
  });

  it("maps a valid, correctly-identified row to IssuedAccessLinkRecord (new id, matching project, canonical link_type preserved)", async () => {
    const client = fakeRpcClient({ data: [successRow] });
    const result = await supabaseAccessLinkStaffGateway.rotateAccessLink(client, {
      projectId,
      accessLinkId: linkId,
      newTokenHash: tokenHash,
      newTokenHint: "abcdefgh",
    });
    expect(result).toEqual({
      id: successRow.id,
      projectId,
      linkType: "REVIEW",
      expiresAt: null,
      createdAt: successRow.created_at,
    });
  });

  it("identity hardening: throws generic when the returned row belongs to a different project", async () => {
    const otherProjectId = "99999999-9999-9999-9999-999999999999";
    const client = fakeRpcClient({ data: [{ ...successRow, project_id: otherProjectId }] });
    await expect(
      supabaseAccessLinkStaffGateway.rotateAccessLink(client, {
        projectId,
        accessLinkId: linkId,
        newTokenHash: tokenHash,
        newTokenHint: "abcdefgh",
      }),
    ).rejects.toThrow();
  });

  it("identity hardening: throws generic when the returned row's id equals the source access-link id (rotation must always create a NEW row)", async () => {
    const client = fakeRpcClient({ data: [{ ...successRow, id: linkId }] });
    await expect(
      supabaseAccessLinkStaffGateway.rotateAccessLink(client, {
        projectId,
        accessLinkId: linkId,
        newTokenHash: tokenHash,
        newTokenHint: "abcdefgh",
      }),
    ).rejects.toThrow();
  });

  it.each(["INTAKE", "REVIEW", "PORTAL"] as const)(
    "identity hardening: does NOT pin link_type to a fixed value — a canonical %s on the (correctly new-id, correct-project) row is accepted",
    async (linkType) => {
      const client = fakeRpcClient({ data: [{ ...successRow, link_type: linkType }] });
      const result = await supabaseAccessLinkStaffGateway.rotateAccessLink(client, {
        projectId,
        accessLinkId: linkId,
        newTokenHash: tokenHash,
        newTokenHint: "abcdefgh",
      });
      expect(result.linkType).toBe(linkType);
    },
  );
});

describe("supabaseAccessLinkStaffGateway.revokeAccessLink", () => {
  const successRow = {
    id: linkId,
    project_id: projectId,
    link_type: "PORTAL",
    revoked_at: "2026-09-19T00:00:00.000Z",
  };

  it("calls revoke_access_link with exactly p_project_id/p_access_link_id", async () => {
    let captured: { fn: string; params: Record<string, unknown> } | undefined;
    const client = fakeRpcClient({
      data: [successRow],
      captureCall: (fn, params) => {
        captured = { fn, params };
      },
    });

    await supabaseAccessLinkStaffGateway.revokeAccessLink(client, {
      projectId,
      accessLinkId: linkId,
    });

    expect(captured?.fn).toBe("revoke_access_link");
    expect(captured?.params).toEqual({ p_project_id: projectId, p_access_link_id: linkId });
  });

  it("maps the RPC row to RevokedAccessLinkRecord", async () => {
    const client = fakeRpcClient({ data: [successRow] });
    const result = await supabaseAccessLinkStaffGateway.revokeAccessLink(client, {
      projectId,
      accessLinkId: linkId,
    });
    expect(result).toEqual({
      id: linkId,
      projectId,
      linkType: "PORTAL",
      revokedAt: successRow.revoked_at,
    });
  });

  it.each([
    ["AL001", "FORBIDDEN"],
    ["AL003", "NOT_FOUND"],
    ["AL004", "CONFLICT"],
  ])("maps known RPC error code %s to ApiError(%s)", async (code, kind) => {
    const client = fakeRpcClient({ error: { code, message: "raw postgres detail" } });
    const error = await supabaseAccessLinkStaffGateway
      .revokeAccessLink(client, { projectId, accessLinkId: linkId })
      .catch((e) => e);
    expect(error).toMatchObject({ kind });
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("throws generic on malformed RPC result (revoked_at missing)", async () => {
    const client = fakeRpcClient({ data: [{ ...successRow, revoked_at: null }] });
    await expect(
      supabaseAccessLinkStaffGateway.revokeAccessLink(client, { projectId, accessLinkId: linkId }),
    ).rejects.toThrow();
  });

  it("identity hardening: throws generic when the returned row belongs to a different project", async () => {
    const otherProjectId = "99999999-9999-9999-9999-999999999999";
    const client = fakeRpcClient({ data: [{ ...successRow, project_id: otherProjectId }] });
    await expect(
      supabaseAccessLinkStaffGateway.revokeAccessLink(client, { projectId, accessLinkId: linkId }),
    ).rejects.toThrow();
  });

  it("identity hardening: throws generic when the returned row's id differs from the requested access-link id (revoke mutates the exact target row, never a different one)", async () => {
    const otherLinkId = "55555555-5555-5555-5555-555555555555";
    const client = fakeRpcClient({ data: [{ ...successRow, id: otherLinkId }] });
    await expect(
      supabaseAccessLinkStaffGateway.revokeAccessLink(client, { projectId, accessLinkId: linkId }),
    ).rejects.toThrow();
  });
});
