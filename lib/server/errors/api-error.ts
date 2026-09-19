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
  | "EXPIRED_TOKEN"
  | "REVOKED_TOKEN"
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
 * `BAD_REQUEST` (400, malformed/missing/wrong-type input). `EXPIRED_TOKEN`
 * and `REVOKED_TOKEN` (410) were added by Task 026 Phase 2
 * (docs/DECISIONS.md D3/D4, docs/API_CONTRACT.md §5): a known customer
 * access link, correct purpose/project, that has expired or been revoked —
 * distinct from `NOT_FOUND` (404), which covers every token failure that is
 * not expiry/revocation (malformed shape, unknown hash, wrong purpose,
 * wrong project). Every previously existing mapping is unchanged.
 */
export function apiErrorStatus(
  kind: ApiErrorKind,
): 400 | 403 | 404 | 409 | 410 | 422 | 500 {
  switch (kind) {
    case "BAD_REQUEST":
      return 400;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "EXPIRED_TOKEN":
      return 410;
    case "REVOKED_TOKEN":
      return 410;
    case "INVARIANT":
      return 422;
    case "INTERNAL":
      return 500;
  }
}
