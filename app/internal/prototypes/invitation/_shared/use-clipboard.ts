"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared copy-to-clipboard behavior for the gift modal (CLAUDE.md §6/§25 —
 * behavior centralized once, not reimplemented per template). Presentation
 * (which field, styling) stays local to each template.
 */
export function useClipboard(resetDelayMs = 1600) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = useCallback(
    (key: string, value: string) => {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(value).catch(() => {});
      }
      setCopiedKey(key);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopiedKey(null), resetDelayMs);
    },
    [resetDelayMs]
  );

  return { copiedKey, copy };
}
