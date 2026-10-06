/**
 * Task 035A — frozen V2 abuse-control rule table (docs/SECURITY.md §11.1,
 * docs/API_CONTRACT.md §27). Owner-approved thresholds; every rule is a
 * SLIDING WINDOW counted in the shared Upstash Redis store, never in process
 * memory.
 *
 * Two layers:
 *   - `ip` rules run BEFORE any token resolution, keyed on the SHA-256 digest
 *     of the normalized trusted client IP (never the raw IP or a token), so a
 *     429 is independent of credential validity.
 *   - `link` / `guest` rules run only AFTER the frozen resolution succeeded,
 *     keyed on the resolved non-secret `accessLinkId` / `guestId` (never a raw
 *     token or a stored `token_hash`).
 *
 * Failure policy (owner decision): TOKEN_PAGE reads fail OPEN when the store
 * is unavailable; every state-changing rule fails CLOSED (503).
 *
 * The generic public invitation `/i/[slug]` and every staff
 * `/api/v2/internal/**` route are deliberately absent.
 */

/** Application/version namespace of every limiter key; bump the version to start fresh counters. */
export const RATE_LIMIT_NAMESPACE = "wc:v1";

export type RateLimitSubjectKind = "ip" | "link" | "guest";

export type RateLimitBackendFailurePolicy = "FAIL_OPEN" | "FAIL_CLOSED";

export interface RateLimitRule {
  /** Key segment after the namespace, e.g. `wc:v1:<segment>:<subject>`. */
  readonly segment: string;
  readonly subject: RateLimitSubjectKind;
  readonly limit: number;
  readonly windowSeconds: number;
  readonly onBackendFailure: RateLimitBackendFailurePolicy;
}

export const RATE_LIMIT_RULES = {
  /** /i/[slug]/g/[token], /review/[token], /review/[token]/frame, /portal/[token] (proxy.ts). */
  TOKEN_PAGE_IP: { segment: "token-page", subject: "ip", limit: 120, windowSeconds: 60, onBackendFailure: "FAIL_OPEN" },
  /** POST /api/v2/public/rsvp — generic and personalized. */
  PUBLIC_WRITE_IP: { segment: "public-write", subject: "ip", limit: 60, windowSeconds: 600, onBackendFailure: "FAIL_CLOSED" },
  /** Review feedback, Intake submission, Portal guest mutations and link ISSUE/REGENERATE share one per-IP budget. */
  CAPABILITY_MUTATION_IP: { segment: "capability-mutation", subject: "ip", limit: 60, windowSeconds: 600, onBackendFailure: "FAIL_CLOSED" },
  /** Personalized RSVP, after the guest token resolved to an active guest. */
  GUEST_RSVP_GUEST: { segment: "guest-rsvp", subject: "guest", limit: 20, windowSeconds: 600, onBackendFailure: "FAIL_CLOSED" },
  /** Review feedback (COMMENT / REVISION_REQUEST / APPROVAL alike), after REVIEW resolution. */
  REVIEW_FEEDBACK_LINK: { segment: "review-feedback", subject: "link", limit: 20, windowSeconds: 600, onBackendFailure: "FAIL_CLOSED" },
  /** Intake submission, after INTAKE resolution. */
  INTAKE_LINK: { segment: "intake", subject: "link", limit: 5, windowSeconds: 3600, onBackendFailure: "FAIL_CLOSED" },
  /** Portal guest create / edit / revoke, after PORTAL resolution. */
  PORTAL_MUTATION_LINK: { segment: "portal-mutation", subject: "link", limit: 120, windowSeconds: 3600, onBackendFailure: "FAIL_CLOSED" },
  /** Portal personalized link ISSUE and REGENERATE, per target guest of the resolved Project. */
  GUEST_LINK_MINT_GUEST: { segment: "guest-link-mint", subject: "guest", limit: 5, windowSeconds: 3600, onBackendFailure: "FAIL_CLOSED" },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitRuleId = keyof typeof RATE_LIMIT_RULES;

/** Upstash key prefix of a rule: `wc:v1:<segment>`. */
export function rateLimitKeyPrefix(rule: RateLimitRule): string {
  return `${RATE_LIMIT_NAMESPACE}:${rule.segment}`;
}
