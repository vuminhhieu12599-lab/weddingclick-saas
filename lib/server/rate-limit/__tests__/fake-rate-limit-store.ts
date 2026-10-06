import { rateLimitKeyPrefix, type RateLimitRule } from "../rate-limit-policy";
import { RateLimitBackendUnavailableError, type RateLimitStore, type RateLimitSubject } from "../rate-limit-store";

/**
 * Test-only deterministic limiter (never imported by production code). It
 * mirrors `@upstash/ratelimit`'s single-region sliding window: the previous
 * fixed window's count weighted by the remaining fraction plus the current
 * window's count; a refused request is not counted. Time comes from an
 * injectable clock; failures can be injected per key segment.
 */
export interface FakeRateLimitStore extends RateLimitStore {
  readonly clock: { now: number };
  /** Every full key ever consumed (`wc:v1:<segment>:<subject>`). */
  readonly keys: Set<string>;
  /** `"all"` or the set of rule segments whose consume throws "backend unavailable". */
  failing: "all" | Set<string> | null;
  reset(): void;
}

export function createFakeRateLimitStore(startMs = Date.UTC(2026, 9, 6, 8, 0, 0)): FakeRateLimitStore {
  const counts = new Map<string, number>();
  const store: FakeRateLimitStore = {
    clock: { now: startMs },
    keys: new Set<string>(),
    failing: null,
    reset() {
      counts.clear();
      store.keys.clear();
      store.failing = null;
    },
    async consume(rule: RateLimitRule, subject: RateLimitSubject) {
      if (store.failing === "all" || store.failing?.has(rule.segment)) {
        throw new RateLimitBackendUnavailableError();
      }
      const key = `${rateLimitKeyPrefix(rule)}:${subject}`;
      store.keys.add(key);
      const windowMs = rule.windowSeconds * 1000;
      const current = Math.floor(store.clock.now / windowMs);
      const elapsed = (store.clock.now % windowMs) / windowMs;
      const previousCount = counts.get(`${key}:${current - 1}`) ?? 0;
      const currentCount = counts.get(`${key}:${current}`) ?? 0;
      const used = Math.ceil(previousCount * (1 - elapsed)) + currentCount;
      if (used + 1 > rule.limit) {
        return { allowed: false };
      }
      counts.set(`${key}:${current}`, currentCount + 1);
      return { allowed: true };
    },
  };
  return store;
}
