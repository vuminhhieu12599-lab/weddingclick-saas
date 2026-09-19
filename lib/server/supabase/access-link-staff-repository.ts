import type { SupabaseClient } from "@supabase/supabase-js";

import { ACCESS_LINK_TYPES, type AccessLinkType } from "../../domain";
import type { AccessLinkStaffGateway } from "../access-links/access-link-staff-gateway";
import { ACCESS_LINK_RPC_ERROR_CODES } from "../access-links/access-link-rpc-error-codes";
import type {
  DirectIssueAccessLinkRow,
  IssuedAccessLinkRecord,
  RevokeAccessLinkParams,
  RevokedAccessLinkRecord,
  ReviewIssueAccessLinkParams,
  RotateAccessLinkParams,
} from "../access-links/access-link-staff-types";
import { ApiError } from "../errors/api-error";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";
import { toPostgresByteaHexLiteral } from "./postgres-bytea";

/**
 * Production AccessLinkStaffGateway (Task 026 Phase 3): the only place that
 * issues real @supabase/supabase-js calls for staff-invoked access-link
 * issuance/rotation/revocation. Always invoked with a staff-scoped client
 * (Task 004's createStaffSupabaseClient) — never `service_role`
 * (docs/DECISIONS.md D11). Deliberately isolated from
 * lib/server/supabase/access-link-resolution-repository.ts (Phase 2,
 * service_role-backed token resolution) — no shared import, no shared
 * client, no shared type (see the Phase 3 static-security-review test).
 *
 * INTAKE/PORTAL issuance is a plain direct-RLS INSERT
 * (docs/API_CONTRACT.md §7.4) sending exactly the six D12 columns. REVIEW
 * issuance, rotation, and revocation each call exactly one of the three
 * migration-0025 trusted RPCs (issue_review_link / rotate_access_link /
 * revoke_access_link) — no generic `.rpc()` passthrough, no direct
 * REVIEW INSERT (the migration's own RLS tightening blocks that at the DB
 * layer regardless), no direct UPDATE of revoked_at/token_hash/token_hint.
 */
const ISSUED_ACCESS_LINK_COLUMNS = "id, project_id, link_type, expires_at, created_at";

interface IssuedAccessLinkRow {
  id: string;
  project_id: string;
  link_type: string;
  expires_at: string | null;
  created_at: string;
}

interface RevokedAccessLinkRow {
  id: string;
  project_id: string;
  link_type: string;
  revoked_at: string | null;
}

function isAccessLinkType(value: unknown): value is AccessLinkType {
  return typeof value === "string" && (ACCESS_LINK_TYPES as readonly string[]).includes(value);
}

function isNullableTimestamptzString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && isValidTimestamptz(value));
}

function isTimestamptzString(value: unknown): value is string {
  return typeof value === "string" && isValidTimestamptz(value);
}

/**
 * Runtime shape hardening (mirrors the Task 025/026-Phase-2 repository
 * pattern) — a TypeScript cast alone is never trusted for a mutation
 * result.
 */
function isIssuedAccessLinkRow(row: unknown): row is IssuedAccessLinkRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }
  const candidate = row as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    isValidUuid(candidate.id) &&
    typeof candidate.project_id === "string" &&
    isValidUuid(candidate.project_id) &&
    isAccessLinkType(candidate.link_type) &&
    isNullableTimestamptzString(candidate.expires_at) &&
    isTimestamptzString(candidate.created_at)
  );
}

function isRevokedAccessLinkRow(row: unknown): row is RevokedAccessLinkRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }
  const candidate = row as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    isValidUuid(candidate.id) &&
    typeof candidate.project_id === "string" &&
    isValidUuid(candidate.project_id) &&
    isAccessLinkType(candidate.link_type) &&
    isTimestamptzString(candidate.revoked_at)
  );
}

function toIssuedAccessLinkRecord(row: IssuedAccessLinkRow): IssuedAccessLinkRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    linkType: row.link_type as AccessLinkType,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function toRevokedAccessLinkRecord(row: RevokedAccessLinkRow): RevokedAccessLinkRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    linkType: row.link_type as AccessLinkType,
    revokedAt: row.revoked_at as string,
  };
}

function mapRpcError(error: { code: string; message: string }, fallbackMessage: string): never {
  const known = ACCESS_LINK_RPC_ERROR_CODES[error.code];
  if (known) {
    throw new ApiError(known.kind, known.message);
  }
  throw new Error(fallbackMessage);
}

/**
 * Result-shape hardening (mirrors project-lifecycle-repository.ts). Each
 * RPC is declared `RETURNS TABLE` for exactly one row — a client-library
 * result that is null, an empty array, or more than one row is always an
 * unexpected failure shape, never forwarded to the caller.
 */
function extractSingleRow(data: unknown, fallbackMessage: string): unknown {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(fallbackMessage);
  }
  return data[0];
}

export const supabaseAccessLinkStaffGateway: AccessLinkStaffGateway<SupabaseClient> = {
  async projectExists(client, projectId: string): Promise<boolean> {
    const { data, error } = await client
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query project");
    }

    return data !== null;
  },

  /**
   * Direct staff-RLS INSERT — INTAKE/PORTAL only (enforced by
   * `project_access_links_insert_staff`, migration 0025). Sends exactly the
   * six columns migration 0025's column-level GRANT permits; `id` and
   * `created_at` come from their column DEFAULTs, `revoked_at`/
   * `last_used_at` are never SQL-writable at INSERT time at all. Never
   * SELECTs token_hash/token_hint back.
   */
  async issueDirectAccessLink(
    client,
    row: DirectIssueAccessLinkRow,
  ): Promise<IssuedAccessLinkRecord> {
    const { data, error } = await client
      .from("project_access_links")
      .insert({
        project_id: row.projectId,
        link_type: row.linkType,
        token_hash: toPostgresByteaHexLiteral(row.tokenHash),
        token_hint: row.tokenHint,
        expires_at: row.expiresAt,
        created_by: row.createdBy,
      })
      .select(ISSUED_ACCESS_LINK_COLUMNS)
      .single();

    if (error) {
      throw new Error("Failed to issue access link");
    }

    if (!isIssuedAccessLinkRow(data)) {
      throw new Error("Failed to issue access link");
    }

    if (data.project_id !== row.projectId || data.link_type !== row.linkType) {
      throw new Error("Failed to issue access link");
    }

    return toIssuedAccessLinkRecord(data);
  },

  async issueReviewLink(
    client,
    params: ReviewIssueAccessLinkParams,
  ): Promise<IssuedAccessLinkRecord> {
    const { data, error } = await client.rpc("issue_review_link", {
      p_project_id: params.projectId,
      p_token_hash: toPostgresByteaHexLiteral(params.tokenHash),
      p_token_hint: params.tokenHint,
      p_expires_at: params.expiresAt,
    });

    if (error) {
      mapRpcError(error, "Failed to issue review link");
    }

    const row = extractSingleRow(data, "Failed to issue review link");

    if (!isIssuedAccessLinkRow(row)) {
      throw new Error("Failed to issue review link");
    }

    // Mutation-result identity hardening: a structurally valid row for the
    // wrong project or the wrong link_type is never forwarded as a success,
    // even though isIssuedAccessLinkRow already proved it is shape-valid.
    // Timestamps are deliberately not compared byte-for-byte — Postgres may
    // normalize a timestamptz's textual representation.
    if (row.project_id !== params.projectId || row.link_type !== "REVIEW") {
      throw new Error("Failed to issue review link");
    }

    return toIssuedAccessLinkRecord(row);
  },

  async rotateAccessLink(
    client,
    params: RotateAccessLinkParams,
  ): Promise<IssuedAccessLinkRecord> {
    const { data, error } = await client.rpc("rotate_access_link", {
      p_project_id: params.projectId,
      p_access_link_id: params.accessLinkId,
      p_new_token_hash: toPostgresByteaHexLiteral(params.newTokenHash),
      p_new_token_hint: params.newTokenHint,
    });

    if (error) {
      mapRpcError(error, "Failed to rotate access link");
    }

    const row = extractSingleRow(data, "Failed to rotate access link");

    if (!isIssuedAccessLinkRow(row)) {
      throw new Error("Failed to rotate access link");
    }

    // Mutation-result identity hardening: the replacement row must belong to
    // the requested project, and — because rotation always revokes the exact
    // source row and inserts a NEW row (migration 0025, D8) — its id must
    // differ from the source access-link id. link_type is deliberately not
    // pinned to a fixed value here: rotation legitimately preserves whichever
    // canonical type (INTAKE/REVIEW/PORTAL) the source row already had;
    // isIssuedAccessLinkRow already proved it is one of the three canonical
    // values.
    if (row.project_id !== params.projectId || row.id === params.accessLinkId) {
      throw new Error("Failed to rotate access link");
    }

    return toIssuedAccessLinkRecord(row);
  },

  async revokeAccessLink(
    client,
    params: RevokeAccessLinkParams,
  ): Promise<RevokedAccessLinkRecord> {
    const { data, error } = await client.rpc("revoke_access_link", {
      p_project_id: params.projectId,
      p_access_link_id: params.accessLinkId,
    });

    if (error) {
      mapRpcError(error, "Failed to revoke access link");
    }

    const row = extractSingleRow(data, "Failed to revoke access link");

    if (!isRevokedAccessLinkRow(row)) {
      throw new Error("Failed to revoke access link");
    }

    // Mutation-result identity hardening: revocation mutates the exact
    // target row in place (no new row is created), so the returned id must
    // equal the requested access-link id, and it must belong to the
    // requested project.
    if (row.project_id !== params.projectId || row.id !== params.accessLinkId) {
      throw new Error("Failed to revoke access link");
    }

    return toRevokedAccessLinkRecord(row);
  },
};
