import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { rateLimitKeyPrefix, type RateLimitRule } from "./rate-limit-policy";
import {
  RATE_LIMIT_DIAGNOSTICS,
  RateLimitBackendUnavailableError,
  type RateLimitDecision,
  type RateLimitStore,
  type RateLimitSubject,
} from "./rate-limit-store";

/**
 * Task 035A production limiter: Upstash Redis (REST) + `@upstash/ratelimit`
 * sliding windows — shared, atomic (Lua) and TTL-expiring across every
 * serverless instance. No process-local counter is authoritative:
 * `ephemeralCache` is disabled, and so are provider analytics and SDK
 * telemetry.
 *
 * Bounded wait: one store attempt (Redis retries disabled), capped at
 * `BACKEND_TIMEOUT_MS`. `@upstash/ratelimit` resolves a timed-out call as
 * `success: true, reason: "timeout"` (allow); this adapter converts that, any
 * thrown SDK/network error, and missing configuration into
 * `RateLimitBackendUnavailableError`, so each guard applies its own frozen
 * failure policy (TOKEN_PAGE open, mutations 503) instead of the SDK's.
 *
 * Configuration: server-only, read per call (never at module scope, never
 * logged), as ONE complete credential pair — never mixed across families:
 *   1. explicit/direct Upstash: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`;
 *   2. else Vercel Marketplace-managed: `KV_REST_API_URL` + `KV_REST_API_TOKEN`
 *      (used natively so Marketplace rotation stays effective; never duplicate
 *      them under the UPSTASH_* names).
 * Missing or invalid configuration is never "security disabled".
 * Diagnostics are fixed categories only — no key, IP, token, id or provider
 * detail.
 */

export const BACKEND_TIMEOUT_MS = 1000;

interface UpstashConfig {
  url: string;
  token: string;
}

/** The first COMPLETE pair (explicit Upstash, then Vercel Marketplace KV); a partial pair is never combined with the other family. */
function resolveCredentialPair(): UpstashConfig | null {
  const families: ReadonlyArray<readonly [string | undefined, string | undefined]> = [
    [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN],
    [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN],
  ];
  for (const [url, token] of families) {
    if (url && token) {
      return { url, token };
    }
  }
  return null;
}

function readUpstashConfig(): UpstashConfig | null {
  const pair = resolveCredentialPair();
  if (pair === null) {
    return null;
  }
  const { url, token } = pair;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url, token };
}

export function createUpstashRateLimitStore(): RateLimitStore {
  const config = readUpstashConfig();
  if (config === null) {
    return {
      async consume() {
        console.error(RATE_LIMIT_DIAGNOSTICS.NOT_CONFIGURED);
        throw new RateLimitBackendUnavailableError();
      },
    };
  }

  const redis = new Redis({
    url: config.url,
    token: config.token,
    retry: { retries: 0 },
    enableTelemetry: false,
  });
  const limiters = new Map<RateLimitRule, Ratelimit>();
  const limiterFor = (rule: RateLimitRule): Ratelimit => {
    let limiter = limiters.get(rule);
    if (limiter === undefined) {
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowSeconds} s`),
        prefix: rateLimitKeyPrefix(rule),
        analytics: false,
        ephemeralCache: false,
        timeout: BACKEND_TIMEOUT_MS,
      });
      limiters.set(rule, limiter);
    }
    return limiter;
  };

  return {
    async consume(rule: RateLimitRule, subject: RateLimitSubject): Promise<RateLimitDecision> {
      let response: Awaited<ReturnType<Ratelimit["limit"]>>;
      try {
        response = await limiterFor(rule).limit(subject);
      } catch {
        console.error(RATE_LIMIT_DIAGNOSTICS.UNAVAILABLE);
        throw new RateLimitBackendUnavailableError();
      }
      if (response.reason === "timeout") {
        console.error(RATE_LIMIT_DIAGNOSTICS.UNAVAILABLE);
        throw new RateLimitBackendUnavailableError();
      }
      return { allowed: response.success === true };
    },
  };
}
