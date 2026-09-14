import type { ApiErrorKind } from "../errors/api-error";

/**
 * Stable business-error contract for `save_wedding_details` (Task 022 — see
 * supabase/migrations/20260911041141_0021_save_wedding_details.sql).
 *
 * Keyed by the custom PostgreSQL SQLSTATE the RPC raises via
 * `RAISE EXCEPTION ... USING ERRCODE = 'WDxxx'` — never by matching the
 * free-form error message text (docs/SECURITY.md "never return raw
 * Supabase/Postgres error details").
 *
 * `message` here is a fixed, safe string owned by this application module —
 * the Postgres error's own `message` is deliberately never forwarded to a
 * caller, even for a recognized code.
 *
 * Task 022 error-contract patch: WD003 and WD004 both map to `INVARIANT`
 * (422) — "well-formed input violates a business rule" per
 * docs/API_CONTRACT.md §5 — not `BAD_REQUEST` (400). Neither condition is
 * malformed input: the submitted UUID/Project id is syntactically valid in
 * both cases, but the request violates a same-Project / same-event-type
 * business invariant the database enforces.
 *
 * WD003 (target Project is not a WEDDING project) is unreachable today —
 * `projects.event_type` currently carries a DB `CHECK (event_type IN
 * ('WEDDING'))` (migration 0005) — but is deliberately mapped anyway (not
 * left to fall through to a generic 500) so the RPC's contract stays
 * correct if `EventType` expands later without this map being revisited.
 *
 * Any SQLSTATE not present in this map is an unexpected database failure
 * and must map to a generic HTTP 500 (see wedding-details-repository.ts).
 */
export const SAVE_WEDDING_DETAILS_RPC_ERROR_CODES: Readonly<
  Record<string, { kind: ApiErrorKind; message: string }>
> = {
  WD001: { kind: "FORBIDDEN", message: "Active WeddingClick staff role required" },
  WD002: { kind: "NOT_FOUND", message: "Project not found" },
  WD003: { kind: "INVARIANT", message: "Target Project is not a WEDDING project" },
  WD004: {
    kind: "INVARIANT",
    message: "Gift QR media reference must belong to the same Project",
  },
};
