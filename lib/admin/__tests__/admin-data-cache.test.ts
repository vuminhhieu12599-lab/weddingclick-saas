import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_QUERY_TTL_MS,
  beginAdminWrite,
  endAdminWrite,
  getAdminDataScope,
  invalidateAdminData,
  loadAdminQuery,
  prefetchAdminQuery,
  readAdminQuery,
  resetAdminDataCacheForTests,
  setAdminDataScope,
  shareInFlightGet,
} from "../admin-data-cache";

/**
 * LAUNCH-P0-03: in-flight sharing and short-lived, Staff-scoped query reuse.
 */

const STAFF_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAFF_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function counter<T>(make: (n: number) => T) {
  let calls = 0;
  const fetcher = vi.fn(async () => make(++calls));
  return fetcher;
}

beforeEach(() => {
  resetAdminDataCacheForTests();
  setAdminDataScope(STAFF_A);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("shareInFlightGet", () => {
  it("concurrent identical keys share one send; each caller gets its own copy", async () => {
    const send = vi.fn(async () => ({ data: { groomName: "Minh" } }));
    const [a, b, c] = await Promise.all([
      shareInFlightGet("token\n/path", send),
      shareInFlightGet("token\n/path", send),
      shareInFlightGet("token\n/path", send),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
  });

  it("is not a cache: a later call after the response settled sends again", async () => {
    const send = counter((n) => ({ n }));
    expect(await shareInFlightGet("k", send)).toEqual({ n: 1 });
    expect(await shareInFlightGet("k", send)).toEqual({ n: 2 });
  });

  it("different keys (another token, Project or path) never share", async () => {
    const send = counter((n) => n);
    await Promise.all([
      shareInFlightGet("tokenA\n/api/v2/internal/projects/1/wedding-details", send),
      shareInFlightGet("tokenB\n/api/v2/internal/projects/1/wedding-details", send),
      shareInFlightGet("tokenA\n/api/v2/internal/projects/2/wedding-details", send),
    ]);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("a write clears in-flight entries: a GET issued after it never joins a GET from before it", async () => {
    const first = deferred<string>();
    const send = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce("after-write");
    const before = shareInFlightGet("k", send);
    beginAdminWrite();
    endAdminWrite();
    const after = shareInFlightGet("k", send);
    first.resolve("before-write");
    expect(await before).toBe("before-write");
    expect(await after).toBe("after-write");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("an error reaches every joined caller and is not retained", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("ok");
    const results = await Promise.allSettled([shareInFlightGet("k", send), shareInFlightGet("k", send)]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(await shareInFlightGet("k", send)).toBe("ok");
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("loadAdminQuery reuse", () => {
  it("reuses a stored result within the TTL without calling the fetcher, as a fresh copy", async () => {
    const fetcher = counter((n) => ({ n, list: [1, 2] }));
    const first = await loadAdminQuery("dashboard", fetcher);
    first.list.push(99);
    const second = await loadAdminQuery("dashboard", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ n: 1, list: [1, 2] });
    expect(readAdminQuery("dashboard")).toEqual({ n: 1, list: [1, 2] });
  });

  it("expires after the TTL", async () => {
    let now = 1_000;
    const fetcher = counter((n) => n);
    expect(await loadAdminQuery("q", fetcher, { now: () => now })).toBe(1);
    now += ADMIN_QUERY_TTL_MS - 1;
    expect(await loadAdminQuery("q", fetcher, { now: () => now })).toBe(1);
    now += 1;
    expect(await loadAdminQuery("q", fetcher, { now: () => now })).toBe(2);
    expect(readAdminQuery("q", now + ADMIN_QUERY_TTL_MS)).toBeUndefined();
  });

  it("force (explicit Thử lại / reload) always calls the fetcher and refreshes the stored result", async () => {
    const fetcher = counter((n) => n);
    await loadAdminQuery("q", fetcher);
    expect(await loadAdminQuery("q", fetcher, { force: true })).toBe(2);
    expect(await loadAdminQuery("q", fetcher)).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("concurrent loads of one key share one fetcher call", async () => {
    const gate = deferred<string>();
    const fetcher = vi.fn(() => gate.promise);
    const all = Promise.all([loadAdminQuery("q", fetcher), loadAdminQuery("q", fetcher), loadAdminQuery("q", fetcher)]);
    gate.resolve("v");
    expect(await all).toEqual(["v", "v", "v"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("different keys (e.g. another Project) never share or reuse", async () => {
    const fetcher = counter((n) => n);
    expect(await loadAdminQuery("project:1:summary", fetcher)).toBe(1);
    expect(await loadAdminQuery("project:2:summary", fetcher)).toBe(2);
    expect(readAdminQuery("project:1:summary")).toBe(1);
    expect(readAdminQuery("project:2:summary")).toBe(2);
  });

  it("errors are never stored", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce("ok");
    await expect(loadAdminQuery("q", fetcher)).rejects.toThrow("timeout");
    expect(readAdminQuery("q")).toBeUndefined();
    expect(await loadAdminQuery("q", fetcher)).toBe("ok");
  });
});

describe("Staff isolation (logout / account change)", () => {
  it("a different user never sees the previous user's results", async () => {
    await loadAdminQuery("dashboard", async () => "A's dashboard");
    setAdminDataScope(STAFF_B);
    expect(readAdminQuery("dashboard")).toBeUndefined();
    expect(await loadAdminQuery("dashboard", async () => "B's dashboard")).toBe("B's dashboard");
  });

  it("sign-out (null scope) clears everything and disables reuse", async () => {
    await loadAdminQuery("dashboard", async () => "A");
    setAdminDataScope(null);
    expect(getAdminDataScope()).toBeNull();
    const fetcher = counter((n) => n);
    await loadAdminQuery("dashboard", fetcher);
    await loadAdminQuery("dashboard", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    // Signing back in as the same user does not resurrect old results.
    setAdminDataScope(STAFF_A);
    expect(readAdminQuery("dashboard")).toBeUndefined();
  });

  it("a load started by user A that settles after switching to user B is not stored for B", async () => {
    const gate = deferred<string>();
    const pending = loadAdminQuery("dashboard", () => gate.promise);
    setAdminDataScope(STAFF_B);
    gate.resolve("A's dashboard");
    await pending;
    expect(readAdminQuery("dashboard")).toBeUndefined();
  });

  it("the same scope value is a no-op (token refresh keeps reuse)", async () => {
    await loadAdminQuery("q", async () => "v");
    setAdminDataScope(STAFF_A);
    expect(readAdminQuery("q")).toBe("v");
  });
});

describe("mutation invalidation", () => {
  it("a write drops every stored result", async () => {
    await loadAdminQuery("project:1:wedding-details", async () => "old");
    await loadAdminQuery("dashboard", async () => "old");
    beginAdminWrite();
    endAdminWrite();
    expect(readAdminQuery("project:1:wedding-details")).toBeUndefined();
    expect(readAdminQuery("dashboard")).toBeUndefined();
  });

  it("a read that started before a write and settles after it is not stored", async () => {
    const gate = deferred<string>();
    const pending = loadAdminQuery("q", () => gate.promise);
    beginAdminWrite();
    endAdminWrite();
    gate.resolve("pre-write");
    expect(await pending).toBe("pre-write");
    expect(readAdminQuery("q")).toBeUndefined();
  });

  it("a read that settles while a write is still in flight is not stored", async () => {
    beginAdminWrite();
    await loadAdminQuery("q", async () => "during-write");
    expect(readAdminQuery("q")).toBeUndefined();
    endAdminWrite();
    expect(await loadAdminQuery("q", async () => "after")).toBe("after");
    expect(readAdminQuery("q")).toBe("after");
  });

  it("a load after a write never joins a load pending from before it", async () => {
    const gate = deferred<string>();
    const fetcher = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValueOnce("fresh");
    const before = loadAdminQuery("q", fetcher);
    invalidateAdminData();
    const after = loadAdminQuery("q", fetcher);
    gate.resolve("stale");
    expect(await before).toBe("stale");
    expect(await after).toBe("fresh");
    expect(readAdminQuery("q")).toBe("fresh");
  });
});

describe("stale-response races", () => {
  it("an older request that settles after a newer forced one never overwrites the newer result", async () => {
    const older = deferred<string>();
    const fetcher = vi.fn().mockReturnValueOnce(older.promise).mockResolvedValueOnce("newer");
    const first = loadAdminQuery("q", fetcher);
    expect(await loadAdminQuery("q", fetcher, { force: true })).toBe("newer");
    older.resolve("older");
    await first;
    expect(readAdminQuery("q")).toBe("newer");
  });
});

describe("prefetchAdminQuery", () => {
  it("a screen mounting while the prefetch is pending joins it (one fetcher call)", async () => {
    const gate = deferred<string>();
    const fetcher = vi.fn(() => gate.promise);
    prefetchAdminQuery("project:1:wedding-details+events", fetcher);
    const screen = loadAdminQuery("project:1:wedding-details+events", fetcher);
    gate.resolve("data");
    expect(await screen).toBe("data");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("never throws; a failed prefetch leaves nothing stored and the screen retries", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("ok");
    prefetchAdminQuery("q", fetcher);
    await Promise.resolve();
    await Promise.resolve();
    expect(readAdminQuery("q")).toBeUndefined();
    expect(await loadAdminQuery("q", fetcher)).toBe("ok");
  });

  it("does nothing without a signed-in scope", () => {
    setAdminDataScope(null);
    const fetcher = vi.fn(async () => "x");
    prefetchAdminQuery("q", fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
