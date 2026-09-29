/**
 * Invitation Rendering Foundation RF-06C — the clock browser adapter
 * (docs/DECISIONS.md "RF-06-0 …" P36; RF-05 K26, K28–K29, K35).
 *
 * The only RF-06 module that reads the current time or owns a timer. It
 * produces explicit epoch milliseconds from `Date.now()` and nothing else:
 * no `Date` object, no formatting, no timezone, no date/calendar
 * derivation (RF-05C stays pure), no persistence and no server time.
 *
 * Nothing runs on module evaluation. The React owner (runtime-capabilities)
 * starts the ticker after mount only, so there is no clock during server
 * render or the first client render, and stops it on unmount.
 */

/** K28: the countdown refresh cadence belongs to the clock adapter. */
export const CLOCK_REFRESH_INTERVAL_MS = 1000;

/** Injectable time and interval primitives; production uses the browser's. */
export interface ClockSourceV1<THandle> {
  now(): number;
  setInterval(callback: () => void, delayMs: number): THandle;
  clearInterval(handle: THandle): void;
}

/**
 * Emits the current epoch once immediately, then about every second, and
 * returns an idempotent stop function that clears exactly the interval it
 * started.
 */
export function startClockTicker<THandle>(
  source: ClockSourceV1<THandle>,
  onTick: (nowEpochMs: number) => void,
): () => void {
  const tick = () => onTick(source.now());
  tick();
  const handle = source.setInterval(tick, CLOCK_REFRESH_INTERVAL_MS);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    source.clearInterval(handle);
  };
}

/** The real browser primitives. Referencing them reads no time and starts no timer. */
export const BROWSER_CLOCK_SOURCE: ClockSourceV1<ReturnType<typeof setInterval>> = Object.freeze({
  now: () => Date.now(),
  setInterval: (callback: () => void, delayMs: number) => setInterval(callback, delayMs),
  clearInterval: (handle: ReturnType<typeof setInterval>) => clearInterval(handle),
});
