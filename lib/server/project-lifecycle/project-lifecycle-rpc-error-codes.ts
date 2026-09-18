import type { ApiErrorKind } from "../errors/api-error";

/**
 * Stable business-error contract for `transition_project_status`,
 * `mark_project_paid`, and `reassign_project_staff` (Task 025 — see
 * supabase/migrations/20260911041144_0024_project_lifecycle_payment_assignment.sql).
 *
 * Keyed by the custom PostgreSQL SQLSTATE each RPC raises via
 * `RAISE EXCEPTION ... USING ERRCODE = 'PLxxx'` — never by matching the
 * free-form error message text (docs/SECURITY.md "never return raw
 * Supabase/Postgres error details").
 *
 * `message` here is a fixed, safe string owned by this application module —
 * the Postgres error's own `message` is deliberately never forwarded to a
 * caller, even for a recognized code.
 *
 * All three functions share this one PLxxx range (mirrors 0022's three
 * project_events functions sharing one PExxx range) — PL001/PL002 are
 * common to all three; PL003/PL004/PL005/PL006/PL010 are raised only by
 * transition_project_status; PL006 (reused)/PL007 are raised only by
 * mark_project_paid; PL008/PL009 are raised only by reassign_project_staff.
 * See the migration file's header ERROR CONTRACT section for the exact
 * condition each code represents.
 *
 * Any SQLSTATE not present in this map is an unexpected database failure
 * and must map to a generic HTTP 500.
 */
export const PROJECT_LIFECYCLE_RPC_ERROR_CODES: Readonly<
  Record<string, { kind: ApiErrorKind; message: string }>
> = {
  PL001: { kind: "FORBIDDEN", message: "Active WeddingClick staff role required" },
  PL002: { kind: "NOT_FOUND", message: "Project not found" },
  PL003: {
    kind: "BAD_REQUEST",
    message: "Target status is not a recognized project status",
  },
  PL004: { kind: "CONFLICT", message: "Project already has the requested status" },
  PL005: { kind: "INVARIANT", message: "That status transition is not allowed" },
  PL006: {
    kind: "INVARIANT",
    message: "Project payment status does not allow this operation",
  },
  PL007: { kind: "CONFLICT", message: "Project is already marked paid" },
  PL008: {
    kind: "CONFLICT",
    message: "Project is already assigned to that staff member",
  },
  PL009: {
    kind: "INVARIANT",
    message: "Assigned staff member must be an active STAFF or ADMIN profile",
  },
  PL010: { kind: "BAD_REQUEST", message: "Reason must be 2000 characters or fewer" },
};
