import { useState } from "react";

import type { ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { downloadQrWithFeedback, type DownloadFeedback } from "../../../../../lib/invitation-rendering/media-download-feedback";
import type { MediaDownloadCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";

const COPY = ROMANTIC_MINIMAL_V1_COPY.gift;

const NOTE_COPY: Readonly<Record<DownloadFeedback, string | null>> = Object.freeze({
  IDLE: null,
  PENDING: null,
  SUCCESS: null,
  FAILED: COPY.qrDownloadFailed,
  UNAVAILABLE: COPY.qrDownloadUnavailable,
});

interface QrDownloadButtonProps {
  /** `capabilities.download`; the gift section draws nothing without it. */
  readonly download: MediaDownloadCapabilityV1;
  /** THIS side's own already-RESOLVED QR, never the other family's. */
  readonly qr: ResolvedMedia;
  readonly side: CoupleSide;
  /** Fixed side label, completing the accessible name. */
  readonly sideLabel: string;
}

/**
 * The two glyphs the control shows: the tray a guest taps to save the QR, and
 * the tick it becomes once the file really reached the device. Decorative —
 * the button's own `aria-label` carries the name and the status line carries
 * the outcome — so both are `aria-hidden`. Same house geometry as the copy
 * control, drawn at this renderer's own weight and colour.
 */
function DownloadGlyph({ saved }: { readonly saved: boolean }) {
  return saved ? (
    <svg className={styles.giftQrDownloadGlyph} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 8.5 6.3 11.8 13 4.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg className={styles.giftQrDownloadGlyph} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 1.9v8.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.9 7.4 8 10.5l3.1-3.1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.4 11.4v1.3a1.4 1.4 0 0 0 1.4 1.4h8.4a1.4 1.4 0 0 0 1.4-1.4v-1.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Romantic Minimal v1 — save THIS family's wedding-gift QR (WC-GIFT-QR-01).
 *
 * Rendered by the gift section only with `capabilities.download` and a
 * `RESOLVED` QR for this very side, so a missing or UNAVAILABLE QR draws no
 * control at all and the two families can never save each other's code. The
 * capability saves the bytes the invitation already shows — nothing here
 * redraws, rasterizes or re-encodes anything, and the QR on screen stays
 * visible and scannable whatever the outcome.
 *
 * A 44px tap target around a small glyph, sitting under the plate rather than
 * over it, so it never covers the scan area. The accessible name is the fixed
 * "Tải mã QR <Nhà Trai|Nhà Gái>", and `title` repeats the short form for
 * pointer users. The glyph becomes a tick only once the capability resolved
 * `SUCCESS`; `UNAVAILABLE` and `FAILED` show their honest note instead of a
 * silent no-op (CLAUDE.md §22). A press while one save is pending is ignored.
 * Nothing is stored and no file name carries a name, a number or a URL.
 */
export function QrDownloadButton({ download, qr, side, sideLabel }: QrDownloadButtonProps) {
  const [feedback, setFeedback] = useState<DownloadFeedback>("IDLE");
  const note = NOTE_COPY[feedback];

  function handleDownload() {
    if (feedback === "PENDING") return;
    setFeedback("PENDING");
    void downloadQrWithFeedback(download, qr, side).then(setFeedback);
  }

  return (
    <>
      <button
        type="button"
        className={styles.giftQrDownload}
        onClick={handleDownload}
        aria-disabled={feedback === "PENDING" ? true : undefined}
        aria-label={`${COPY.qrDownload} ${sideLabel}`}
        title={COPY.qrDownload}
        data-download-feedback={feedback.toLowerCase()}
      >
        <DownloadGlyph saved={feedback === "SUCCESS"} />
      </button>
      <span className={note === null ? styles.srOnly : styles.giftQrDownloadNote} role="status">
        {feedback === "SUCCESS" ? COPY.qrDownloaded : note}
      </span>
    </>
  );
}
