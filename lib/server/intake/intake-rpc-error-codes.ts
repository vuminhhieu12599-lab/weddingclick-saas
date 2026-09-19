import type { ApiErrorKind } from "../errors/api-error";

/**
 * Stable business-error contract for `submit_intake_submission`,
 * `apply_intake_submission`, and `reject_intake_submission` (Task 027 Phase
 * 1 — see supabase/migrations/20260911041146_0026_intake_actions.sql).
 *
 * Keyed by the custom PostgreSQL SQLSTATE each RPC raises via
 * `RAISE EXCEPTION ... USING ERRCODE = 'ISxxx'` — never by matching the
 * free-form error message text (docs/SECURITY.md "never return raw
 * Supabase/Postgres error details").
 *
 * `message` here is a fixed, safe string owned by this application module —
 * the Postgres error's own `message` is deliberately never forwarded to a
 * caller, even for a recognized code.
 *
 * IS002 is intentionally absent (gap, not a typo). An earlier authoring pass
 * reserved it for an in-function service-role self-check
 * (`auth.role() = 'service_role'`) inside `submit_intake_submission`.
 * Independent review (Task 027 Phase 1 Patch 1, Finding A) rejected that
 * mechanism: `submit_intake_submission`'s sole caller-identity boundary is
 * the explicit `GRANT EXECUTE TO service_role` privilege on that exact
 * function signature — the standard PostgreSQL function-call authorization
 * primitive, not something requiring an additional in-body check. IS003
 * through IS008 are left at their original numbers (no renumbering) to
 * minimize review churn.
 *
 * IS003 (project not found) and IS007 (submission not found) are
 * deliberately distinct codes, not collapsed like Task 026's AL003 — see
 * the migration header ERROR CONTRACT section: apply/reject are
 * authenticated-staff-only, not the anti-enumeration-sensitive
 * customer-facing surface D4's collapsing was written for.
 *
 * This map covers only ISxxx (Task-027-native) codes. `apply_intake_
 * submission` additionally composes with Task 022's frozen
 * `save_wedding_details()` (see the migration header's TASK 022 ERROR
 * PROPAGATION section) and does not catch or re-wrap what it raises — a
 * WDxxx SQLSTATE (at minimum WD004, the Gift QR media same-Project FK
 * violation) can propagate out of `apply_intake_submission` completely
 * unchanged. WD004 is deliberately NOT duplicated into this map: it
 * already has its own stable, tested mapping — `kind: "INVARIANT"`
 * (HTTP 422) — in
 * `lib/server/wedding-details/wedding-details-rpc-error-codes.ts`'s
 * `SAVE_WEDDING_DETAILS_RPC_ERROR_CODES`. Phase 2's apply error-mapping
 * code must check a caught SQLSTATE against both maps — this one first for
 * ISxxx, then `SAVE_WEDDING_DETAILS_RPC_ERROR_CODES` for a propagated
 * WDxxx — before falling back to a generic HTTP 500 for anything neither
 * map recognizes.
 *
 * Any SQLSTATE not present in either map is an unexpected database failure
 * and must map to a generic HTTP 500.
 */
export const INTAKE_RPC_ERROR_CODES: Readonly<
  Record<string, { kind: ApiErrorKind; message: string }>
> = {
  IS001: { kind: "FORBIDDEN", message: "Active WeddingClick staff role required" },
  IS003: { kind: "NOT_FOUND", message: "Project not found" },
  IS004: { kind: "NOT_FOUND", message: "Access link not found" },
  IS005: { kind: "REVOKED_TOKEN", message: "Access link has been revoked" },
  IS006: { kind: "EXPIRED_TOKEN", message: "Access link has expired" },
  IS007: { kind: "NOT_FOUND", message: "Intake submission not found" },
  IS008: { kind: "CONFLICT", message: "Intake submission is not pending" },
};
