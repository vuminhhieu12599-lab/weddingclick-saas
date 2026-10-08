import type { ApiErrorKind } from "../errors/api-error";

/**
 * Stable business-error contract for `set_project_template_media_slot`
 * (migration 0046, TE-03B), keyed by the custom SQLSTATE it raises — never
 * by message text. Messages are fixed, safe application strings; the
 * Postgres message is never forwarded. Any other SQLSTATE is a generic 500.
 */
export const TEMPLATE_MEDIA_SLOT_RPC_ERROR_CODES: Readonly<Record<string, { kind: ApiErrorKind; message: string }>> = {
  TM001: { kind: "FORBIDDEN", message: "Active WeddingClick staff role required" },
  TM002: { kind: "NOT_FOUND", message: "Project not found" },
  TM003: { kind: "CONFLICT", message: "Project design is not configured" },
  TM004: { kind: "CONFLICT", message: "Project template version changed; reload and try again" },
  TM005: { kind: "BAD_REQUEST", message: "Invalid template media slot input" },
  TM006: { kind: "BAD_REQUEST", message: "The same photo cannot appear twice in one slot" },
  TM007: { kind: "INVARIANT", message: "Only this Project's photos can be assigned to a template media slot" },
};
