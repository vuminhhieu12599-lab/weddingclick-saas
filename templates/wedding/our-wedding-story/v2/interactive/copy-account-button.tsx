import { useState } from "react";

import { copyWithFeedback, type CopyFeedback } from "../../../../../lib/invitation-rendering/clipboard-copy-feedback";
import type { ClipboardCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { OUR_WEDDING_STORY_V2_COPY } from "../copy";
import styles from "../our-wedding-story-v2.module.css";

const COPY = OUR_WEDDING_STORY_V2_COPY.gift;

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
 * The two glyphs the control shows: the sheets a guest taps, and the tick it
 * becomes once the clipboard confirmed. Decorative — the button's own
 * `aria-label` carries the name and the status line carries the outcome — so
 * both are `aria-hidden`. Each renderer draws its own, at its own weight and
 * colour; the geometry is deliberately the house one so the five templates
 * read as one product.
 */
function CopyGlyph({ copied }: { readonly copied: boolean }) {
  return copied ? (
    <svg className={styles.copyGlyph} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 8.5 6.3 11.8 13 4.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg className={styles.copyGlyph} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="5.8" y="1.7" width="8.5" height="10.6" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M10.2 14.3H3.3a1.6 1.6 0 0 1-1.6-1.6V4.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Our Wedding Story v2 copy control (docs/DECISIONS.md "OWS-01"; icon-only
 * since GIFT-UI-01). Rendered by the bank card only with
 * `capabilities.clipboard` and a non-blank canonical account number; without
 * the capability the number stays visible and selectable and no control
 * exists.
 *
 * The control is a 44px tap target around a small glyph, so it sits beside
 * the account number without competing with it. Its whole accessible name is
 * "Sao chép số tài khoản <Nhà Trai|Nhà Gái>", built from the same fixed copy
 * the text button used, and `title` repeats the short form for pointer users.
 * The glyph becomes a tick only after the capability resolved `SUCCESS`,
 * which is also announced on the status line; `UNAVAILABLE` and `FAILED` show
 * their honest note under the row rather than a silent no-op (CLAUDE.md §22).
 * A press while one copy is pending is ignored. Nothing is stored.
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
        aria-label={`${COPY.copy} ${COPY.copyTarget} ${sideLabel}`}
        title={`${COPY.copy} ${COPY.copyTarget}`}
        data-copy-feedback={feedback.toLowerCase()}
      >
        <CopyGlyph copied={feedback === "SUCCESS"} />
      </button>
      <span className={note === null ? styles.srOnly : styles.copyStatus} role="status">
        {feedback === "SUCCESS" ? COPY.copied : note}
      </span>
    </>
  );
}
