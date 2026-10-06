import { createHmac } from "node:crypto";

import { isValidUuid } from "../validation/uuid";
import type { RateLimitRule } from "./rate-limit-policy";

/**
 * Task 035A — limiter seam. Guards depend only on this interface; the
 * production implementation is the Upstash adapter
 * (./upstash-rate-limit-store.ts) and tests use a deterministic fake. Business
 * use cases never see it.
 */

declare const subjectBrand: unique symbol;

/**
 * A limiter identity: `ip:<hmac-sha256 hex>`, `link:<uuid>` or `guest:<uuid>`.
 * Only the three constructors below produce one, so a raw IP, raw token or
 * stored token hash can never become a key.
 */
export type RateLimitSubject = string & { readonly [subjectBrand]: true };

/** Shared bucket for requests whose trusted client IP could not be determined (never a bypass). */
const UNRESOLVED_CLIENT = "unresolved";

/**
 * Fixed diagnostic categories — the only things the limiter ever logs. Never a
 * secret, IP, derived digest, token, key or provider detail.
 */
export const RATE_LIMIT_DIAGNOSTICS = {
  NOT_CONFIGURED: "[rate-limit] RATE_LIMIT_BACKEND_NOT_CONFIGURED",
  UNAVAILABLE: "[rate-limit] RATE_LIMIT_BACKEND_UNAVAILABLE",
  IDENTITY_NOT_CONFIGURED: "[rate-limit] RATE_LIMIT_IDENTITY_NOT_CONFIGURED",
} as const;

/**
 * `RATE_LIMIT_IP_HMAC_SECRET`: server-only, independent of every other
 * credential, ≥ 32 random bytes (e.g. `openssl rand -hex 32`). Treated as an
 * opaque UTF-8 secret; the length check (43 characters = 32 bytes base64url,
 * the shortest common 32-byte encoding) only rejects obviously short or empty
 * values — it cannot prove entropy. Whitespace is rejected as a likely
 * copy/paste error. Read per call, never at module scope, never logged.
 */
export const RATE_LIMIT_IP_HMAC_SECRET_MIN_LENGTH = 43;

export function readRateLimitIpHmacSecret(): string | null {
  const secret = process.env.RATE_LIMIT_IP_HMAC_SECRET;
  if (secret === undefined || secret.length < RATE_LIMIT_IP_HMAC_SECRET_MIN_LENGTH || /\s/.test(secret)) {
    return null;
  }
  return secret;
}

/**
 * Keyed pseudonym of the normalized trusted client IP:
 * HMAC-SHA256(secret, normalizedIp). Unlike a plain hash, the small IPv4
 * space cannot be brute-forced back to an address without the secret.
 * Rotating the secret simply starts fresh limiter identities.
 */
export function clientIpSubject(normalizedIp: string | null, secret: string): RateLimitSubject {
  const digest = createHmac("sha256", secret)
    .update(normalizedIp ?? UNRESOLVED_CLIENT, "utf8")
    .digest("hex");
  return `ip:${digest}` as RateLimitSubject;
}

export function accessLinkSubject(accessLinkId: string): RateLimitSubject {
  if (!isValidUuid(accessLinkId)) {
    throw new Error("Rate-limit subject must be a resolved access-link id");
  }
  return `link:${accessLinkId.toLowerCase()}` as RateLimitSubject;
}

export function guestSubject(guestId: string): RateLimitSubject {
  if (!isValidUuid(guestId)) {
    throw new Error("Rate-limit subject must be a resolved guest id");
  }
  return `guest:${guestId.toLowerCase()}` as RateLimitSubject;
}

export interface RateLimitDecision {
  allowed: boolean;
}

/**
 * The shared store could not produce a decision (unconfigured, unreachable,
 * timed out). Carries no provider/network detail.
 */
export class RateLimitBackendUnavailableError extends Error {
  constructor() {
    super("Rate-limit backend unavailable");
    this.name = "RateLimitBackendUnavailableError";
  }
}

export interface RateLimitStore {
  /**
   * Counts one request for `subject` under `rule` (sliding window). Throws
   * `RateLimitBackendUnavailableError` when no trustworthy decision exists.
   */
  consume(rule: RateLimitRule, subject: RateLimitSubject): Promise<RateLimitDecision>;
}
