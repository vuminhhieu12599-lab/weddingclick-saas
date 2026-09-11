import type { ApiErrorKind } from "../errors/api-error";

/**
 * Stable business-error contract for `create_project_with_addons` (Task
 * 005B — see supabase/migrations/20260911041125_0006b_atomic_project_creation_rpc.sql).
 *
 * Keyed by the custom PostgreSQL SQLSTATE the RPC raises via
 * `RAISE EXCEPTION ... USING ERRCODE = 'WCxxx'` — never by matching the
 * free-form error message text, which is not a stable contract
 * (docs/SECURITY.md "never return raw Supabase/Postgres error details").
 *
 * `message` here is a fixed, safe string owned by this application module —
 * the Postgres error's own `message` is deliberately never forwarded to a
 * caller, even for a recognized code.
 *
 * Any SQLSTATE not present in this map is an unexpected database failure
 * and must map to a generic HTTP 500 (see project-repository.ts).
 */
export const CREATE_PROJECT_RPC_ERROR_CODES: Readonly<
  Record<string, { kind: ApiErrorKind; message: string }>
> = {
  WC001: { kind: "NOT_FOUND", message: "Customer not found" },
  WC002: { kind: "NOT_FOUND", message: "Package not found" },
  WC003: { kind: "CONFLICT", message: "Package is not currently active" },
  WC004: { kind: "BAD_REQUEST", message: "Duplicate addon code in request" },
  WC005: { kind: "NOT_FOUND", message: "Add-on not found" },
  WC006: { kind: "CONFLICT", message: "Add-on is not currently active" },
  WC007: {
    kind: "NOT_FOUND",
    message: "assignedStaffId does not resolve to an active WeddingClick staff profile",
  },
  WC008: { kind: "FORBIDDEN", message: "Active WeddingClick staff role required" },
};
