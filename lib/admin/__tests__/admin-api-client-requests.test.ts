import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LAUNCH-P0-03: request behaviour of the V2 Admin API client — in-flight GET
 * sharing (same token + path only), writes never shared/stored/retried and
 * always invalidating, bounded read and session timeouts.
 */

let currentToken: string | null = "staff-a-jwt";
let sessionRead: () => Promise<string | null> = async () => currentToken;
vi.mock("../staff-session-client", () => ({ getStaffAccessToken: () => sessionRead() }));
vi.mock("../signed-media-upload", () => ({ uploadToSignedMediaPath: vi.fn() }));

const client = await import("../admin-api-client");
const cache = await import("../admin-data-cache");
const { AdminApiError } = await import("../admin-api-error");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "22222222-2222-4222-8222-222222222222";

interface Call {
  url: string;
  method: string;
  authorization: string | null;
  signal: AbortSignal | undefined;
}

function stubFetch(bodyFor: (call: Call, n: number) => unknown, status = 200) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const call: Call = {
      url,
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("authorization"),
      signal: init?.signal ?? undefined,
    };
    calls.push(call);
    return new Response(JSON.stringify(bodyFor(call, calls.length)), { status, headers: { "content-type": "application/json" } });
  });
  return calls;
}

/** A fetch that never answers until its signal aborts (like a stalled connection). */
function stubHangingFetch() {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", authorization: null, signal: init?.signal ?? undefined });
    return new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  });
  return calls;
}

beforeEach(() => {
  currentToken = "staff-a-jwt";
  sessionRead = async () => currentToken;
  cache.resetAdminDataCacheForTests();
  cache.setAdminDataScope("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("duplicate GET requests", () => {
  it("three concurrent wedding-details reads (DATA tab editors) make one request; each caller gets its own copy", async () => {
    const calls = stubFetch(() => ({ data: { groomName: "Minh" } }));
    const results = await Promise.all([
      client.fetchWeddingDetails(PROJECT_ID),
      client.fetchWeddingDetails(PROJECT_ID),
      client.fetchWeddingDetails(PROJECT_ID),
    ]);
    expect(calls).toHaveLength(1);
    expect(results.map((r) => r?.groomName)).toEqual(["Minh", "Minh", "Minh"]);
    expect(results[0]).not.toBe(results[1]);
  });

  it("different Projects and different endpoints are never shared", async () => {
    const calls = stubFetch(() => ({ data: [] }));
    await Promise.all([
      client.fetchProjectEvents(PROJECT_ID),
      client.fetchProjectEvents(OTHER_PROJECT_ID),
      client.fetchProjectTimeline(PROJECT_ID),
    ]);
    expect(calls.map((c) => c.url).sort()).toEqual(
      [
        `/api/v2/internal/projects/${PROJECT_ID}/events`,
        `/api/v2/internal/projects/${OTHER_PROJECT_ID}/events`,
        `/api/v2/internal/projects/${PROJECT_ID}/timeline`,
      ].sort(),
    );
  });

  it("different query strings are never shared", async () => {
    const calls = stubFetch(() => []);
    await Promise.all([client.fetchProjects({ limit: 5 }), client.fetchProjects()]);
    expect(calls.map((c) => c.url)).toEqual(["/api/v2/internal/projects?limit=5", "/api/v2/internal/projects?limit=100"]);
  });

  it("different access tokens (another Staff session) are never shared", async () => {
    const calls = stubFetch((call) => ({ data: { tokenSeen: call.authorization } }));
    const first = client.fetchWeddingDetails(PROJECT_ID);
    currentToken = "staff-b-jwt";
    const second = client.fetchWeddingDetails(PROJECT_ID);
    const [a, b] = (await Promise.all([first, second])) as unknown as { tokenSeen: string }[];
    expect(calls).toHaveLength(2);
    expect(a.tokenSeen).toBe("Bearer staff-a-jwt");
    expect(b.tokenSeen).toBe("Bearer staff-b-jwt");
  });

  it("an error reaches every joined caller, is not retained and is not retried automatically", async () => {
    const calls = stubFetch(() => ({ error: "Không có quyền" }), 403);
    const results = await Promise.allSettled([client.fetchWeddingDetails(PROJECT_ID), client.fetchWeddingDetails(PROJECT_ID)]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(calls).toHaveLength(1);
    await client.fetchWeddingDetails(PROJECT_ID).catch(() => undefined);
    expect(calls).toHaveLength(2);
  });
});

describe("writes", () => {
  it("identical concurrent writes are never shared", async () => {
    const calls = stubFetch((_, n) => ({ data: { id: `link-${n}`, token: `raw-${n}` } }));
    const [a, b] = await Promise.all([client.issueReviewAccessLink(PROJECT_ID), client.issueReviewAccessLink(PROJECT_ID)]);
    expect(calls.map((c) => c.method)).toEqual(["POST", "POST"]);
    expect(a.token).not.toBe(b.token);
  });

  it("a GET issued after a write starts never joins a read that began before the write", async () => {
    const calls = stubFetch((call, n) => (call.method === "PUT" ? { data: { weddingDetails: {} } } : { data: { groomName: `v${n}` } }));
    const before = client.fetchWeddingDetails(PROJECT_ID);
    const write = client.saveWeddingDetails(PROJECT_ID, {} as Parameters<typeof client.saveWeddingDetails>[1]);
    const after = client.fetchWeddingDetails(PROJECT_ID);
    await Promise.all([before, write, after]);
    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT", "GET"]);
    expect((await after)?.groomName).toBe("v3");
  });

  it("a successful write invalidates stored query results", async () => {
    stubFetch((call) => (call.method === "GET" ? { data: { groomName: "old" } } : { data: { weddingDetails: {} } }));
    await cache.loadAdminQuery(`project:${PROJECT_ID}:wedding-details`, () => client.fetchWeddingDetails(PROJECT_ID));
    expect(cache.readAdminQuery(`project:${PROJECT_ID}:wedding-details`)).toBeDefined();
    await client.saveWeddingDetails(PROJECT_ID, {} as Parameters<typeof client.saveWeddingDetails>[1]);
    expect(cache.readAdminQuery(`project:${PROJECT_ID}:wedding-details`)).toBeUndefined();
  });

  it("a failed write still invalidates (it may have been applied server-side) and is not retried", async () => {
    await cache.loadAdminQuery("dashboard", async () => "cached");
    const calls = stubFetch(() => ({ error: "Lỗi máy chủ" }), 500);
    await expect(client.transitionProjectStatus(PROJECT_ID, "IN_PROGRESS")).rejects.toBeInstanceOf(AdminApiError);
    expect(calls).toHaveLength(1);
    expect(cache.readAdminQuery("dashboard")).toBeUndefined();
  });

  it("one-time access-link tokens are never stored or reused", async () => {
    const calls = stubFetch((call) => (call.method === "POST" ? { data: { id: "l1", token: "raw-secret" } } : { data: [] }));
    await client.issuePortalAccessLink(PROJECT_ID);
    await client.fetchProjectAccessLinks(PROJECT_ID);
    expect(calls.map((c) => c.method)).toEqual(["POST", "GET"]);
    expect(JSON.stringify(cache.readAdminQuery(`project:${PROJECT_ID}:access-links`) ?? null)).not.toContain("raw-secret");
  });

  it("writes carry no abort signal (never cancelled by the read timeout)", async () => {
    const calls = stubFetch(() => ({ data: {} }));
    await client.markProjectPaid(PROJECT_ID);
    expect(calls[0].signal).toBeUndefined();
  });
});

describe("bounded timeouts", () => {
  it("a stalled GET is aborted after READ_TIMEOUT_MS with a Vietnamese retry message", async () => {
    vi.useFakeTimers();
    const calls = stubHangingFetch();
    const pending = client.fetchAdminDashboard();
    const outcome = expect(pending).rejects.toMatchObject({ status: 0, message: client.READ_TIMEOUT_MESSAGE });
    await vi.advanceTimersByTimeAsync(client.READ_TIMEOUT_MS);
    await outcome;
    expect(calls).toHaveLength(1);
    expect(calls[0].signal?.aborted).toBe(true);
  });

  it("a timed-out GET is not retained: the next call sends a new request", async () => {
    vi.useFakeTimers();
    const calls = stubHangingFetch();
    const first = client.fetchAdminDashboard().catch(() => undefined);
    await vi.advanceTimersByTimeAsync(client.READ_TIMEOUT_MS);
    await first;
    void client.fetchAdminDashboard().catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(client.READ_TIMEOUT_MS);
  });

  it("a stalled write is NOT aborted by the read timeout", async () => {
    vi.useFakeTimers();
    let settled = false;
    const calls = stubHangingFetch();
    void client.markProjectPaid(PROJECT_ID).finally(() => {
      settled = true;
    }).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(client.READ_TIMEOUT_MS * 3);
    expect(calls).toHaveLength(1);
    expect(settled).toBe(false);
  });

  it("a stalled local session read fails within SESSION_TIMEOUT_MS and sends nothing (read or write)", async () => {
    vi.useFakeTimers();
    sessionRead = () => new Promise(() => {});
    const calls = stubFetch(() => ({}));
    const read = expect(client.fetchAdminDashboard()).rejects.toMatchObject({ status: 0 });
    const write = expect(client.markProjectPaid(PROJECT_ID)).rejects.toMatchObject({ status: 0 });
    await vi.advanceTimersByTimeAsync(client.SESSION_TIMEOUT_MS);
    await read;
    await write;
    expect(calls).toHaveLength(0);
  });

  it("no session → 401 without any request", async () => {
    currentToken = null;
    const calls = stubFetch(() => ({}));
    await expect(client.fetchAdminDashboard()).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(0);
  });
});
