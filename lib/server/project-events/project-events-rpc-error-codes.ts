import type { ApiErrorKind } from "../errors/api-error";

/**
 * Stable business-error contract for create_project_event /
 * update_project_event / delete_project_event (Task 023 — see
 * supabase/migrations/20260911041142_0022_project_events_actions.sql).
 *
 * Keyed by the custom PostgreSQL SQLSTATE each RPC raises via
 * `RAISE EXCEPTION ... USING ERRCODE = 'PExxx'` — never by matching the
 * free-form error message text (docs/SECURITY.md "never return raw
 * Supabase/Postgres error details").
 *
 * `message` here is a fixed, safe string owned by this application module —
 * the Postgres error's own `message` is deliberately never forwarded to a
 * caller, even for a recognized code.
 *
 * PE003 and PE005 map to `INVARIANT` (422) per docs/API_CONTRACT.md §5 —
 * "well-formed input violates a business rule" — not `BAD_REQUEST` (400).
 * Neither condition is malformed input: the submitted values are
 * syntactically valid in both cases, but the request violates a
 * same-Project-event-type / one-primary-per-side business invariant the
 * database enforces.
 *
 * PE003 (target Project is not a WEDDING project) is unreachable today —
 * `projects.event_type` currently carries a DB `CHECK (event_type IN
 * ('WEDDING'))` (migration 0005) — but is deliberately mapped anyway (not
 * left to fall through to a generic 500), mirroring WD003
 * (wedding-details-rpc-error-codes.ts).
 *
 * PE004 (target Event not found for the target Project) deliberately maps
 * to the same `NOT_FOUND`/404 whether the event id does not exist at all or
 * exists under a different Project — see the migration header's
 * anti-enumeration note.
 *
 * Any SQLSTATE not present in this map is an unexpected database failure
 * and must map to a generic HTTP 500 (see project-events-repository.ts).
 */
export const PROJECT_EVENTS_RPC_ERROR_CODES: Readonly<
  Record<string, { kind: ApiErrorKind; message: string }>
> = {
  PE001: { kind: "FORBIDDEN", message: "Active WeddingClick staff role required" },
  PE002: { kind: "NOT_FOUND", message: "Project not found" },
  PE003: { kind: "INVARIANT", message: "Target Project is not a WEDDING project" },
  PE004: { kind: "NOT_FOUND", message: "Event not found" },
  PE005: {
    kind: "INVARIANT",
    message: "Another event is already marked primary for this Project/side",
  },
};
