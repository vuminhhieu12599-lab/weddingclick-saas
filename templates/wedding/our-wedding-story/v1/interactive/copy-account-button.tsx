import { useState } from "react";

import { copyWithFeedback, type CopyFeedback } from "../../../../../lib/invitation-rendering/clipboard-copy-feedback";
import type { ClipboardCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import styles from "../our-wedding-story-v1.module.css";

const COPY = OUR_WEDDING_STORY_V1_COPY.gift;

const NOTE_COPY: Readonly<Record<CopyFeedback, string | null>> = Object.freeze({
  IDLE: null,
  PENDING: null,
  SUCCESS: null,
  FAILED: COPY.copyFailed,
  UNAVAILABLE: COPY.copyUnavailable,
});

interface CopyAccountButtonProps {
  clipboard: ClipboardCapabilityV1;
  /** The canonical account number, copied exactly as given. */
  value: string;
  /** Fixed side label, completing the accessible name. */
  sideLabel: string;
}

/**
 * Our Wedding Story v1 copy control (docs/DECISIONS.md "OWS-01"). Rendered by
 * the bank card only with `capabilities.clipboard` and a non-blank canonical
 * account number; without the capability the number stays visible and
 * selectable and no control exists. "Sao chép" turns into "Đã sao chép" only
 * after the capability resolved `SUCCESS`; `UNAVAILABLE` and `FAILED` show
 * their honest note. A press while one copy is pending is ignored.
 */
export function CopyAccountButton({ clipboard, value, sideLabel }: CopyAccountButtonProps) {
  const [feedback, setFeedback] = useState<CopyFeedback>("IDLE");
  const note = NOTE_COPY[feedback];

  function handleCopy() {
    if (feedback === "PENDING") return;
    setFeedback("PENDING");
    void copyWithFeedback(clipboard, value).then(setFeedback);
  }

  return (
    <>
      <button
        type="button"
        className={styles.copyButton}
        onClick={handleCopy}
        aria-disabled={feedback === "PENDING" ? true : undefined}
        data-copy-feedback={feedback.toLowerCase()}
      >
        {feedback === "SUCCESS" ? COPY.copied : COPY.copy}
        <span className={styles.srOnly}>
          {" "}
          {COPY.copyTarget} {sideLabel}
        </span>
      </button>
      <span className={note === null ? styles.srOnly : styles.copyStatus} role="status">
        {feedback === "SUCCESS" ? COPY.copied : note}
      </span>
    </>
  );
}
