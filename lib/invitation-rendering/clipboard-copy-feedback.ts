import type { ClipboardCapabilityV1 } from "./renderer-capabilities";

/**
 * Shared renderer copy-feedback model over the frozen clipboard capability
 * (docs/DECISIONS.md RF-05 K21–K22, "RF-06-0 …" P34, "VH-02B-E1").
 *
 * Pure: never touches `navigator`, the DOM or storage; the capability owns
 * the browser API. Elegant Editorial v1 keeps its own byte-identical copy in
 * `interactive/copy-account-button.tsx` (recorded technical debt).
 */

export type CopyFeedback = "IDLE" | "PENDING" | "SUCCESS" | "FAILED" | "UNAVAILABLE";

export type CopySettledFeedback = Exclude<CopyFeedback, "IDLE" | "PENDING">;

/**
 * One explicit copy. `SUCCESS` only when the capability resolved `SUCCESS`;
 * `UNAVAILABLE` and `FAILED` pass through; anything else, including an
 * unexpected rejection, is `FAILED`. Never rejects, so a click handler cannot
 * leave an unhandled rejection, and Promise completion is never success.
 */
export async function copyWithFeedback(clipboard: ClipboardCapabilityV1, text: string): Promise<CopySettledFeedback> {
  try {
    const result: unknown = await clipboard.copyText(text);
    const status: unknown =
      typeof result === "object" && result !== null ? (result as { status?: unknown }).status : undefined;
    if (status === "SUCCESS") return "SUCCESS";
    if (status === "UNAVAILABLE") return "UNAVAILABLE";
    return "FAILED";
  } catch {
    return "FAILED";
  }
}
