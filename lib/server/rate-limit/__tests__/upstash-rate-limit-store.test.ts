import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RATE_LIMIT_RULES } from "../rate-limit-policy";
import { clientIpSubject, RateLimitBackendUnavailableError } from "../rate-limit-store";

/**
 * Task 035A — production Upstash adapter with the SDK mocked (no network):
 * exact SDK options (sliding window, namespaced prefix, analytics /
 * ephemeral cache / telemetry off, 1 s bound, no retries), timeout and error
 * → backend unavailable with fixed diagnostics only, and missing production
 * configuration → every protected mutation 503 / token pages fail open.
 */

const sdk = vi.hoisted(() => ({
  redisOptions: [] as unknown[],
  limiterOptions: [] as Record<string, unknown>[],
  outcome: { success: true } as { success: boolean; reason?: string } | Error,
  factoryCalls: 0,
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(options: unknown) {
      sdk.redisOptions.push(options);
    }
  },
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow(limit: number, window: string) {
      return { algorithm: "slidingWindow", limit, window };
    }
    constructor(options: Record<string, unknown>) {
      sdk.limiterOptions.push(options);
    }
    async limit() {
      if (sdk.outcome instanceof Error) throw sdk.outcome;
      return { limit: 0, remaining: 0, reset: 0, pending: Promise.resolve(), ...sdk.outcome };
    }
  },
}));

const untouchable = () => {
  sdk.factoryCalls += 1;
  throw new Error("domain dependencies must not be created");
};
vi.mock("../../public-rsvp/public-rsvp-supabase", () => ({ createPublicRsvpDependencies: untouchable }));
vi.mock("../../customer-review/customer-review-supabase", () => ({ createCustomerReviewFeedbackDependencies: untouchable }));
vi.mock("../../customer-portal/portal-guest-supabase", () => ({ createPortalGuestToolDependencies: untouchable }));
vi.mock("../../supabase/access-link-resolution-repository", async (importOriginal) => ({ ...(await importOriginal<object>()), getServiceRoleAccessLinkResolutionRepository: untouchable }));
vi.mock("../../supabase/intake-submit-repository", async (importOriginal) => ({ ...(await importOriginal<object>()), getServiceRoleIntakeSubmitGateway: untouchable }));

const { createUpstashRateLimitStore, BACKEND_TIMEOUT_MS } = await import("../upstash-rate-limit-store");

const SECRET_URL = "https://secret-host-123.upstash.io";
const SECRET_TOKEN = "SECRET_UPSTASH_TOKEN_VALUE";
const TEST_SECRET = "test-only-rate-limit-ip-hmac-secret-0000000000000000";
const SUBJECT = clientIpSubject("203.0.113.7", TEST_SECRET);

let errors: unknown[][];

beforeEach(() => {
  sdk.redisOptions.length = 0;
  sdk.limiterOptions.length = 0;
  sdk.outcome = { success: true };
  sdk.factoryCalls = 0;
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
  vi.stubEnv("UPSTASH_REDIS_REST_URL", SECRET_URL);
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", SECRET_TOKEN);
  vi.stubEnv("RATE_LIMIT_IP_HMAC_SECRET", TEST_SECRET);
  vi.stubEnv("KV_REST_API_URL", undefined as unknown as string);
  vi.stubEnv("KV_REST_API_TOKEN", undefined as unknown as string);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function expectOnlyDiagnostic(category: string) {
  expect(errors.length).toBeGreaterThan(0);
  for (const args of errors) {
    expect(args).toEqual([`[rate-limit] ${category}`]);
    expect(JSON.stringify(args)).not.toMatch(/secret|SECRET|203\.0\.113\.7|ip:/);
  }
}

describe("Upstash adapter (AB, timeout, failure)", () => {
  it("sliding window per rule, namespaced prefix, analytics/ephemeral cache/telemetry off, 1 s bound, no retries", async () => {
    const store = createUpstashRateLimitStore();
    expect(await store.consume(RATE_LIMIT_RULES.PUBLIC_WRITE_IP, SUBJECT)).toEqual({ allowed: true });
    sdk.outcome = { success: false };
    expect(await store.consume(RATE_LIMIT_RULES.PUBLIC_WRITE_IP, SUBJECT)).toEqual({ allowed: false });
    await store.consume(RATE_LIMIT_RULES.INTAKE_LINK, "link:f0000000-0000-4000-8000-000000000001" as typeof SUBJECT);

    expect(sdk.redisOptions).toEqual([{ url: SECRET_URL, token: SECRET_TOKEN, retry: { retries: 0 }, enableTelemetry: false }]);
    expect(sdk.limiterOptions).toHaveLength(2);
    expect(sdk.limiterOptions[0]).toMatchObject({
      limiter: { algorithm: "slidingWindow", limit: 60, window: "600 s" },
      prefix: "wc:v1:public-write",
      analytics: false,
      ephemeralCache: false,
      timeout: 1000,
    });
    expect(sdk.limiterOptions[1]).toMatchObject({ limiter: { limit: 5, window: "3600 s" }, prefix: "wc:v1:intake" });
    expect(BACKEND_TIMEOUT_MS).toBe(1000);
    expect(errors).toEqual([]);
  });

  it("an SDK timeout (which the SDK reports as success) is converted to backend unavailable", async () => {
    sdk.outcome = { success: true, reason: "timeout" };
    await expect(createUpstashRateLimitStore().consume(RATE_LIMIT_RULES.TOKEN_PAGE_IP, SUBJECT)).rejects.toBeInstanceOf(RateLimitBackendUnavailableError);
    expectOnlyDiagnostic("RATE_LIMIT_BACKEND_UNAVAILABLE");
  });

  it("an SDK/network error is backend unavailable and never echoes provider detail", async () => {
    sdk.outcome = new Error(`fetch failed ${SECRET_URL} ${SECRET_TOKEN}`);
    const error = await createUpstashRateLimitStore().consume(RATE_LIMIT_RULES.PUBLIC_WRITE_IP, SUBJECT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitBackendUnavailableError);
    expect((error as Error).message).toBe("Rate-limit backend unavailable");
    expectOnlyDiagnostic("RATE_LIMIT_BACKEND_UNAVAILABLE");
  });
});

describe("credential source resolution — explicit Upstash pair, else Vercel Marketplace KV pair (A–G)", () => {
  const KV_URL = "https://kv-marketplace-host-456.upstash.io";
  const KV_TOKEN = "SECRET_KV_MARKETPLACE_TOKEN_VALUE";
  type Env = { UPSTASH_REDIS_REST_URL?: string; UPSTASH_REDIS_REST_TOKEN?: string; KV_REST_API_URL?: string; KV_REST_API_TOKEN?: string };

  it.each<[string, Env, { url: string; token: string } | null]>([
    ["A: explicit UPSTASH_* pair", { UPSTASH_REDIS_REST_URL: SECRET_URL, UPSTASH_REDIS_REST_TOKEN: SECRET_TOKEN }, { url: SECRET_URL, token: SECRET_TOKEN }],
    ["B: Vercel Marketplace KV_* pair", { KV_REST_API_URL: KV_URL, KV_REST_API_TOKEN: KV_TOKEN }, { url: KV_URL, token: KV_TOKEN }],
    ["C: both complete → explicit wins", { UPSTASH_REDIS_REST_URL: SECRET_URL, UPSTASH_REDIS_REST_TOKEN: SECRET_TOKEN, KV_REST_API_URL: KV_URL, KV_REST_API_TOKEN: KV_TOKEN }, { url: SECRET_URL, token: SECRET_TOKEN }],
    ["D: partial UPSTASH (url) is never mixed — the complete KV pair is used whole", { UPSTASH_REDIS_REST_URL: SECRET_URL, KV_REST_API_URL: KV_URL, KV_REST_API_TOKEN: KV_TOKEN }, { url: KV_URL, token: KV_TOKEN }],
    ["D: partial UPSTASH (token) is never mixed — the complete KV pair is used whole", { UPSTASH_REDIS_REST_TOKEN: SECRET_TOKEN, KV_REST_API_URL: KV_URL, KV_REST_API_TOKEN: KV_TOKEN }, { url: KV_URL, token: KV_TOKEN }],
    ["D: partial UPSTASH url + partial KV token never combine", { UPSTASH_REDIS_REST_URL: SECRET_URL, KV_REST_API_TOKEN: KV_TOKEN }, null],
    ["E: partial KV pair alone is invalid", { KV_REST_API_URL: KV_URL }, null],
    ["F: neither family", {}, null],
    ["non-HTTPS KV URL is invalid", { KV_REST_API_URL: "http://kv.example", KV_REST_API_TOKEN: KV_TOKEN }, null],
  ])("%s", async (_label, env, expected) => {
    for (const name of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"] as const) {
      vi.stubEnv(name, env[name] as string);
    }
    const consumed = createUpstashRateLimitStore().consume(RATE_LIMIT_RULES.PUBLIC_WRITE_IP, SUBJECT);
    if (expected === null) {
      await expect(consumed).rejects.toBeInstanceOf(RateLimitBackendUnavailableError);
      expect(sdk.redisOptions).toEqual([]);
      expectOnlyDiagnostic("RATE_LIMIT_BACKEND_NOT_CONFIGURED");
    } else {
      expect(await consumed).toEqual({ allowed: true });
      expect(sdk.redisOptions).toEqual([{ ...expected, retry: { retries: 0 }, enableTelemetry: false }]);
      expect(errors).toEqual([]);
    }
    expect(JSON.stringify(errors)).not.toMatch(/SECRET_|upstash\.io|kv\.example/);
  });
});

describe("missing production limiter configuration (AC, F)", () => {
  const routes = async () =>
    Promise.all([
    (await import("../../../../app/api/v2/public/rsvp/route")).POST(new Request("http://localhost/api/v2/public/rsvp", { method: "POST", body: "{}" })),
    (await import("../../../../app/api/v2/public/review-feedback/route")).POST(new Request("http://localhost/x", { method: "POST" })),
    (await import("../../../../app/api/v2/public/intake-submissions/route")).POST(new Request("http://localhost/x", { method: "POST" })),
    (await import("../../../../app/api/v2/public/portal/guests/route")).POST(new Request("http://localhost/x", { method: "POST" })),
    (await import("../../../../app/api/v2/public/portal/guests/[guestId]/route")).PATCH(new Request("http://localhost/x", { method: "PATCH" }), { params: Promise.resolve({ guestId: "g" }) }),
    (await import("../../../../app/api/v2/public/portal/guests/[guestId]/revoke/route")).POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ guestId: "g" }) }),
    (await import("../../../../app/api/v2/public/portal/guests/[guestId]/access-link/route")).POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ guestId: "g" }) }),
    ]);

  it.each([
    ["both variables missing", undefined, undefined],
    ["token missing", SECRET_URL, undefined],
    ["non-HTTPS URL", "http://insecure.example", SECRET_TOKEN],
  ])("%s → every protected mutation route is 503 and no domain dependency is created", async (_label, url, token) => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", url as string);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", token as string);
    const responses = await routes();
    expect(responses).toHaveLength(7);
    for (const res of responses) {
      expect(res.status).toBe(503);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.json()).toEqual({ error: "Service temporarily unavailable" });
    }
    expect(sdk.factoryCalls).toBe(0);
    expect(sdk.limiterOptions).toEqual([]);
    expectOnlyDiagnostic("RATE_LIMIT_BACKEND_NOT_CONFIGURED");
  });

  it("token pages fail open when unconfigured (the page still renders)", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined as unknown as string);
    const { proxy } = await import("../../../../proxy");
    const res = await proxy(new NextRequest("http://localhost/portal/abc", { headers: { "x-real-ip": "203.0.113.7" } }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expectOnlyDiagnostic("RATE_LIMIT_BACKEND_NOT_CONFIGURED");
  });
});
