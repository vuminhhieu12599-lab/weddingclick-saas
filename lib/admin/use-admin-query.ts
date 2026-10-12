"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isUnauthorized } from "./admin-api-error";
import { loadAdminQuery, readAdminQuery } from "./admin-data-cache";

/**
 * Shared loading/data/error state for a client-side V2 Admin data fetch.
 * Every real-data admin page must handle loading/error/empty states (this
 * task's UX-states requirement) — this hook centralizes that instead of
 * re-implementing it per page.
 */
export interface AdminQueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export interface AdminQueryOptions {
  /**
   * LAUNCH-P0-03 opt-in reuse key (see lib/admin/admin-queries.ts). With a
   * key, a result loaded in the last ADMIN_QUERY_TTL_MS by the same Staff
   * user — with no write since — is shown immediately without a request,
   * and concurrent screens with the same key share one load. `reload()`
   * always goes to the network. The key must identify everything the
   * fetcher reads (e.g. include the projectId). Without a key the hook
   * behaves exactly as before (always fetches; requests are still shared
   * while in flight by the API client).
   */
  cacheKey?: string;
}

/**
 * Upper bound for one load, on top of the per-request READ_TIMEOUT_MS, so
 * "Đang tải dữ liệu..." can never stay on screen indefinitely whatever the
 * fetcher does.
 */
export const ADMIN_QUERY_DEADLINE_MS = 30_000;
export const ADMIN_QUERY_DEADLINE_MESSAGE = "Tải dữ liệu quá lâu. Vui lòng kiểm tra kết nối mạng rồi bấm “Thử lại”.";
export const ADMIN_SESSION_EXPIRED_MESSAGE = "Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang hoặc đăng nhập lại.";

export function adminQueryErrorMessage(err: unknown): string {
  if (isUnauthorized(err)) {
    return ADMIN_SESSION_EXPIRED_MESSAGE;
  }
  return err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định";
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(ADMIN_QUERY_DEADLINE_MESSAGE)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * One load: the stored/pending result for `cacheKey` when allowed, else a
 * fetcher call; bounded by `deadlineMs`. Exported for tests.
 */
export function runAdminQuery<T>(
  fetcher: () => Promise<T>,
  cacheKey: string | undefined,
  force: boolean,
  deadlineMs: number = ADMIN_QUERY_DEADLINE_MS,
): Promise<T> {
  const load = cacheKey === undefined ? fetcher() : loadAdminQuery(cacheKey, fetcher, { force });
  return withDeadline(load, deadlineMs);
}

interface QueryStateInternal<T> {
  /** The cacheKey this state belongs to (undefined for unkeyed queries). */
  key: string | undefined;
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useAdminQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options: AdminQueryOptions = {},
): AdminQueryState<T> {
  const { cacheKey } = options;
  // A still-valid stored result renders on the very first paint (no loading flash).
  const [initial] = useState(() => {
    const stored = cacheKey === undefined ? undefined : readAdminQuery<T>(cacheKey);
    return stored === undefined
      ? { fromStore: false, state: { key: cacheKey, data: null, loading: true, error: null } }
      : { fromStore: true, state: { key: cacheKey, data: stored, loading: false, error: null } };
  });
  const [state, setState] = useState<QueryStateInternal<T>>(initial.state);
  const isFirstRun = useRef(true);
  const [reloadToken, setReloadToken] = useState(0);
  const handledReloadToken = useRef(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    const force = reloadToken !== handledReloadToken.current;
    handledReloadToken.current = reloadToken;

    const firstRun = isFirstRun.current;
    isFirstRun.current = false;
    if (firstRun && initial.fromStore && !force) {
      // The mount already rendered the stored result for this key.
      return;
    }

    const stored = force || cacheKey === undefined ? undefined : readAdminQuery<T>(cacheKey);
    if (stored !== undefined) {
      setState({ key: cacheKey, data: stored, loading: false, error: null });
      return;
    }

    // Keep the previous data only while it belongs to the same key, so a
    // different Project's data is never shown as this one's.
    setState((current) => ({
      key: cacheKey,
      data: current.key === cacheKey ? current.data : null,
      loading: true,
      error: null,
    }));

    runAdminQuery(fetcher, cacheKey, force).then(
      (result) => {
        if (!cancelled) {
          setState({ key: cacheKey, data: result, loading: false, error: null });
        }
      },
      (err: unknown) => {
        if (!cancelled) {
          setState((current) => ({
            key: cacheKey,
            data: current.key === cacheKey ? current.data : null,
            loading: false,
            error: adminQueryErrorMessage(err),
          }));
        }
      },
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, cacheKey, reloadToken]);

  // Between a key change and the effect above, never expose the old key's state.
  if (state.key !== cacheKey) {
    return { data: null, loading: true, error: null, reload };
  }
  return { data: state.data, loading: state.loading, error: state.error, reload };
}
