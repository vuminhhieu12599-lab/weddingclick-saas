import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CLOCK_REFRESH_INTERVAL_MS, startClockTicker, type ClockSourceV1 } from "../clock-capability";

/**
 * RF-06C clock adapter (docs/DECISIONS.md "RF-06-0 …" P36; RF-05 K26,
 * K28): explicit epoch from `Date.now()`, ~1 s cadence, one interval per
 * ticker, idempotent cleanup, nothing on module evaluation. Deterministic
 * fake time/timer primitives; no jsdom.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

function fakeSource(start = 1_760_000_000_000) {
  let now = start;
  let nextHandle = 1;
  const intervals = new Map<number, { callback: () => void; delayMs: number }>();
  const source: ClockSourceV1<number> = {
    now: vi.fn(() => now),
    setInterval: vi.fn((callback: () => void, delayMs: number) => {
      const handle = nextHandle;
      nextHandle += 1;
      intervals.set(handle, { callback, delayMs });
      return handle;
    }),
    clearInterval: vi.fn((handle: number) => {
      intervals.delete(handle);
    }),
  };
  return {
    source,
    intervals,
    advance(ms: number) {
      now += ms;
      for (const { callback } of [...intervals.values()]) callback();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("startClockTicker", () => {
  it("emits the current epoch immediately, then on a ~1 second interval", () => {
    const clock = fakeSource();
    const ticks: number[] = [];
    startClockTicker(clock.source, (value) => ticks.push(value));
    expect(ticks).toStrictEqual([1_760_000_000_000]);
    expect(CLOCK_REFRESH_INTERVAL_MS).toBe(1000);
    expect(clock.source.setInterval).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 1000);
    clock.advance(1000);
    clock.advance(1000);
    expect(ticks).toStrictEqual([1_760_000_000_000, 1_760_000_001_000, 1_760_000_002_000]);
  });

  it("owns exactly one interval and the stop function clears exactly that one, once", () => {
    const clock = fakeSource();
    const stop = startClockTicker(clock.source, () => {});
    expect(clock.intervals.size).toBe(1);
    const [handle] = [...clock.intervals.keys()];
    stop();
    stop();
    expect(clock.source.clearInterval).toHaveBeenCalledExactlyOnceWith(handle);
    expect(clock.intervals.size).toBe(0);
  });

  it("after stop no further tick is emitted", () => {
    const clock = fakeSource();
    const onTick = vi.fn();
    const stop = startClockTicker(clock.source, onTick);
    stop();
    clock.advance(5000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("start/stop/start (StrictMode effect replay) never leaves two live intervals", () => {
    const clock = fakeSource();
    const stopFirst = startClockTicker(clock.source, () => {});
    stopFirst();
    const stopSecond = startClockTicker(clock.source, () => {});
    expect(clock.intervals.size).toBe(1);
    stopSecond();
    expect(clock.intervals.size).toBe(0);
  });

  it("passes raw epoch numbers only: no Date object, no formatting", () => {
    const clock = fakeSource(0);
    const values: unknown[] = [];
    startClockTicker(clock.source, (value) => values.push(value));
    clock.advance(1234);
    expect(values).toStrictEqual([0, 1234]);
    expect(values.every((value) => typeof value === "number")).toBe(true);
  });
});

describe("BROWSER_CLOCK_SOURCE", () => {
  it("module evaluation reads no time and starts no timer", async () => {
    vi.resetModules();
    const now = vi.spyOn(Date, "now");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    await import("../clock-capability");
    expect(now).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("uses Date.now and the real interval primitives with cleanup", async () => {
    vi.useFakeTimers({ now: 1_760_000_000_000 });
    const { BROWSER_CLOCK_SOURCE, startClockTicker: start } = await import("../clock-capability");
    expect(Object.isFrozen(BROWSER_CLOCK_SOURCE)).toBe(true);
    const ticks: number[] = [];
    const stop = start(BROWSER_CLOCK_SOURCE, (value) => ticks.push(value));
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(ticks).toStrictEqual([1_760_000_000_000, 1_760_000_001_000, 1_760_000_002_000, 1_760_000_003_000]);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(3000);
    expect(ticks).toHaveLength(4);
  });
});

describe("source", () => {
  const code = readFileSync(join(REPO_ROOT, "templates/core/client/clock-capability.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("reads the time only through Date.now and derives nothing", () => {
    expect(code.match(/Date\.now\(\)/g)).toHaveLength(1);
    expect(code).not.toMatch(/\bnew Date\b|\bDate\(|Date\.parse|Date\.UTC|\bIntl\b|toLocale|get(UTC)?(Day|Date|Month|FullYear|Hours)\b|timeZone|performance\.now/);
    expect(code).not.toMatch(/setTimeout|requestAnimationFrame|localStorage|sessionStorage|indexedDB|cookie|\bfetch\b|XMLHttpRequest/);
    expect(code).not.toMatch(/\bimport\b/);
  });
});
