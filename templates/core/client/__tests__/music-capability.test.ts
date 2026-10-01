import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { MediaResolution } from "../../../../lib/invitation-rendering/invitation-view-model-types";
import {
  MUSIC_AUDIO_EVENT_TYPES,
  createBrowserAudio,
  createMusicController,
  resolveMusicSourceUrl,
  type MusicAudioElementV1,
  type MusicAudioEventTypeV1,
} from "../music-capability";

/**
 * RF-06C music adapter (docs/DECISIONS.md "RF-06-0 …" P35; RF-05
 * K23–K25): creation gate, lazy single instance, status mapping, expected
 * vs unexpected failures, no automatic retry, cleanup. Node environment
 * with a fake media element; no jsdom.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const URL_A = "/internal/renderer-harness/media/song-a.mp3";
const URL_B = "/internal/renderer-harness/media/song-b.mp3";

const RESOLVED: MediaResolution = { status: "RESOLVED", mediaId: "audio-1", url: URL_A, width: null, height: null };
const UNAVAILABLE: MediaResolution = { status: "UNAVAILABLE", mediaId: "audio-1" };

type PlayBehavior = { kind: "resolve" } | { kind: "reject"; reason: unknown } | { kind: "manual" };

class FakeAudio implements MusicAudioElementV1 {
  preload = "auto";
  loop = false;
  src = "";
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  readonly listeners = new Map<MusicAudioEventTypeV1, Set<() => void>>();
  readonly assignments: string[] = [];
  behavior: PlayBehavior = { kind: "resolve" };
  private pending: { resolve: () => void; reject: (reason: unknown) => void } | null = null;

  constructor() {
    return new Proxy(this, {
      set: (target, property, value) => {
        if (property === "preload" || property === "loop" || property === "src") target.assignments.push(String(property));
        return Reflect.set(target, property, value);
      },
    });
  }

  play(): Promise<void> {
    this.playCalls += 1;
    const behavior = this.behavior;
    if (behavior.kind === "resolve") {
      this.paused = false;
      return Promise.resolve();
    }
    if (behavior.kind === "reject") return Promise.reject(behavior.reason);
    return new Promise<void>((resolve, reject) => {
      this.pending = {
        resolve: () => {
          this.paused = false;
          resolve();
        },
        reject,
      };
    });
  }

  settle(outcome: "resolve" | { reason: unknown }): void {
    const pending = this.pending;
    this.pending = null;
    if (pending === null) throw new Error("no pending play");
    if (outcome === "resolve") pending.resolve();
    else pending.reject(outcome.reason);
  }

  pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
  }

  addEventListener(type: MusicAudioEventTypeV1, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: MusicAudioEventTypeV1, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }

  dispatch(type: MusicAudioEventTypeV1): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
}

function setup(url = URL_A) {
  const instances: FakeAudio[] = [];
  const factory = vi.fn(() => {
    const audio = new FakeAudio();
    instances.push(audio);
    return audio;
  });
  const controller = createMusicController(url, factory);
  const notifications = vi.fn();
  controller.subscribe(notifications);
  return { controller, factory, instances, notifications };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveMusicSourceUrl (P35 creation gate)", () => {
  it("absent audio → no capability", () => {
    expect(resolveMusicSourceUrl(true, undefined)).toBeNull();
  });

  it("UNAVAILABLE audio → no capability", () => {
    expect(resolveMusicSourceUrl(true, UNAVAILABLE)).toBeNull();
  });

  it("sections.music false → no capability, even for RESOLVED audio", () => {
    expect(resolveMusicSourceUrl(false, RESOLVED)).toBeNull();
  });

  it("RESOLVED audio and sections.music true → the resolved URL", () => {
    expect(resolveMusicSourceUrl(true, RESOLVED)).toBe(URL_A);
  });

  it("only the literal boolean true enables music", () => {
    expect(resolveMusicSourceUrl("true" as unknown as boolean, RESOLVED)).toBeNull();
    expect(resolveMusicSourceUrl(1 as unknown as boolean, RESOLVED)).toBeNull();
  });
});

describe("createMusicController: lazy single instance, no autoplay", () => {
  it("starts PAUSED with zero audio instances, and activation creates none", () => {
    const { controller, factory } = setup();
    expect(controller.getStatus()).toBe("PAUSED");
    expect(controller.url).toBe(URL_A);
    controller.activate();
    expect(factory).not.toHaveBeenCalled();
  });

  it("exposes no volume, mute, seek or playlist surface", () => {
    const { controller } = setup();
    expect(Object.keys(controller).sort()).toStrictEqual(
      ["activate", "deactivate", "getStatus", "pause", "play", "subscribe", "url"].sort(),
    );
    expect(Object.isFrozen(controller)).toBe(true);
  });

  it("pause before any play creates no instance", async () => {
    const { controller, factory } = setup();
    controller.activate();
    await controller.pause();
    expect(factory).not.toHaveBeenCalled();
    expect(controller.getStatus()).toBe("PAUSED");
  });

  it("the first explicit play creates exactly one instance: preload none, loop true, then the resolved URL", async () => {
    const { controller, factory, instances } = setup();
    controller.activate();
    await controller.play();
    expect(factory).toHaveBeenCalledTimes(1);
    const [audio] = instances;
    expect(audio?.preload).toBe("none");
    expect(audio?.loop).toBe(true);
    expect(audio?.src).toBe(URL_A);
    expect(audio?.assignments).toStrictEqual(["preload", "loop", "src"]);
    expect(audio?.listenerCount()).toBe(MUSIC_AUDIO_EVENT_TYPES.length);
  });

  it("play → PLAYING, pause → PAUSED, and later commands reuse the same instance", async () => {
    const { controller, factory, instances, notifications } = setup();
    controller.activate();
    await controller.play();
    expect(controller.getStatus()).toBe("PLAYING");
    await controller.pause();
    expect(controller.getStatus()).toBe("PAUSED");
    expect(instances[0]?.pauseCalls).toBe(1);
    await controller.play();
    await controller.play();
    expect(controller.getStatus()).toBe("PLAYING");
    expect(factory).toHaveBeenCalledTimes(1);
    expect(instances[0]?.playCalls).toBe(3);
    expect(notifications).toHaveBeenCalledTimes(3);
  });

  it("play() is inert before activation and after deactivation (no instance, no playback)", async () => {
    const { controller, factory } = setup();
    await controller.play();
    expect(factory).not.toHaveBeenCalled();
    controller.activate();
    controller.deactivate();
    await controller.play();
    expect(factory).not.toHaveBeenCalled();
    expect(controller.getStatus()).toBe("PAUSED");
  });

  it("status is not PLAYING while play() is still pending", async () => {
    const { controller, factory, instances } = setup();
    factory.mockImplementationOnce(() => {
      const audio = new FakeAudio();
      audio.behavior = { kind: "manual" };
      instances.push(audio);
      return audio;
    });
    controller.activate();
    let settled = false;
    const pending = controller.play().then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);
    expect(controller.getStatus()).toBe("PAUSED");
    instances[0]!.settle("resolve");
    await pending;
    expect(controller.getStatus()).toBe("PLAYING");
  });
});

describe("createMusicController: expected outcomes resolve through status", () => {
  it("NotAllowedError → BLOCKED and the command Promise resolves", async () => {
    const { controller, instances, factory } = setup();
    controller.activate();
    const factoryAudio = () => instances[0] as FakeAudio;
    // First play creates the instance; configure the rejection before it is invoked.
    factory.mockImplementationOnce(() => {
      const audio = new FakeAudio();
      audio.behavior = { kind: "reject", reason: new DOMException("autoplay", "NotAllowedError") };
      instances.push(audio);
      return audio;
    });
    await expect(controller.play()).resolves.toBeUndefined();
    expect(controller.getStatus()).toBe("BLOCKED");
    expect(factoryAudio().playCalls).toBe(1);
  });

  it.each(["NotSupportedError", "AbortError", "NetworkError", "MediaError"])(
    "%s DOMException → ERROR and the command Promise resolves",
    async (name) => {
      const { controller, factory } = setup();
      factory.mockImplementationOnce(() => {
        const audio = new FakeAudio();
        audio.behavior = { kind: "reject", reason: new DOMException("media", name) };
        return audio;
      });
      controller.activate();
      await expect(controller.play()).resolves.toBeUndefined();
      expect(controller.getStatus()).toBe("ERROR");
    },
  );

  it.each([
    ["TypeError", new TypeError("not a function")],
    ["plain Error", new Error("boom")],
    ["non-error value", { code: 1 }],
  ])("an unexpected %s rejects the command and never becomes PLAYING/ERROR", async (_label, reason) => {
    const { controller, factory, notifications } = setup();
    factory.mockImplementationOnce(() => {
      const audio = new FakeAudio();
      audio.behavior = { kind: "reject", reason };
      return audio;
    });
    controller.activate();
    await expect(controller.play()).rejects.toBe(reason);
    expect(controller.getStatus()).toBe("PAUSED");
    expect(notifications).not.toHaveBeenCalled();
  });

  it("a DOMException-like plain object is not treated as an expected DOMException", async () => {
    const { controller, factory } = setup();
    const lookalike = { name: "NotAllowedError", message: "fake" };
    factory.mockImplementationOnce(() => {
      const audio = new FakeAudio();
      audio.behavior = { kind: "reject", reason: lookalike };
      return audio;
    });
    controller.activate();
    await expect(controller.play()).rejects.toBe(lookalike);
    expect(controller.getStatus()).toBe("PAUSED");
  });
});

describe("createMusicController: retry is explicit only", () => {
  it("after BLOCKED nothing retries on its own; an explicit play retries on the same instance", async () => {
    vi.useFakeTimers();
    try {
      const { controller, factory, instances } = setup();
      factory.mockImplementationOnce(() => {
        const audio = new FakeAudio();
        audio.behavior = { kind: "reject", reason: new DOMException("autoplay", "NotAllowedError") };
        instances.push(audio);
        return audio;
      });
      controller.activate();
      await controller.play();
      expect(controller.getStatus()).toBe("BLOCKED");

      await vi.advanceTimersByTimeAsync(60_000);
      await flush();
      expect(instances[0]?.playCalls).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
      expect(controller.getStatus()).toBe("BLOCKED");

      instances[0]!.behavior = { kind: "resolve" };
      await controller.play();
      expect(controller.getStatus()).toBe("PLAYING");
      expect(instances[0]?.playCalls).toBe(2);
      expect(factory).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

});

describe("createMusicController: sticky ERROR retry (RF-06C owner patch)", () => {
  const MEDIA_FAILURE = new DOMException("decode", "NotSupportedError");

  /** Like a browser: once failed, an element keeps rejecting play() (it never reloads by itself). */
  function failingAudio(instances: FakeAudio[]): FakeAudio {
    const audio = new FakeAudio();
    audio.behavior = { kind: "reject", reason: MEDIA_FAILURE };
    instances.push(audio);
    return audio;
  }

  it("a rejected play → ERROR, never PLAYING, and nothing retries on its own", async () => {
    vi.useFakeTimers();
    try {
      const { controller, factory, instances } = setup();
      factory.mockImplementationOnce(() => failingAudio(instances));
      controller.activate();
      await controller.play();
      expect(controller.getStatus()).toBe("ERROR");

      await vi.advanceTimersByTimeAsync(60_000);
      await flush();
      expect(vi.getTimerCount()).toBe(0);
      expect(factory).toHaveBeenCalledTimes(1);
      expect(instances[0]?.playCalls).toBe(1);
      expect(controller.getStatus()).toBe("ERROR");
    } finally {
      vi.useRealTimers();
    }
  });

  it("an explicit play from ERROR makes exactly one fresh attempt on a new instance and can return to PLAYING", async () => {
    const { controller, factory, instances } = setup();
    factory.mockImplementationOnce(() => failingAudio(instances));
    controller.activate();
    await controller.play();
    expect(controller.getStatus()).toBe("ERROR");

    await controller.play();
    expect(factory).toHaveBeenCalledTimes(2);
    const [failed, fresh] = instances;
    expect(failed?.playCalls).toBe(1);
    expect(failed?.listenerCount()).toBe(0);
    expect(failed?.pauseCalls).toBe(1);
    expect(fresh?.playCalls).toBe(1);
    expect(fresh?.src).toBe(URL_A);
    expect(fresh?.preload).toBe("none");
    expect(fresh?.loop).toBe(true);
    expect(controller.getStatus()).toBe("PLAYING");

    // The released instance can no longer touch status.
    failed!.dispatch("error");
    expect(controller.getStatus()).toBe("PLAYING");
  });

  it("a failed retry stays honestly ERROR and every later explicit retry is still a fresh attempt", async () => {
    const { controller, factory, instances } = setup();
    factory.mockImplementation(() => failingAudio(instances));
    controller.activate();
    await controller.play();
    await controller.play();
    await controller.play();
    expect(controller.getStatus()).toBe("ERROR");
    expect(factory).toHaveBeenCalledTimes(3);
    expect(instances.map((audio) => audio.playCalls)).toStrictEqual([1, 1, 1]);

    factory.mockImplementation(() => {
      const audio = new FakeAudio();
      instances.push(audio);
      return audio;
    });
    await controller.play();
    expect(controller.getStatus()).toBe("PLAYING");
    expect(factory).toHaveBeenCalledTimes(4);
  });

  it("a media error during playback → ERROR; the explicit retry uses a fresh instance", async () => {
    const { controller, factory, instances } = setup();
    controller.activate();
    await controller.play();
    const first = instances[0] as FakeAudio;
    first.behavior = { kind: "reject", reason: MEDIA_FAILURE };
    first.dispatch("error");
    expect(controller.getStatus()).toBe("ERROR");

    await controller.play();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(first.playCalls).toBe(1);
    expect(controller.getStatus()).toBe("PLAYING");
  });

  it("a stale AbortError from a play superseded by pause is not a failure: the next play reuses the instance", async () => {
    const { controller, factory, instances } = setup();
    controller.activate();
    await controller.play();
    const audio = instances[0] as FakeAudio;
    audio.behavior = { kind: "manual" };
    const pending = controller.play();
    await controller.pause();
    audio.settle({ reason: new DOMException("interrupted by pause()", "AbortError") });
    await pending;
    expect(controller.getStatus()).toBe("PAUSED");

    audio.behavior = { kind: "resolve" };
    await controller.play();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(controller.getStatus()).toBe("PLAYING");
  });

  it("a slow failed attempt settling after a newer successful retry never overwrites PLAYING", async () => {
    const { controller, factory, instances } = setup();
    factory.mockImplementationOnce(() => failingAudio(instances));
    controller.activate();
    await controller.play();
    expect(controller.getStatus()).toBe("ERROR");

    factory.mockImplementationOnce(() => {
      const audio = new FakeAudio();
      audio.behavior = { kind: "manual" };
      instances.push(audio);
      return audio;
    });
    const slow = controller.play();
    const fresh = instances[1] as FakeAudio;
    // A second explicit press while the first retry is pending reuses that fresh instance.
    fresh.behavior = { kind: "resolve" };
    await controller.play();
    expect(controller.getStatus()).toBe("PLAYING");
    expect(factory).toHaveBeenCalledTimes(2);

    fresh.settle({ reason: MEDIA_FAILURE });
    await expect(slow).resolves.toBeUndefined();
    expect(controller.getStatus()).toBe("PLAYING");
  });
});

describe("createMusicController: stale settlements and media events", () => {
  it("a play superseded by pause never overwrites PAUSED (AbortError from the interrupted play)", async () => {
    const { controller, instances } = setup();
    controller.activate();
    await controller.play();
    await controller.pause();
    const audio = instances[0] as FakeAudio;
    audio.behavior = { kind: "manual" };
    const pending = controller.play();
    await controller.pause();
    audio.settle({ reason: new DOMException("interrupted by pause()", "AbortError") });
    await expect(pending).resolves.toBeUndefined();
    expect(controller.getStatus()).toBe("PAUSED");
  });

  it("a play that resolves after a later pause does not report PLAYING", async () => {
    const { controller, instances } = setup();
    controller.activate();
    await controller.play();
    await controller.pause();
    const audio = instances[0] as FakeAudio;
    audio.behavior = { kind: "manual" };
    const pending = controller.play();
    await controller.pause();
    audio.settle("resolve");
    await pending;
    expect(controller.getStatus()).toBe("PAUSED");
  });

  it("media events keep status truthful: external pause → PAUSED, media error → ERROR, playing only while unpaused", async () => {
    const { controller, instances } = setup();
    controller.activate();
    await controller.play();
    const audio = instances[0] as FakeAudio;

    audio.paused = true;
    audio.dispatch("pause");
    expect(controller.getStatus()).toBe("PAUSED");

    audio.dispatch("playing");
    expect(controller.getStatus()).toBe("PAUSED");

    audio.paused = false;
    audio.dispatch("playing");
    expect(controller.getStatus()).toBe("PLAYING");

    audio.dispatch("pause");
    expect(controller.getStatus()).toBe("PLAYING");

    audio.dispatch("error");
    expect(controller.getStatus()).toBe("ERROR");
  });
});

describe("createMusicController: cleanup", () => {
  it("deactivate pauses the owned instance, removes its listeners, releases it and reports PAUSED", async () => {
    const { controller, instances, factory } = setup();
    controller.activate();
    await controller.play();
    const audio = instances[0] as FakeAudio;
    controller.deactivate();
    expect(audio.pauseCalls).toBe(1);
    expect(audio.listenerCount()).toBe(0);
    expect(controller.getStatus()).toBe("PAUSED");

    audio.paused = false;
    audio.dispatch("playing");
    audio.dispatch("error");
    expect(controller.getStatus()).toBe("PAUSED");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("deactivation invalidates an in-flight play: it can never report PLAYING afterwards", async () => {
    const { controller, instances, factory } = setup();
    factory.mockImplementationOnce(() => {
      const audio = new FakeAudio();
      audio.behavior = { kind: "manual" };
      instances.push(audio);
      return audio;
    });
    controller.activate();
    const pending = controller.play();
    controller.deactivate();
    instances[0]!.settle("resolve");
    await pending;
    expect(controller.getStatus()).toBe("PAUSED");
  });

  it("deactivate with no instance creates none and is safe to repeat (StrictMode remount)", async () => {
    const { controller, factory } = setup();
    controller.activate();
    controller.deactivate();
    controller.deactivate();
    controller.activate();
    expect(factory).not.toHaveBeenCalled();
    await controller.play();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(controller.getStatus()).toBe("PLAYING");
  });

  it("unsubscribe stops notifications", async () => {
    const { controller } = setup();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    unsubscribe();
    controller.activate();
    await controller.play();
    expect(listener).not.toHaveBeenCalled();
  });

  it("a different resolved URL is a different controller with its own lazily created instance", async () => {
    const a = setup(URL_A);
    const b = setup(URL_B);
    a.controller.activate();
    await a.controller.play();
    a.controller.deactivate();
    b.controller.activate();
    expect(b.factory).not.toHaveBeenCalled();
    expect(b.controller.getStatus()).toBe("PAUSED");
    await b.controller.play();
    expect(b.instances[0]?.src).toBe(URL_B);
    expect(a.instances[0]?.paused).toBe(true);
  });
});

describe("createBrowserAudio", () => {
  it("constructs one detached Audio with no source and only when called", () => {
    const constructed: unknown[] = [];
    class AudioStub {
      constructor(...args: unknown[]) {
        constructed.push(args);
      }
    }
    vi.stubGlobal("Audio", AudioStub);
    expect(constructed).toHaveLength(0);
    const element = createBrowserAudio();
    expect(element).toBeInstanceOf(AudioStub);
    expect(constructed).toStrictEqual([[]]);
  });
});

describe("source", () => {
  const code = readFileSync(join(REPO_ROOT, "templates/core/client/music-capability.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("constructs Audio only inside the factory and has no autoplay, volume, mute, seek or retry timer", () => {
    expect(code.match(/new Audio\(/g)).toHaveLength(1);
    expect(code).toMatch(/export const createBrowserAudio: MusicAudioFactoryV1 = \(\) => new Audio\(\);/);
    expect(code).not.toMatch(/autoplay|volume|muted|currentTime|fastSeek|playbackRate|setTimeout|setInterval|requestAnimationFrame/);
    expect(code).not.toMatch(/\bdocument\b|\bwindow\b|localStorage|sessionStorage|indexedDB|cookie|\bfetch\b|XMLHttpRequest/);
  });
});
