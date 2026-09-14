/**
 * Typed error for Task 005 internal business-operation use cases
 * (Customers, Projects), separate from StaffAuthError (Task 004's
 * authentication/authorization boundary — see ../auth/staff-auth-error.ts).
 *
 * `message` on every throw site in this module is already safe to return to
 * an HTTP caller — never raw Supabase/Postgres error text (docs/SECURITY.md
 * "never return raw Supabase/Postgres error details").
 */
export type ApiErrorKind =
  | "BAD_REQUEST"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVARIANT"
  | "INTERNAL";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
  }
}

/**
 * CLAUDE.md §34 / docs/API_CONTRACT.md §5 (frozen error model) HTTP
 * semantics. `INVARIANT` (422) was added by Task 022's error-contract patch
 * — "well-formed input violates a business rule" (e.g. a syntactically
 * valid UUID that violates a same-Project invariant) — distinct from
 * `BAD_REQUEST` (400, malformed/missing/wrong-type input). Every existing
 * mapping is unchanged.
 */
export function apiErrorStatus(kind: ApiErrorKind): 400 | 403 | 404 | 409 | 422 | 500 {
  switch (kind) {
    case "BAD_REQUEST":
      return 400;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "INVARIANT":
      return 422;
    case "INTERNAL":
      return 500;
  }
}
