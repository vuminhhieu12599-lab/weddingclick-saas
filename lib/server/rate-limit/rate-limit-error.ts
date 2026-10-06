/**
 * Task 035A typed abuse-control refusal (docs/API_CONTRACT.md §5 rows
 * `RATE_LIMITED` 429 / `SERVICE_UNAVAILABLE` 503). Deliberately separate from
 * `ApiError` so the staff error mapping (`apiErrorStatus`) is untouched; only
 * the public/capability handlers that run a post-resolution guard map it.
 * Messages are fixed and generic — no key, IP, token state or provider.
 */
export const RATE_LIMITED_MESSAGE = "Too many requests";
export const SERVICE_UNAVAILABLE_MESSAGE = "Service temporarily unavailable";

export type RateLimitGuardErrorKind = "RATE_LIMITED" | "SERVICE_UNAVAILABLE";

export class RateLimitGuardError extends Error {
  readonly kind: RateLimitGuardErrorKind;
  readonly status: 429 | 503;

  constructor(kind: RateLimitGuardErrorKind) {
    super(kind === "RATE_LIMITED" ? RATE_LIMITED_MESSAGE : SERVICE_UNAVAILABLE_MESSAGE);
    this.name = "RateLimitGuardError";
    this.kind = kind;
    this.status = kind === "RATE_LIMITED" ? 429 : 503;
  }
}
