import type {
  ClipboardCapabilityV1,
  ClipboardCopyResultV1,
} from "../../../lib/invitation-rendering/renderer-capabilities";

/**
 * Invitation Rendering Foundation RF-06C — the clipboard browser adapter
 * (docs/DECISIONS.md "RF-06-0 …" P34; RF-05 K21–K22, K35).
 *
 * The only RF-06 module that touches `navigator`. It implements the frozen
 * `ClipboardCapabilityV1` over the modern `navigator.clipboard.writeText`
 * only; there is no `document.execCommand` fallback (K22).
 *
 * - `SUCCESS` only after the write Promise has actually resolved.
 * - `UNAVAILABLE` when the Clipboard API is absent or unusable at call time.
 * - `FAILED` when the write Promise rejects (P34).
 * - An unexpected programming fault (non-string input, a synchronous throw,
 *   or a non-Promise return from the writer) rejects; a rejection is never
 *   success (K21).
 *
 * Nothing is stored, persisted or sent anywhere: the copied text lives only
 * in the single `writeText` call.
 */

/** The minimum Clipboard API surface this adapter uses. */
export interface ClipboardWriterV1 {
  writeText(text: string): Promise<void>;
}

const CLIPBOARD_RESULTS = Object.freeze({
  SUCCESS: Object.freeze({ status: "SUCCESS" }),
  UNAVAILABLE: Object.freeze({ status: "UNAVAILABLE" }),
  FAILED: Object.freeze({ status: "FAILED" }),
} as const satisfies Record<ClipboardCopyResultV1["status"], ClipboardCopyResultV1>);

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Builds the capability over an injected writer lookup. The lookup runs on
 * every `copyText` call, so a Clipboard API that disappears is reported as
 * `UNAVAILABLE`, never as success.
 */
export function createClipboardCapability(getWriter: () => ClipboardWriterV1 | undefined): ClipboardCapabilityV1 {
  return Object.freeze({
    async copyText(text: string): Promise<ClipboardCopyResultV1> {
      if (typeof text !== "string") {
        throw new TypeError("Clipboard copyText requires a string");
      }
      const writer = getWriter();
      if (writer === undefined) return CLIPBOARD_RESULTS.UNAVAILABLE;

      // Called outside the try: a synchronous throw is an unexpected fault and rejects.
      const pending: unknown = writer.writeText(text);
      if (!isThenable(pending)) {
        throw new TypeError("Clipboard writeText did not return a Promise");
      }
      try {
        await pending;
      } catch {
        // P34: a rejected write is the expected FAILED outcome, never success.
        return CLIPBOARD_RESULTS.FAILED;
      }
      return CLIPBOARD_RESULTS.SUCCESS;
    },
  });
}

/**
 * The real browser lookup: the `navigator.clipboard` object itself (so
 * `writeText` is invoked as its method), or `undefined` when there is no
 * `navigator` (server render), no Clipboard API (for example an insecure
 * context) or no `writeText`.
 */
export function readBrowserClipboard(): ClipboardWriterV1 | undefined {
  if (typeof navigator === "undefined") return undefined;
  // Typed as always present by lib.dom, but absent in insecure contexts.
  const clipboard: Clipboard | undefined = navigator.clipboard;
  if (clipboard === undefined || clipboard === null || typeof clipboard.writeText !== "function") return undefined;
  return clipboard;
}

/** Presence gate: the host exposes the capability only when a usable Clipboard API exists. */
export function isBrowserClipboardAvailable(): boolean {
  return readBrowserClipboard() !== undefined;
}

/** The production capability. Creating it touches no browser global. */
export const BROWSER_CLIPBOARD_CAPABILITY: ClipboardCapabilityV1 = createClipboardCapability(readBrowserClipboard);
