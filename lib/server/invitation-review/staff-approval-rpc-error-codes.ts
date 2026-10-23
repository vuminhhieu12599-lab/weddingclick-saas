import type { ApiErrorKind } from "../errors/api-error";

/**
 * TE-06 — stable business-error contract for `staff_confirm_review_approval`
 * (migration 0053), keyed by the custom SQLSTATE it raises, never by message
 * text. Messages are fixed, safe application strings. Every unmapped
 * SQLSTATE surfaces as a generic 500, so a database defect never leaks
 * detail to the browser.
 */
export const STAFF_APPROVAL_RPC_ERROR_CODES: Readonly<Record<string, { kind: ApiErrorKind; message: string }>> = {
  SA001: { kind: "FORBIDDEN", message: "Active WeddingClick staff role required" },
  SA002: { kind: "NOT_FOUND", message: "Project not found" },
  SA003: { kind: "INVARIANT", message: "Project package has no invitation variant policy" },
  SA004: { kind: "INVARIANT", message: "Variant is not required by the Project package" },
  SA005: { kind: "BAD_REQUEST", message: "Approval confirmation channel is not recognized" },
  SA006: { kind: "BAD_REQUEST", message: "Internal note must be 2000 characters or fewer" },
  SA007: { kind: "CONFLICT", message: "Project is not open for review approval" },
  SA008: { kind: "NOT_FOUND", message: "Review version not found" },
  SA009: { kind: "CONFLICT", message: "Review version has been superseded" },
  SA010: { kind: "CONFLICT", message: "Current review version has changed; reload and try again" },
  SA011: { kind: "CONFLICT", message: "A decision has already been recorded for this review version" },
};
