import type { ApiErrorKind } from "../errors/api-error";

/**
 * Stable business-error contract for `create_review_version` (migration
 * 0036), keyed by the custom SQLSTATE it raises — never by message text.
 * Messages are fixed, safe application strings. RV007 (payload/binding
 * inconsistency — a server defect, never caller input) is deliberately
 * unmapped, as is every other SQLSTATE: those surface as a generic 500.
 */
export const REVIEW_RPC_ERROR_CODES: Readonly<Record<string, { kind: ApiErrorKind; message: string }>> = {
  RV001: { kind: "FORBIDDEN", message: "Active WeddingClick staff role required" },
  RV002: { kind: "NOT_FOUND", message: "Project not found" },
  RV003: { kind: "INVARIANT", message: "Variant is not required by the Project package" },
  RV004: { kind: "INVARIANT", message: "Project package has no invitation variant policy" },
  RV005: { kind: "CONFLICT", message: "Project design is not configured" },
  RV006: { kind: "CONFLICT", message: "Project design changed; reload and try again" },
  RV008: { kind: "CONFLICT", message: "Current review version has changed; reload and try again" },
  RV009: { kind: "CONFLICT", message: "Project media changed; reload and try again" },
  // Migration 0037: post-publication states never reopen review here (Task 031).
  RV010: { kind: "CONFLICT", message: "Project status does not allow a new review version" },
};
