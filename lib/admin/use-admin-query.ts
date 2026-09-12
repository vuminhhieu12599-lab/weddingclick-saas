"use client";

import { useCallback, useEffect, useState } from "react";

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

export function useAdminQuery<T>(fetcher: () => Promise<T>, deps: unknown[]): AdminQueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const result = await fetcher();
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định");
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  return { data, loading, error, reload };
}
