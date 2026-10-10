import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * LAUNCH-P0-01: concurrent identical admin GETs share one request; nothing
 * is cached after a response settles, and a write never lets a later GET
 * reuse a read that started before it.
 */

vi.mock("../staff-session-client", () => ({ getStaffAccessToken: async () => "staff-jwt" }));
vi.mock("../signed-media-upload", () => ({ uploadToSignedMediaPath: vi.fn() }));

const client = await import("../admin-api-client");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(bodyFor: (call: number) => unknown, status = 200) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET" });
    const body = bodyFor(calls.length);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return calls;
}

describe("admin-api-client in-flight GET sharing", () => {
  it("three concurrent identical GETs make one request and each caller gets its own copy", async () => {
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

  it("does not cache: a GET after the previous one settled is a fresh request", async () => {
    const calls = stubFetch((n) => ({ data: { groomName: `v${n}` } }));
    expect((await client.fetchWeddingDetails(PROJECT_ID))?.groomName).toBe("v1");
    expect((await client.fetchWeddingDetails(PROJECT_ID))?.groomName).toBe("v2");
    expect(calls).toHaveLength(2);
  });

  it("different paths are never shared", async () => {
    const calls = stubFetch(() => ({ data: [] }));
    await Promise.all([client.fetchProjectEvents(PROJECT_ID), client.fetchProjectTimeline(PROJECT_ID)]);
    expect(calls.map((c) => c.url)).toEqual([
      `/api/v2/internal/projects/${PROJECT_ID}/events`,
      `/api/v2/internal/projects/${PROJECT_ID}/timeline`,
    ]);
  });

  it("a GET issued after a write starts never joins a read that began before the write", async () => {
    const calls = stubFetch((n) => (n === 2 ? { data: { weddingDetails: {} } } : { data: { groomName: `v${n}` } }));
    const before = client.fetchWeddingDetails(PROJECT_ID);
    const write = client.saveWeddingDetails(PROJECT_ID, {} as Parameters<typeof client.saveWeddingDetails>[1]);
    const after = client.fetchWeddingDetails(PROJECT_ID);
    await Promise.all([before, write, after]);
    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT", "GET"]);
    expect((await after)?.groomName).toBe("v3");
  });

  it("errors reach every joined caller and are not retained", async () => {
    const calls = stubFetch(() => ({ error: "Không có quyền" }), 403);
    const results = await Promise.allSettled([client.fetchWeddingDetails(PROJECT_ID), client.fetchWeddingDetails(PROJECT_ID)]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(calls).toHaveLength(1);
    await client.fetchWeddingDetails(PROJECT_ID).catch(() => undefined);
    expect(calls).toHaveLength(2);
  });
});
