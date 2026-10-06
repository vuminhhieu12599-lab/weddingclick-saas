import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateAccessToken } from "../../auth/access-token-crypto";
import type { ResolvedAccessLinkRow } from "../../supabase/access-link-resolution-repository";
import { normalizeClientIp, resolveTrustedClientIp } from "../client-ip";
import { RATE_LIMIT_RULES } from "../rate-limit-policy";
import { clientIpSubject } from "../rate-limit-store";
import { createFakeRateLimitStore } from "./fake-rate-limit-store";

/**
 * Task 035A — V2 abuse controls. Deterministic fake limiter + fake domain
 * gateways only: no Upstash, no Supabase, no real traffic. Each route is
 * exercised through its real `app/api` route file so the guard wiring and
 * order (IP guard → frozen resolution → target guard → domain) are what is
 * actually tested.
 */

const h = vi.hoisted(() => ({
  store: null as unknown as ReturnType<typeof import("./fake-rate-limit-store").createFakeRateLimitStore>,
  rsvpCalls: [] as string[],
  guestRsvpCalls: [] as string[],
  identityCalls: 0,
  identities: new Map<string, string>(),
  links: new Map<string, { id: string; projectId: string; linkType: "INTAKE" | "REVIEW" | "PORTAL" }>(),
  lookups: 0,
  touches: [] as string[],
  reviewWrites: 0,
  intakeWrites: 0,
  guestWrites: [] as string[],
  issued: new Map<string, boolean>(),
  mints: [] as string[],
}));

vi.mock("../upstash-rate-limit-store", () => ({ createUpstashRateLimitStore: () => h.store }));

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

const resolutionRepository = () => ({
  async lookupByTokenHash(tokenHash: Uint8Array): Promise<ResolvedAccessLinkRow | null> {
    h.lookups += 1;
    const row = h.links.get(hex(tokenHash));
    return row ? { ...row, expiresAt: null, revokedAt: null } : null;
  },
  async touchLastUsedAt(id: string) {
    h.touches.push(id);
  },
});

vi.mock("../../public-rsvp/public-rsvp-supabase", () => ({
  createPublicRsvpDependencies: () => ({
    rsvps: {
      async submitPublicRsvp(slug: string) {
        h.rsvpCalls.push(slug);
        return "f0000000-0000-4000-8000-0000000000a1";
      },
    },
    guestRsvps: {
      async submitPublicGuestRsvp(slug: string, tokenHash: Uint8Array) {
        const guestId = h.identities.get(hex(tokenHash));
        if (guestId === undefined) return null;
        h.guestRsvpCalls.push(guestId);
        return "f0000000-0000-4000-8000-0000000000a2";
      },
    },
  }),
}));

vi.mock("../../supabase/public-guest-identity-repository", () => ({
  getServiceRolePublicGuestIdentityGateway: () => ({
    async findActiveGuestIdByTokenHash(tokenHash: Uint8Array) {
      h.identityCalls += 1;
      return h.identities.get(hex(tokenHash)) ?? null;
    },
  }),
}));

vi.mock("../../customer-review/customer-review-supabase", () => ({
  createCustomerReviewFeedbackDependencies: () => ({
    resolution: resolutionRepository(),
    reviews: {
      async submitReviewFeedback(input: { invitationVersionId: string; feedbackType: "COMMENT" | "APPROVAL" }) {
        h.reviewWrites += 1;
        return { id: "f0000000-0000-4000-8000-0000000000b1", invitationVersionId: input.invitationVersionId, feedbackType: input.feedbackType, createdAt: "2026-10-06T08:00:00.000Z", projectStatus: "IN_REVIEW" };
      },
    },
  }),
}));

vi.mock("../../supabase/access-link-resolution-repository", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getServiceRoleAccessLinkResolutionRepository: () => resolutionRepository(),
}));

vi.mock("../../supabase/intake-submit-repository", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getServiceRoleIntakeSubmitGateway: () => ({
    async submitIntakeSubmission() {
      h.intakeWrites += 1;
      throw new Error("not reached in these tests");
    },
  }),
}));

const guestRecord = (id: string, displayName = "Anh Hiếu và gia đình") => ({ id, displayName, invitationVariant: "COMMON" as const, linkIssued: false, revoked: false });

vi.mock("../../customer-portal/portal-guest-supabase", () => ({
  createPortalGuestToolDependencies: () => ({
    resolution: resolutionRepository(),
    guests: {
      async getGuestToolContext() {
        return { packageCode: "COMMON", published: true, personalizedGuestEntitled: true };
      },
      async insertGuest() {
        h.guestWrites.push("insert");
        return guestRecord("f0000000-0000-4000-8000-0000000000c1");
      },
      async updateGuest(_projectId: string, guestId: string) {
        h.guestWrites.push("update");
        return guestRecord(guestId, "Em và sự cô đơn");
      },
      async revokeGuest(_projectId: string, guestId: string) {
        h.guestWrites.push("revoke");
        return { ...guestRecord(guestId), revoked: true };
      },
      async getGuestState() {
        return null;
      },
    },
    guestLinks: {
      async hasPersonalizedGuestEntitlement() {
        return true;
      },
      async getGuestLinkTarget(_client: unknown, _projectId: string, guestId: string) {
        return { invitationVariant: "COMMON", hasIssuedLink: h.issued.get(guestId) ?? false, revoked: false, packageCode: "COMMON" };
      },
      async getInvitationSlug() {
        return "an-va-binh-k3x9";
      },
      async replaceGuestToken(_client: unknown, params: { guestId: string }) {
        h.mints.push(params.guestId);
        h.issued.set(params.guestId, true);
        return true;
      },
    },
  }),
}));

const rsvpRoute = await import("../../../../app/api/v2/public/rsvp/route");
const reviewRoute = await import("../../../../app/api/v2/public/review-feedback/route");
const intakeRoute = await import("../../../../app/api/v2/public/intake-submissions/route");
const guestsRoute = await import("../../../../app/api/v2/public/portal/guests/route");
const guestRoute = await import("../../../../app/api/v2/public/portal/guests/[guestId]/route");
const revokeRoute = await import("../../../../app/api/v2/public/portal/guests/[guestId]/revoke/route");
const mintRoute = await import("../../../../app/api/v2/public/portal/guests/[guestId]/access-link/route");
const proxyModule = await import("../../../../proxy");

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const PROJECT = "f0000000-0000-4000-8000-0000000000d1";
const GUEST = (n: number) => `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SAFE_KEY = /^wc:v1:[a-z-]+:(ip:[0-9a-f]{64}|link:[0-9a-f-]{36}|guest:[0-9a-f-]{36})$/;

function post(path: string, init: { ip?: string; token?: string; body?: unknown; method?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": init.ip ?? "203.0.113.7" };
  if (init.token !== undefined) headers.authorization = `Bearer ${init.token}`;
  return new Request(`http://localhost${path}`, { method: init.method ?? "POST", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}

function issueLink(linkType: "INTAKE" | "REVIEW" | "PORTAL", id: string) {
  const token = generateAccessToken();
  h.links.set(hex(token.tokenHash), { id, projectId: PROJECT, linkType });
  return token.rawToken;
}

const rsvpBody = (extra: Record<string, unknown> = {}) => ({ publicSlug: "an-va-binh-k3x9", attendance: "ATTENDING", partySize: 2, message: null, guestName: "Chú B và người thương", ...extra });
const params = (guestId: string) => ({ params: Promise.resolve({ guestId }) });

function expectGeneric429(res: Response) {
  expect(res.status).toBe(429);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("retry-after")).toBeNull();
  expect([...res.headers.keys()].filter((k) => k.startsWith("x-ratelimit"))).toEqual([]);
}

function expectSafeKeys(secrets: string[]) {
  for (const key of h.store.keys) {
    expect(key).toMatch(SAFE_KEY);
    for (const secret of secrets) expect(key).not.toContain(secret);
  }
}

/** Deterministic test-only secrets — never a real credential. */
const TEST_SECRET = "test-only-rate-limit-ip-hmac-secret-0000000000000000";
const OTHER_TEST_SECRET = "test-only-rate-limit-ip-hmac-secret-1111111111111111";

beforeEach(() => {
  vi.stubEnv("RATE_LIMIT_IP_HMAC_SECRET", TEST_SECRET);
  h.store = createFakeRateLimitStore();
  Object.assign(h, { rsvpCalls: [], guestRsvpCalls: [], identityCalls: 0, lookups: 0, touches: [], reviewWrites: 0, intakeWrites: 0, guestWrites: [], mints: [] });
  h.identities.clear();
  h.links.clear();
  h.issued.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("035A contract + key privacy (H, I, E)", () => {
  it("rule table is exactly the owner-approved thresholds, windows, namespaces and failure policy", () => {
    const table = Object.fromEntries(Object.entries(RATE_LIMIT_RULES).map(([id, r]) => [id, `${r.segment}|${r.subject}|${r.limit}/${r.windowSeconds}s|${r.onBackendFailure}`]));
    expect(table).toEqual({
      TOKEN_PAGE_IP: "token-page|ip|120/60s|FAIL_OPEN",
      PUBLIC_WRITE_IP: "public-write|ip|60/600s|FAIL_CLOSED",
      CAPABILITY_MUTATION_IP: "capability-mutation|ip|60/600s|FAIL_CLOSED",
      GUEST_RSVP_GUEST: "guest-rsvp|guest|20/600s|FAIL_CLOSED",
      REVIEW_FEEDBACK_LINK: "review-feedback|link|20/600s|FAIL_CLOSED",
      INTAKE_LINK: "intake|link|5/3600s|FAIL_CLOSED",
      PORTAL_MUTATION_LINK: "portal-mutation|link|120/3600s|FAIL_CLOSED",
      GUEST_LINK_MINT_GUEST: "guest-link-mint|guest|5/3600s|FAIL_CLOSED",
    });
  });

  it("client IP is validated and normalized (v4, mapped v4, v6 /64), never arbitrary header text", () => {
    expect(normalizeClientIp(" 203.0.113.7 ")).toBe("203.0.113.7");
    expect(normalizeClientIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeClientIp("2001:DB8:aa:1::5")).toBe("2001:0db8:00aa:0001::/64");
    expect(normalizeClientIp("2001:db8:aa:1:ffff:1:2:3")).toBe("2001:0db8:00aa:0001::/64");
    for (const bad of ["", "unknown", "203.0.113.7:443", "fe80::1%eth0", "<script>", "999.1.1.1", "1.2.3.4, 5.6.7.8"]) {
      expect(normalizeClientIp(bad), bad).toBeNull();
    }
    expect(resolveTrustedClientIp(new Headers({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "10.0.0.1" }))).toBe("198.51.100.1");
    expect(resolveTrustedClientIp(new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe("198.51.100.2");
    expect(resolveTrustedClientIp(new Headers())).toBeNull();
  });

  it("IP subjects are HMAC-SHA256(secret, normalized IP): deterministic, IP- and secret-separated, never a plain hash (A, B, C)", () => {
    const subject = clientIpSubject("203.0.113.7", TEST_SECRET);
    expect(subject).toBe(`ip:${createHmac("sha256", TEST_SECRET).update("203.0.113.7", "utf8").digest("hex")}`);
    expect(clientIpSubject("203.0.113.7", TEST_SECRET)).toBe(subject);
    expect(clientIpSubject("203.0.113.8", TEST_SECRET)).not.toBe(subject);
    expect(clientIpSubject("203.0.113.7", OTHER_TEST_SECRET)).not.toBe(subject);
    expect(subject).not.toBe(`ip:${createHash("sha256").update("203.0.113.7", "utf8").digest("hex")}`);
    expect(subject).not.toContain("203.0.113.7");
    expect(clientIpSubject(null, TEST_SECRET)).toBe(clientIpSubject(null, TEST_SECRET));
    expect(clientIpSubject(null, TEST_SECRET)).not.toBe(subject);
  });
});

describe("PUBLIC_WRITE — public RSVP (A, B, C, D, L, V, W, X, Y)", () => {
  it("generic RSVP: 60 within the window pass, the 61st is a generic 429 and nothing is written", async () => {
    for (let i = 0; i < 60; i += 1) {
      expect((await rsvpRoute.POST(post("/api/v2/public/rsvp", { body: rsvpBody() }))).status).toBe(201);
    }
    const res = await rsvpRoute.POST(post("/api/v2/public/rsvp", { body: rsvpBody() }));
    expectGeneric429(res);
    expect(await res.json()).toEqual({ error: "Too many requests" });
    expect(h.rsvpCalls).toHaveLength(60);
    expectSafeKeys(["203.0.113.7"]);
  });

  it("sliding window: blocked at the next window start, partially recovered mid-window, fully after two windows", async () => {
    const send = () => rsvpRoute.POST(post("/api/v2/public/rsvp", { body: rsvpBody() }));
    h.store.clock.now = Date.UTC(2026, 9, 6, 8, 0, 0);
    for (let i = 0; i < 60; i += 1) await send();
    h.store.clock.now += 600_000; // next window, previous weight 100%
    expect((await send()).status).toBe(429);
    h.store.clock.now += 300_000; // half-way: previous counts ceil(60 × 0.5) = 30
    for (let i = 0; i < 30; i += 1) expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(429);
    h.store.clock.now += 1_200_000;
    expect((await send()).status).toBe(201);
  });

  it("keys are separated per client IP and per rule class", async () => {
    for (let i = 0; i < 60; i += 1) await rsvpRoute.POST(post("/api/v2/public/rsvp", { body: rsvpBody() }));
    expect((await rsvpRoute.POST(post("/api/v2/public/rsvp", { body: rsvpBody() }))).status).toBe(429);
    expect((await rsvpRoute.POST(post("/api/v2/public/rsvp", { ip: "198.51.100.9", body: rsvpBody() }))).status).toBe(201);
    // Same IP, different class (capability mutation) is an independent budget.
    expect((await reviewRoute.POST(post("/api/v2/public/review-feedback", { token: "x".repeat(43), body: {} }))).status).toBe(404);
    expect([...h.store.keys].map((k) => k.split(":")[2]).sort()).toEqual(["capability-mutation", "public-write", "public-write"]);
  });

  it("limiter store unavailable → generic 503 and the RSVP is never written (fail closed)", async () => {
    h.store.failing = "all";
    const res = await rsvpRoute.POST(post("/api/v2/public/rsvp", { body: rsvpBody() }));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "Service temporarily unavailable" });
    expect(h.rsvpCalls).toEqual([]);
  });
});

describe("personalized RSVP — IP + per-guest guard (J, K, M)", () => {
  it("20 per guest per 10 minutes even across IPs; the 21st is 429 with no write; another guest is unaffected", async () => {
    const a = generateAccessToken();
    const b = generateAccessToken();
    h.identities.set(hex(a.tokenHash), GUEST(1));
    h.identities.set(hex(b.tokenHash), GUEST(2));
    for (let i = 0; i < 20; i += 1) {
      const res = await rsvpRoute.POST(post("/api/v2/public/rsvp", { ip: `198.51.100.${i + 1}`, body: rsvpBody({ guestToken: a.rawToken }) }));
      expect(res.status).toBe(201);
    }
    expectGeneric429(await rsvpRoute.POST(post("/api/v2/public/rsvp", { ip: "198.51.100.200", body: rsvpBody({ guestToken: a.rawToken }) })));
    expect(h.guestRsvpCalls.filter((g) => g === GUEST(1))).toHaveLength(20);
    expect((await rsvpRoute.POST(post("/api/v2/public/rsvp", { ip: "198.51.100.201", body: rsvpBody({ guestToken: b.rawToken }) }))).status).toBe(201);
    expectSafeKeys([a.rawToken, b.rawToken, hex(a.tokenHash), hex(b.tokenHash)]);
  });

  it("malformed / unknown guest tokens keep the frozen uniform 404 and never create a guest key", async () => {
    expect((await rsvpRoute.POST(post("/api/v2/public/rsvp", { body: rsvpBody({ guestToken: "not-a-token" }) }))).status).toBe(404);
    expect(h.identityCalls).toBe(0);
    const unknown = generateAccessToken().rawToken;
    expect((await rsvpRoute.POST(post("/api/v2/public/rsvp", { body: rsvpBody({ guestToken: unknown }) }))).status).toBe(404);
    expect(h.identityCalls).toBe(1);
    expect([...h.store.keys].every((k) => k.startsWith("wc:v1:public-write:ip:"))).toBe(true);
  });
});

describe("Review feedback — IP + per-REVIEW-link guard (G, K, N)", () => {
  it("unknown REVIEW token → frozen 404 without touching the link guard", async () => {
    const res = await reviewRoute.POST(post("/api/v2/public/review-feedback", { token: generateAccessToken().rawToken, body: {} }));
    expect(res.status).toBe(404);
    expect([...h.store.keys].some((k) => k.includes(":review-feedback:"))).toBe(false);
  });

  it("20 per link per 10 minutes across COMMENT/APPROVAL and across IPs; the 21st is 429 before body read, write or last_used_at", async () => {
    const token = issueLink("REVIEW", GUEST(50));
    const body = (i: number) => (i % 2 === 0 ? { invitationVersionId: GUEST(60), feedbackType: "APPROVAL" } : { invitationVersionId: GUEST(60), feedbackType: "COMMENT", message: "Đổi giờ đón khách" });
    for (let i = 0; i < 20; i += 1) {
      expect((await reviewRoute.POST(post("/api/v2/public/review-feedback", { ip: `198.51.100.${i + 1}`, token, body: body(i) }))).status).toBe(201);
    }
    const res = await reviewRoute.POST(post("/api/v2/public/review-feedback", { ip: "198.51.100.99", token, body: body(0) }));
    expectGeneric429(res);
    expect(h.reviewWrites).toBe(20);
    expect(h.touches).toHaveLength(20);
    expectSafeKeys([token]);
  });

  it("post-resolution store failure → 503, nothing written, last_used_at untouched", async () => {
    const token = issueLink("REVIEW", GUEST(51));
    h.store.failing = new Set(["review-feedback"]);
    const res = await reviewRoute.POST(post("/api/v2/public/review-feedback", { token, body: { invitationVersionId: GUEST(60), feedbackType: "APPROVAL" } }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Service temporarily unavailable" });
    expect(h.reviewWrites).toBe(0);
    expect(h.touches).toEqual([]);
  });
});

describe("Intake — IP + per-INTAKE-link guard (O)", () => {
  it("5 per link per hour (guard passes, frozen validation runs); the 6th is 429 before the body is read; recovers after the window", async () => {
    const token = issueLink("INTAKE", GUEST(70));
    let bodyReads = 0;
    const send = (ip: string) => {
      const req = post("/api/v2/public/intake-submissions", { ip, token, body: { unexpected: true } });
      const json = req.json.bind(req);
      req.json = async () => {
        bodyReads += 1;
        return json();
      };
      return intakeRoute.POST(req);
    };
    for (let i = 0; i < 5; i += 1) expect((await send(`198.51.100.${i + 1}`)).status).toBe(400);
    expectGeneric429(await send("198.51.100.50"));
    expect(bodyReads).toBe(5);
    expect(h.intakeWrites).toBe(0);
    h.store.clock.now += 2 * 3_600_000;
    expect((await send("198.51.100.51")).status).toBe(400);
  });
});

describe("Portal mutations — IP + per-PORTAL-link guard (P)", () => {
  it("create/edit/revoke share 120 per link per hour across IPs; the 121st is 429 with no write", async () => {
    const token = issueLink("PORTAL", GUEST(80));
    for (let i = 0; i < 120; i += 1) {
      const ip = `198.51.${Math.floor(i / 50)}.${(i % 50) + 1}`;
      const res =
        i % 3 === 0
          ? await guestsRoute.POST(post("/api/v2/public/portal/guests", { ip, token, body: { displayName: "Team Marketing" } }))
          : i % 3 === 1
            ? await guestRoute.PATCH(post(`/api/v2/public/portal/guests/${GUEST(90)}`, { ip, token, method: "PATCH", body: { displayName: "Em và sự cô đơn" } }), params(GUEST(90)))
            : await revokeRoute.POST(post(`/api/v2/public/portal/guests/${GUEST(90)}/revoke`, { ip, token }), params(GUEST(90)));
      expect(res.status, `request ${i}`).toBeLessThan(300);
    }
    expect(h.guestWrites).toHaveLength(120);
    expectGeneric429(await guestsRoute.POST(post("/api/v2/public/portal/guests", { ip: "192.0.2.1", token, body: { displayName: "Anh Hiếu" } })));
    expect(h.guestWrites).toHaveLength(120);
    expectSafeKeys([token]);
  });

  it("the 61st capability mutation from one IP is 429 before any token lookup", async () => {
    const token = issueLink("PORTAL", GUEST(81));
    for (let i = 0; i < 60; i += 1) await guestsRoute.POST(post("/api/v2/public/portal/guests", { token, body: { displayName: "Khách" } }));
    const lookups = h.lookups;
    expectGeneric429(await guestsRoute.POST(post("/api/v2/public/portal/guests", { token, body: { displayName: "Khách" } })));
    expect(h.lookups).toBe(lookups);
  });
});

describe("Portal personalized link ISSUE / REGENERATE — per-guest 5/hour (Q, R, S)", () => {
  const mint = (token: string, guestId: string, action: "ISSUE" | "REGENERATE", ip: string) =>
    mintRoute.POST(post(`/api/v2/public/portal/guests/${guestId}/access-link`, { ip, token, body: { action } }), params(guestId));

  it("ISSUE + 4 REGENERATE pass for one guest; the 6th is 429 and no token is rotated", async () => {
    const token = issueLink("PORTAL", GUEST(82));
    expect((await mint(token, GUEST(100), "ISSUE", "198.51.100.1")).status).toBe(200);
    for (let i = 0; i < 4; i += 1) expect((await mint(token, GUEST(100), "REGENERATE", `198.51.100.${i + 2}`)).status).toBe(200);
    expectGeneric429(await mint(token, GUEST(100), "REGENERATE", "198.51.100.9"));
    expect(h.mints).toHaveLength(5);
    expect([...h.store.keys].some((k) => k.includes(":portal-mutation:"))).toBe(false);
  });

  it("many guests under one Portal link each ISSUE normally; a limited guest does not affect another", async () => {
    const token = issueLink("PORTAL", GUEST(83));
    for (let g = 0; g < 12; g += 1) {
      const res = await mint(token, GUEST(200 + g), "ISSUE", `198.51.100.${g + 1}`);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { data: { personalizedUrl: string } }).data.personalizedUrl).toMatch(/^\/i\/an-va-binh-k3x9\/g\//);
    }
    for (let i = 0; i < 5; i += 1) await mint(token, GUEST(200), "REGENERATE", "203.0.113.50");
    expect((await mint(token, GUEST(200), "REGENERATE", "203.0.113.51")).status).toBe(429);
    expect((await mint(token, GUEST(201), "REGENERATE", "203.0.113.52")).status).toBe(200);
    expectSafeKeys([token]);
  });
});

describe("TOKEN_PAGE proxy (E, F, U, T)", () => {
  const page = (path: string, ip = "203.0.113.7") => proxyModule.proxy(new NextRequest(`http://localhost${path}`, { headers: { "x-real-ip": ip } }));

  it("120 per IP per minute pass to the page; the 121st is a generic 429 that does not depend on the path token", async () => {
    const valid = issueLink("PORTAL", GUEST(84));
    for (let i = 0; i < 120; i += 1) {
      const res = await page(i % 2 === 0 ? `/portal/${valid}` : `/i/an-va-binh-k3x9/g/${generateAccessToken().rawToken}`);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
    const limited = await page(`/portal/${valid}`);
    expectGeneric429(limited);
    expect(await limited.text()).not.toContain(valid);
    expect(h.lookups).toBe(0);
    expectSafeKeys([valid]);
  });

  it("store unavailable → fail open (page renders)", async () => {
    h.store.failing = "all";
    expect((await page("/review/abc")).headers.get("x-middleware-next")).toBe("1");
  });

  it("matcher covers only the four token pages — never /i/[slug], APIs or staff/admin paths", () => {
    expect(proxyModule.config.matcher).toEqual(["/i/:slug/g/:token", "/review/:token", "/review/:token/frame", "/portal/:token"]);
    const toRegex = (p: string) => new RegExp(`^${p.replace(/:[a-z]+/g, "[^/]+")}$`);
    const matches = (path: string) => proxyModule.config.matcher.some((p) => toRegex(p).test(path));
    for (const yes of ["/i/slug/g/tok", "/review/tok", "/review/tok/frame", "/portal/tok"]) expect(matches(yes), yes).toBe(true);
    for (const no of ["/i/slug", "/api/v2/public/rsvp", "/api/v2/internal/projects", "/admin", "/portal/tok/extra", "/"]) expect(matches(no), no).toBe(false);
  });
});

describe("keyed IP identity — HMAC secret, IPv4/IPv6 normalization, missing secret (D–K)", () => {
  const rsvp = (ip: string) => rsvpRoute.POST(post("/api/v2/public/rsvp", { ip, body: rsvpBody() }));
  const ipv4Variants = (ip: string) => [ip, `::ffff:${ip}`];

  it("Redis keys never contain a raw IPv4/IPv6 address, its expanded form or an unkeyed hash (D, E)", async () => {
    const addresses = ["203.0.113.7", "2001:db8:aa:1::5", "::ffff:198.51.100.4"];
    for (const ip of addresses) expect((await rsvp(ip)).status).toBe(201);
    const forbidden = [...addresses, "198.51.100.4", "2001:db8", "2001:0db8:00aa:0001", ...["203.0.113.7", "198.51.100.4", "2001:0db8:00aa:0001::/64"].map((v) => createHash("sha256").update(v, "utf8").digest("hex"))];
    expect(h.store.keys.size).toBe(3);
    expectSafeKeys(forbidden);
  });

  it("IPv4-mapped IPv6 shares the IPv4 identity (G)", async () => {
    for (let i = 0; i < 60; i += 1) await rsvp(ipv4Variants("198.51.100.4")[i % 2]);
    expect((await rsvp("198.51.100.4")).status).toBe(429);
    expect((await rsvp("::ffff:198.51.100.4")).status).toBe(429);
    expect(h.store.keys.size).toBe(1);
  });

  it("IPv6 addresses inside one /64 share a budget; a different /64 does not (H, I)", async () => {
    for (let i = 0; i < 60; i += 1) expect((await rsvp(`2001:db8:aa:1::${(i + 1).toString(16)}`)).status).toBe(201);
    expect((await rsvp("2001:db8:aa:1:ffff:ffff:ffff:ffff")).status).toBe(429);
    expect((await rsvp("2001:db8:aa:2::1")).status).toBe(201);
    expect(h.store.keys.size).toBe(2);
  });

  it.each([
    ["missing", undefined],
    ["too short", "a".repeat(42)],
    ["contains whitespace", `${"a".repeat(30)} ${"b".repeat(30)}`],
  ])("%s secret → mutations 503 with no domain call, token pages fail open, only a fixed diagnostic (J, K)", async (_label, secret) => {
    vi.stubEnv("RATE_LIMIT_IP_HMAC_SECRET", secret as string);
    const logged: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    const token = issueLink("PORTAL", GUEST(85));
    const mutation = await guestsRoute.POST(post("/api/v2/public/portal/guests", { token, body: { displayName: "Khách" } }));
    expect(mutation.status).toBe(503);
    expect(await mutation.json()).toEqual({ error: "Service temporarily unavailable" });
    expect((await rsvp("203.0.113.7")).status).toBe(503);
    expect(h.lookups).toBe(0);
    expect(h.guestWrites).toEqual([]);
    expect(h.rsvpCalls).toEqual([]);
    const page = await proxyModule.proxy(new NextRequest(`http://localhost/portal/${token}`, { headers: { "x-real-ip": "203.0.113.7" } }));
    expect(page.headers.get("x-middleware-next")).toBe("1");
    expect(h.store.keys.size).toBe(0);
    expect(logged).toEqual(Array(3).fill(["[rate-limit] RATE_LIMIT_IDENTITY_NOT_CONFIGURED"]));
    const text = JSON.stringify(logged);
    for (const leak of [TEST_SECRET, secret ?? "\u0000", "203.0.113.7", token]) expect(text).not.toContain(leak);
  });

  it("a configured secret is never logged on the normal or limited path (K)", async () => {
    const logged: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    for (let i = 0; i < 61; i += 1) await rsvp("203.0.113.7");
    expect(logged).toEqual([]);
  });
});

describe("static safety (T, Z, AA, AD, AE)", () => {
  const listTs = (dir: string): string[] =>
    readdirSync(join(ROOT, dir)).flatMap((name) => {
      const rel = `${dir}/${name}`;
      if (["node_modules", ".next", "__tests__"].includes(name)) return [];
      if (statSync(join(ROOT, rel)).isDirectory()) return listTs(rel);
      return /\.tsx?$/.test(name) ? [rel] : [];
    });
  const guardFiles = [...listTs("lib/server/rate-limit"), "proxy.ts", "lib/server/supabase/public-guest-identity-repository.ts"];

  it("staff/internal routes, generic /i/[slug] and Task 034 modules never import the limiter", () => {
    for (const f of [...listTs("app/api/v2/internal"), "app/i/[slug]/page.tsx", ...listTs("lib/server/project-tasks"), ...listTs("lib/server/project-activity"), ...listTs("lib/server/dashboard")]) {
      expect(read(f), f).not.toMatch(/rate-limit/);
    }
  });

  it("no activity_logs writes; only fixed diagnostic categories are logged; client-IP headers are read only in client-ip.ts", () => {
    for (const f of guardFiles) {
      const src = read(f);
      expect(src, f).not.toMatch(/activity_logs|insertActivity|logActivity/);
      for (const call of src.match(/console\.\w+\([^)]*\)/g) ?? []) expect(call, f).toMatch(/^console\.error\(RATE_LIMIT_DIAGNOSTICS\.(NOT_CONFIGURED|UNAVAILABLE|IDENTITY_NOT_CONFIGURED)\)$/);
    }
    const headerReaders = [...listTs("lib"), ...listTs("app"), "proxy.ts"].filter((f) => /x-forwarded-for|x-real-ip/i.test(read(f)));
    expect(headerReaders).toEqual(["lib/server/rate-limit/client-ip.ts"]);
  });

  it("no migration 0043, only the two approved dependencies were added, Task 034 code unchanged", () => {
    expect(readdirSync(join(ROOT, "supabase/migrations")).filter((f) => /_0043_/.test(f))).toEqual([]);
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).filter((d) => d.startsWith("@upstash/")).sort()).toEqual(["@upstash/ratelimit", "@upstash/redis"]);
    const changed = execFileSync("git", ["diff", "--name-only", "HEAD", "--", "lib/server/project-tasks", "lib/server/project-activity", "lib/server/dashboard", "app/api/v2/internal", "supabase"], { cwd: ROOT, encoding: "utf8" });
    expect(changed).toBe("");
  });
});
