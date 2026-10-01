import { useState } from "react";

import type { ClipboardCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

const COPY = ELEGANT_EDITORIAL_V1_COPY.gift;

export type CopyFeedback = "IDLE" | "PENDING" | "SUCCESS" | "FAILED" | "UNAVAILABLE";

export type CopySettledFeedback = Exclude<CopyFeedback, "IDLE" | "PENDING">;

/**
 * One explicit copy through the frozen RF-05 clipboard capability (K21–K22,
 * P34). `SUCCESS` only when the capability resolved `SUCCESS`; `UNAVAILABLE`
 * and `FAILED` pass through; anything else, including an unexpected
 * rejection, is `FAILED`. Never rejects, so the click handler cannot leave
 * an unhandled rejection, and a rejection is never shown as copied.
 */
export async function copyWithFeedback(clipboard: ClipboardCapabilityV1, text: string): Promise<CopySettledFeedback> {
  try {
    const result = await clipboard.copyText(text);
    if (result.status === "SUCCESS") return "SUCCESS";
    if (result.status === "UNAVAILABLE") return "UNAVAILABLE";
    return "FAILED";
  } catch {
    return "FAILED";
  }
}

const FEEDBACK_COPY: Readonly<Record<CopyFeedback, string | null>> = Object.freeze({
  IDLE: null,
  PENDING: null,
  SUCCESS: COPY.copySucceeded,
  FAILED: COPY.copyFailed,
  UNAVAILABLE: COPY.copyUnavailable,
});

export function copyFeedbackText(feedback: CopyFeedback): string | null {
  return FEEDBACK_COPY[feedback];
}

export interface CopyAccountButtonProps {
  clipboard: ClipboardCapabilityV1;
  /** The canonical account number, copied exactly as given. */
  value: string;
  /** Fixed side label, completing the accessible name. */
  sideLabel: string;
}

/**
 * RF-06D copy control island. The gift section renders it only with a
 * clipboard capability and a non-blank canonical account number. Feedback
 * is local presentation state: the Task029 square control reads "Sao chép"
 * and turns to "Đã sao chép" only after a resolved `SUCCESS` (also announced
 * through the status region). `FAILED` / `UNAVAILABLE` show their honest
 * note under the row. Nothing is stored. A second press while one copy is
 * pending is ignored.
 */
export function CopyAccountButton({ clipboard, value, sideLabel }: CopyAccountButtonProps) {
  const [feedback, setFeedback] = useState<CopyFeedback>("IDLE");
  const text = copyFeedbackText(feedback);

  function handleCopy() {
    if (feedback === "PENDING") return;
    setFeedback("PENDING");
    void copyWithFeedback(clipboard, value).then(setFeedback);
  }

  return (
    <span className={styles.copyControl}>
      <button
        type="button"
        className={styles.copyButton}
        onClick={handleCopy}
        aria-disabled={feedback === "PENDING" ? true : undefined}
        data-copy-feedback={feedback.toLowerCase()}
      >
        {feedback === "SUCCESS" ? COPY.copySucceeded : COPY.copyAccountNumber}
        <span className={styles.srOnly}>
          {" "}
          {COPY.copyAccountNumberTarget} {sideLabel}
        </span>
      </button>
      <span className={text === null || feedback === "SUCCESS" ? styles.srOnly : styles.copyFeedback} role="status">
        {text}
      </span>
    </span>
  );
}
