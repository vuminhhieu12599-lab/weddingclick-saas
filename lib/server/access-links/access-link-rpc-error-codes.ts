import type { ApiErrorKind } from "../errors/api-error";

/**
 * Stable business-error contract for `issue_review_link`,
 * `rotate_access_link`, and `revoke_access_link` (Task 026 — see
 * supabase/migrations/20260911041145_0025_access_link_actions.sql).
 *
 * Keyed by the custom PostgreSQL SQLSTATE each RPC raises via
 * `RAISE EXCEPTION ... USING ERRCODE = 'ALxxx'` — never by matching the
 * free-form error message text (docs/SECURITY.md "never return raw
 * Supabase/Postgres error details").
 *
 * `message` here is a fixed, safe string owned by this application module —
 * the Postgres error's own `message` is deliberately never forwarded to a
 * caller, even for a recognized code.
 *
 * All three functions share this one ALxxx range (mirrors 0022's PExxx and
 * 0024's PLxxx shared-range precedent) — AL001 is common to all three;
 * AL002 is raised only by issue_review_link; AL003/AL004 are raised by both
 * rotate_access_link and revoke_access_link; AL005 is raised only by
 * rotate_access_link. See the migration file's header ERROR CONTRACT
 * section for the exact condition each code represents.
 *
 * Any SQLSTATE not present in this map is an unexpected database failure
 * (including a token_hash CHECK/duplicate collision — deliberately left
 * unmapped, see the migration header) and must map to a generic HTTP 500.
 */
export const ACCESS_LINK_RPC_ERROR_CODES: Readonly<
  Record<string, { kind: ApiErrorKind; message: string }>
> = {
  AL001: { kind: "FORBIDDEN", message: "Active WeddingClick staff role required" },
  AL002: { kind: "NOT_FOUND", message: "Project not found" },
  AL003: { kind: "NOT_FOUND", message: "Access link not found" },
  AL004: { kind: "CONFLICT", message: "Access link is already revoked" },
  AL005: {
    kind: "CONFLICT",
    message: "Access link is expired and cannot be rotated",
  },
};
