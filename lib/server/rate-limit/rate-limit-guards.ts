import { resolveTrustedClientIp } from "./client-ip";
import { RATE_LIMIT_RULES, type RateLimitRule, type RateLimitRuleId } from "./rate-limit-policy";
import { RATE_LIMITED_MESSAGE, RateLimitGuardError, SERVICE_UNAVAILABLE_MESSAGE } from "./rate-limit-error";
import {
  clientIpSubject,
  RATE_LIMIT_DIAGNOSTICS,
  readRateLimitIpHmacSecret,
  type RateLimitStore,
  type RateLimitSubject,
} from "./rate-limit-store";

/**
 * Task 035A guards (docs/API_CONTRACT.md §27). Order on every protected
 * route:
 *
 *   pre-resolution IP guard → frozen token resolution → post-resolution
 *   link/guest guard → frozen domain action
 *
 * The IP guard runs before any body read, token hashing or service_role
 * lookup, so its 429 never depends on credential validity. Responses are
 * generic: no key, IP, token state, counter, provider or Retry-After (the
 * sliding window's `reset` is only the end of the current fixed window, not a
 * correct retry time) and no `X-RateLimit-*` header.
 *
 * IP identities are HMAC-SHA256(RATE_LIMIT_IP_HMAC_SECRET, normalized IP).
 * A missing/invalid secret is limiter misconfiguration, never "disabled":
 * the rule's failure policy applies (TOKEN_PAGE fail open, mutations 503)
 * and only the fixed RATE_LIMIT_IDENTITY_NOT_CONFIGURED category is logged.
 */

const TOKEN_PAGE_RATE_LIMITED_TEXT = "Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type GuardOutcome = "ALLOW" | "LIMITED" | "UNAVAILABLE";

async function evaluate(store: RateLimitStore, rule: RateLimitRule, subject: RateLimitSubject): Promise<GuardOutcome> {
  if (!subject.startsWith(`${rule.subject}:`)) {
    throw new Error("Rate-limit subject does not match its rule");
  }
  try {
    const decision = await store.consume(rule, subject);
    return decision.allowed ? "ALLOW" : "LIMITED";
  } catch {
    // RateLimitBackendUnavailableError, or any unexpected store fault: never a silent pass for writes.
    return rule.onBackendFailure === "FAIL_OPEN" ? "ALLOW" : "UNAVAILABLE";
  }
}

async function evaluateClientIp(store: RateLimitStore, rule: RateLimitRule, headers: Headers): Promise<GuardOutcome> {
  const secret = readRateLimitIpHmacSecret();
  if (secret === null) {
    console.error(RATE_LIMIT_DIAGNOSTICS.IDENTITY_NOT_CONFIGURED);
    return rule.onBackendFailure === "FAIL_OPEN" ? "ALLOW" : "UNAVAILABLE";
  }
  return evaluate(store, rule, clientIpSubject(resolveTrustedClientIp(headers), secret));
}

/**
 * Pre-resolution guard for a public/capability API route. Returns the
 * generic 429/503 JSON response to send, or `null` to continue into the
 * frozen handler.
 */
export async function guardApiRequestByClientIp(
  headers: Headers,
  ruleId: Extract<RateLimitRuleId, "PUBLIC_WRITE_IP" | "CAPABILITY_MUTATION_IP">,
  store: RateLimitStore,
): Promise<Response | null> {
  const outcome = await evaluateClientIp(store, RATE_LIMIT_RULES[ruleId], headers);
  if (outcome === "LIMITED") {
    return Response.json({ error: RATE_LIMITED_MESSAGE }, { status: 429, headers: NO_STORE });
  }
  if (outcome === "UNAVAILABLE") {
    return Response.json({ error: SERVICE_UNAVAILABLE_MESSAGE }, { status: 503, headers: NO_STORE });
  }
  return null;
}

/**
 * TOKEN_PAGE guard (proxy.ts). Returns the generic 429 page response, or
 * `null` to render the page. Backend failure fails OPEN (owner decision).
 */
export async function guardTokenPageRequest(headers: Headers, store: RateLimitStore): Promise<Response | null> {
  const outcome = await evaluateClientIp(store, RATE_LIMIT_RULES.TOKEN_PAGE_IP, headers);
  if (outcome === "LIMITED") {
    return new Response(TOKEN_PAGE_RATE_LIMITED_TEXT, {
      status: 429,
      headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return null;
}

/**
 * Post-resolution guard on a resolved, non-secret target id. Throws
 * `RateLimitGuardError` — RATE_LIMITED (429) or SERVICE_UNAVAILABLE (503,
 * fail-closed) — which the public handlers map before their frozen branches.
 */
export async function enforceResolvedTargetLimit(
  store: RateLimitStore,
  ruleId: Exclude<RateLimitRuleId, "TOKEN_PAGE_IP" | "PUBLIC_WRITE_IP" | "CAPABILITY_MUTATION_IP">,
  subject: RateLimitSubject,
): Promise<void> {
  const outcome = await evaluate(store, RATE_LIMIT_RULES[ruleId], subject);
  if (outcome === "LIMITED") {
    throw new RateLimitGuardError("RATE_LIMITED");
  }
  if (outcome === "UNAVAILABLE") {
    throw new RateLimitGuardError("SERVICE_UNAVAILABLE");
  }
}
