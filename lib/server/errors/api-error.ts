/**
 * Typed error for Task 005 internal business-operation use cases
 * (Customers, Projects), separate from StaffAuthError (Task 004's
 * authentication/authorization boundary — see ../auth/staff-auth-error.ts).
 *
 * `message` on every throw site in this module is already safe to return to
 * an HTTP caller — never raw Supabase/Postgres error text (docs/SECURITY.md
 * "never return raw Supabase/Postgres error details").
 */
export type ApiErrorKind = "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "INTERNAL";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
  }
}

/** CLAUDE.md §34 / task-suggested HTTP semantics. */
export function apiErrorStatus(kind: ApiErrorKind): 400 | 404 | 409 | 500 {
  switch (kind) {
    case "BAD_REQUEST":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "INTERNAL":
      return 500;
  }
}
