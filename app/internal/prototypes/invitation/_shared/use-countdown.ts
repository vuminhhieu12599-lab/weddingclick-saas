"use client";

import { useRef, useSyncExternalStore } from "react";

import { deriveCountdown, type CountdownParts } from "./derive-ceremony";

const SERVER_SNAPSHOT: CountdownParts = { days: 0, hours: 0, minutes: 0, seconds: 0, hasPassed: false };

interface CountdownStore {
  isoDateTime: string;
  snapshot: CountdownParts;
}

/**
 * Re-derives from the same canonical instant once per tick. `getSnapshot`
 * must return a stable reference between calls when nothing has changed —
 * returning `deriveCountdown(...)` fresh on every call breaks that contract
 * and makes useSyncExternalStore re-render forever ("getSnapshot should be
 * cached"). The snapshot is cached in a ref and only replaced inside the
 * interval tick (or when `isoDateTime` itself changes).
 *
 * The fixed SERVER_SNAPSHOT keeps SSR and the client's first paint
 * identical — `new Date()` at render time would otherwise differ by the
 * SSR/hydration time gap and trigger a hydration mismatch on the seconds
 * digit.
 */
export function useCountdown(isoDateTime: string): CountdownParts {
  const storeRef = useRef<CountdownStore | null>(null);

  const getSnapshot = (): CountdownParts => {
    if (!storeRef.current || storeRef.current.isoDateTime !== isoDateTime) {
      storeRef.current = { isoDateTime, snapshot: deriveCountdown(isoDateTime, new Date()) };
    }
    return storeRef.current.snapshot;
  };

  const subscribe = (onStoreChange: () => void) => {
    const interval = setInterval(() => {
      storeRef.current = { isoDateTime, snapshot: deriveCountdown(isoDateTime, new Date()) };
      onStoreChange();
    }, 1000);
    return () => clearInterval(interval);
  };

  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}
