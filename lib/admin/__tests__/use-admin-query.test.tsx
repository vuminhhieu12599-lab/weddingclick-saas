import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../admin-api-error";
import { loadAdminQuery, resetAdminDataCacheForTests, setAdminDataScope } from "../admin-data-cache";
import {
  ADMIN_QUERY_DEADLINE_MESSAGE,
  ADMIN_QUERY_DEADLINE_MS,
  ADMIN_SESSION_EXPIRED_MESSAGE,
  adminQueryErrorMessage,
  runAdminQuery,
  useAdminQuery,
} from "../use-admin-query";

/**
 * LAUNCH-P0-03: useAdminQuery never loads forever, reports expired sessions
 * in Vietnamese, renders a still-valid stored result on first paint, and
 * never shows one key's (Project's) data as another's.
 */

const STAFF_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  resetAdminDataCacheForTests();
  setAdminDataScope(STAFF_A);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runAdminQuery", () => {
  it("rejects with a Vietnamese 'Thử lại' message when a load exceeds the deadline", async () => {
    vi.useFakeTimers();
    const outcome = expect(runAdminQuery(() => new Promise(() => {}), undefined, false)).rejects.toThrow(ADMIN_QUERY_DEADLINE_MESSAGE);
    await vi.advanceTimersByTimeAsync(ADMIN_QUERY_DEADLINE_MS);
    await outcome;
    expect(ADMIN_QUERY_DEADLINE_MESSAGE).toContain("Thử lại");
  });

  it("with a key, reuses a stored result unless forced", async () => {
    const fetcher = vi.fn(async () => "network");
    await loadAdminQuery("q", async () => "stored");
    expect(await runAdminQuery(fetcher, "q", false)).toBe("stored");
    expect(fetcher).not.toHaveBeenCalled();
    expect(await runAdminQuery(fetcher, "q", true)).toBe("network");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("without a key, always calls the fetcher (pre-LAUNCH-P0-03 behaviour)", async () => {
    const fetcher = vi.fn(async () => "network");
    await runAdminQuery(fetcher, undefined, false);
    await runAdminQuery(fetcher, undefined, false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("adminQueryErrorMessage", () => {
  it("maps an expired/invalid session (401) to a Vietnamese message", () => {
    expect(adminQueryErrorMessage(new AdminApiError(401, "Invalid or expired access token"))).toBe(ADMIN_SESSION_EXPIRED_MESSAGE);
  });

  it("keeps the server's safe message for other failures", () => {
    expect(adminQueryErrorMessage(new AdminApiError(0, "Không thể kết nối tới máy chủ"))).toBe("Không thể kết nối tới máy chủ");
    expect(adminQueryErrorMessage("weird")).toBe("Đã xảy ra lỗi không xác định");
  });
});

function Probe({ cacheKey, fetcher }: { cacheKey?: string; fetcher: () => Promise<string> }) {
  const state = useAdminQuery(fetcher, [cacheKey], cacheKey === undefined ? {} : { cacheKey });
  return <p data-loading={String(state.loading)}>{state.data ?? "none"}</p>;
}

describe("useAdminQuery first paint", () => {
  it("renders a still-valid stored result immediately, without a loading state", async () => {
    await loadAdminQuery("project:1:summary", async () => "Project 1");
    const html = renderToStaticMarkup(<Probe cacheKey="project:1:summary" fetcher={async () => "x"} />);
    expect(html).toBe('<p data-loading="false">Project 1</p>');
  });

  it("never renders another key's stored result (another Project)", async () => {
    await loadAdminQuery("project:1:summary", async () => "Project 1");
    const html = renderToStaticMarkup(<Probe cacheKey="project:2:summary" fetcher={async () => "x"} />);
    expect(html).toBe('<p data-loading="true">none</p>');
  });

  it("never renders another Staff user's stored result", async () => {
    await loadAdminQuery("dashboard", async () => "A's");
    setAdminDataScope("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const html = renderToStaticMarkup(<Probe cacheKey="dashboard" fetcher={async () => "x"} />);
    expect(html).toBe('<p data-loading="true">none</p>');
  });

  it("an unkeyed query starts loading as before", () => {
    const html = renderToStaticMarkup(<Probe fetcher={async () => "x"} />);
    expect(html).toBe('<p data-loading="true">none</p>');
  });
});
