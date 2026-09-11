/**
 * Typed error for the trusted staff server boundary (Task 004).
 *
 * `kind` distinguishes authentication failure (no valid Supabase identity)
 * from authorization failure (valid identity, not an active WeddingClick
 * staff member) per docs/SECURITY.md and the Task 004 HTTP error design.
 *
 * `message` on every throw site in this boundary is already safe to return
 * to an HTTP caller — never the raw Supabase/Postgres error text.
 */
export type StaffAuthErrorKind = "UNAUTHENTICATED" | "FORBIDDEN" | "INTERNAL";

export class StaffAuthError extends Error {
  readonly kind: StaffAuthErrorKind;

  constructor(kind: StaffAuthErrorKind, message: string) {
    super(message);
    this.name = "StaffAuthError";
    this.kind = kind;
  }
}
