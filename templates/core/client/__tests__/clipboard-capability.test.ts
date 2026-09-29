import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CLIPBOARD_COPY_RESULT_STATUSES } from "../../../../lib/invitation-rendering/renderer-capabilities";
import {
  BROWSER_CLIPBOARD_CAPABILITY,
  createClipboardCapability,
  isBrowserClipboardAvailable,
  readBrowserClipboard,
  type ClipboardWriterV1,
} from "../clipboard-capability";

/**
 * RF-06C clipboard adapter (docs/DECISIONS.md "RF-06-0 …" P34; RF-05
 * K21–K22): SUCCESS only after the real write resolves, UNAVAILABLE for a
 * missing/unusable API, FAILED for a rejected write, rejection for
 * unexpected faults. Node environment with fake Clipboard API objects.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets pending Promise callbacks run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createClipboardCapability", () => {
  it("is a frozen object exposing only copyText", () => {
    const capability = createClipboardCapability(() => undefined);
    expect(Reflect.ownKeys(capability)).toStrictEqual(["copyText"]);
    expect(Object.isFrozen(capability)).toBe(true);
  });

  it("resolves SUCCESS only after the write Promise resolves, passing the exact text once", async () => {
    const write = deferred();
    const writeText = vi.fn(() => write.promise);
    const capability = createClipboardCapability(() => ({ writeText }));

    let settled: unknown = "pending";
    const text = "0123 456 789 — NGUYỄN VĂN A · Vietcombank";
    void capability.copyText(text).then((result) => {
      settled = result;
    });
    await flush();
    expect(settled).toBe("pending");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(text);

    write.resolve();
    await flush();
    expect(settled).toStrictEqual({ status: "SUCCESS" });
    expect(Object.isFrozen(settled)).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("invokes writeText as a method of the writer object (the real Clipboard receiver)", async () => {
    const receivers: unknown[] = [];
    const writer: ClipboardWriterV1 = {
      writeText(this: unknown) {
        receivers.push(this);
        return Promise.resolve();
      },
    };
    await createClipboardCapability(() => writer).copyText("x");
    expect(receivers).toStrictEqual([writer]);
  });

  it.each([
    ["NotAllowedError DOMException", new DOMException("denied", "NotAllowedError")],
    ["other DOMException", new DOMException("nope", "DataError")],
    ["plain Error", new Error("boom")],
    ["non-error value", "string reason"],
  ])("a rejected write (%s) resolves FAILED, never SUCCESS", async (_label, reason) => {
    const capability = createClipboardCapability(() => ({ writeText: () => Promise.reject(reason) }));
    await expect(capability.copyText("x")).resolves.toStrictEqual({ status: "FAILED" });
  });

  it("a missing Clipboard API resolves UNAVAILABLE without any write", async () => {
    const capability = createClipboardCapability(() => undefined);
    await expect(capability.copyText("x")).resolves.toStrictEqual({ status: "UNAVAILABLE" });
  });

  it("looks the writer up on every call: an API that disappears becomes UNAVAILABLE", async () => {
    let writer: ClipboardWriterV1 | undefined = { writeText: () => Promise.resolve() };
    const capability = createClipboardCapability(() => writer);
    await expect(capability.copyText("x")).resolves.toStrictEqual({ status: "SUCCESS" });
    writer = undefined;
    await expect(capability.copyText("x")).resolves.toStrictEqual({ status: "UNAVAILABLE" });
  });

  it("unexpected faults reject instead of becoming a result", async () => {
    const syncThrow = createClipboardCapability(() => ({
      writeText: () => {
        throw new TypeError("Illegal invocation");
      },
    }));
    await expect(syncThrow.copyText("x")).rejects.toThrow("Illegal invocation");

    const notAPromise = createClipboardCapability(() => ({ writeText: () => undefined as unknown as Promise<void> }));
    await expect(notAPromise.copyText("x")).rejects.toThrow(TypeError);

    const writeText = vi.fn(() => Promise.resolve());
    const capability = createClipboardCapability(() => ({ writeText }));
    await expect(capability.copyText(42 as unknown as string)).rejects.toThrow(TypeError);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("every resolved result is exactly one frozen K21 status object", async () => {
    const outcomes = await Promise.all([
      createClipboardCapability(() => ({ writeText: () => Promise.resolve() })).copyText("a"),
      createClipboardCapability(() => undefined).copyText("a"),
      createClipboardCapability(() => ({ writeText: () => Promise.reject(new Error("x")) })).copyText("a"),
    ]);
    for (const outcome of outcomes) {
      expect(Object.keys(outcome)).toStrictEqual(["status"]);
      expect(CLIPBOARD_COPY_RESULT_STATUSES).toContain(outcome.status);
    }
    expect(outcomes.map((outcome) => outcome.status)).toStrictEqual(["SUCCESS", "UNAVAILABLE", "FAILED"]);
  });
});

describe("browser Clipboard API lookup", () => {
  it("there is no navigator in plain Node: unavailable", () => {
    vi.stubGlobal("navigator", undefined);
    expect(readBrowserClipboard()).toBeUndefined();
    expect(isBrowserClipboardAvailable()).toBe(false);
  });

  it.each([
    ["no clipboard (insecure context)", {}],
    ["null clipboard", { clipboard: null }],
    ["clipboard without writeText", { clipboard: {} }],
    ["non-function writeText", { clipboard: { writeText: "yes" } }],
  ])("%s: unavailable", async (_label, fakeNavigator) => {
    vi.stubGlobal("navigator", fakeNavigator);
    expect(readBrowserClipboard()).toBeUndefined();
    expect(isBrowserClipboardAvailable()).toBe(false);
    await expect(BROWSER_CLIPBOARD_CAPABILITY.copyText("x")).resolves.toStrictEqual({ status: "UNAVAILABLE" });
  });

  it("a usable navigator.clipboard is returned as-is and the production capability writes through it", async () => {
    const clipboard = { writeText: vi.fn(() => Promise.resolve()) };
    vi.stubGlobal("navigator", { clipboard });
    expect(readBrowserClipboard()).toBe(clipboard);
    expect(isBrowserClipboardAvailable()).toBe(true);
    await expect(BROWSER_CLIPBOARD_CAPABILITY.copyText("STK 0123")).resolves.toStrictEqual({ status: "SUCCESS" });
    expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith("STK 0123");
  });

  it("the production capability reports FAILED when the real write rejects", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new DOMException("x", "NotAllowedError")) } });
    await expect(BROWSER_CLIPBOARD_CAPABILITY.copyText("x")).resolves.toStrictEqual({ status: "FAILED" });
  });
});

describe("source", () => {
  const code = readFileSync(join(REPO_ROOT, "templates/core/client/clipboard-capability.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("uses only navigator.clipboard.writeText: no execCommand, document, storage or network", () => {
    expect(code).toMatch(/navigator\.clipboard/);
    expect(code).not.toMatch(/execCommand|\bdocument\b|\bwindow\b|localStorage|sessionStorage|indexedDB|cookie|\bfetch\b|XMLHttpRequest/);
    expect(code).not.toMatch(/readText|\bwrite\(|ClipboardItem/);
  });
});
