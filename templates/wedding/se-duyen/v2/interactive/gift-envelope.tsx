import { useId, useState } from "react";

import { copyWithFeedback, type CopyFeedback } from "../../../../../lib/invitation-rendering/clipboard-copy-feedback";
import type { ClipboardCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { SE_DUYEN_V2_COPY } from "../copy";
import styles from "../se-duyen-v2.module.css";
import { accountNumberOf, type GiftPanel, type GiftRow } from "../sections/gift-panels";

const COPY = SE_DUYEN_V2_COPY.gift;

const ROW_LABEL: Readonly<Record<GiftRow["key"], string>> = Object.freeze({
  bankName: COPY.bankLabel,
  accountName: COPY.holderLabel,
  accountNumber: COPY.accountLabel,
});

/**
 * The approved slip shows the copy outcome in the account row's own LABEL —
 * same type, same place — so a confirmation costs no layout shift and no
 * second line of UI. `null` keeps the plain label.
 */
export function copyLabel(feedback: CopyFeedback): string | null {
  switch (feedback) {
    case "SUCCESS":
      return COPY.copyDone;
    case "FAILED":
      return COPY.copyFailed;
    case "UNAVAILABLE":
      return COPY.copyUnavailable;
    case "IDLE":
    case "PENDING":
      return null;
  }
}

/**
 * The account row, with its copy control when the clipboard capability
 * exists. Without the capability the number stays visible and selectable and
 * no control is drawn — never a button that cannot work.
 *
 * "Đã sao chép" appears only once the capability has resolved `SUCCESS`;
 * `UNAVAILABLE` and `FAILED` say so plainly rather than leaving a guest to
 * paste an empty clipboard into a bank transfer (CLAUDE.md §22). A press
 * while a copy is pending is ignored, and nothing retries on its own.
 */
function AccountRow({ value, sideLabel, clipboard }: { readonly value: string; readonly sideLabel: string; readonly clipboard: ClipboardCapabilityV1 | undefined }) {
  const [feedback, setFeedback] = useState<CopyFeedback>("IDLE");
  const status = copyLabel(feedback);

  function handleCopy() {
    if (clipboard === undefined || feedback === "PENDING") return;
    setFeedback("PENDING");
    void copyWithFeedback(clipboard, value).then(setFeedback);
  }

  return (
    <div className={styles.giftRow}>
      <dt className={`${styles.giftRowLabel} ${status === null ? "" : styles.giftRowLabelStatus}`} aria-live="polite">
        {status ?? ROW_LABEL.accountNumber}
      </dt>
      <dd className={`${styles.giftRowValue} ${styles.giftAccountNumber} ${styles.giftAccountRow}`}>
        <span>{value}</span>
        {clipboard === undefined ? null : (
          <button
            type="button"
            className={styles.giftCopy}
            onClick={handleCopy}
            aria-disabled={feedback === "PENDING" ? true : undefined}
            aria-label={`${COPY.copyLabel} ${sideLabel}`}
            // GIFT-UI-01: the short form as a pointer tooltip, like the other
            // templates' icon-only controls; the accessible name is unchanged.
            title={COPY.copyLabel}
            data-copy-feedback={feedback.toLowerCase()}
          >
            {feedback === "SUCCESS" ? (
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M3 8.5 6.3 11.8 13 4.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
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
            )}
          </button>
        )}
      </dd>
    </div>
  );
}

interface GiftEnvelopeProps {
  /** From `giftPanels`: only operational sides with honest content, never empty. */
  readonly panels: readonly GiftPanel[];
  /** `capabilities.clipboard`, passed through by the root only. */
  readonly clipboard: ClipboardCapabilityV1 | undefined;
}

/**
 * Se Duyên v1 wedding-gift envelope — the approved "Mừng Cưới"
 * (SD-V1-02C2).
 *
 * The whole envelope is the control, as the wedding box is on the cover:
 * one tap lays the flap back and the ivory slip rises out from behind it.
 * The slip is mounted in BOTH states rather than added and removed, which is
 * what lets it slide back down into the envelope on close instead of
 * vanishing under a flap that is still falling; closed, it is `display: none`
 * — out of the accessibility tree and the tab order — and `inert` keeps it
 * unreachable through the short exit transition as well.
 *
 * WHICH FAMILY'S DETAILS ARE SHOWN IS NOT DECIDED HERE. `panels` comes from
 * the pure model over `operationalSides`, so COMMON offers both houses
 * behind a tab each and GROOM / BRIDE offer that one side with no tabs at
 * all (CLAUDE.md §5/§6). Every value is the Project's own canonical bank
 * field, and the QR is that side's own RESOLVED media or nothing: no demo
 * account, no drawn QR artwork, nothing generated from the numbers, no
 * network call and nothing persisted.
 *
 * The copy feedback is keyed to the panel it belongs to, so switching family
 * cannot carry a stale "copied" mark onto a different number.
 */
export function GiftEnvelope({ panels, clipboard }: GiftEnvelopeProps) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [sideIndex, setSideIndex] = useState(0);
  const panel = panels[Math.min(sideIndex, panels.length - 1)] as GiftPanel;
  const sideLabel = SE_DUYEN_V2_COPY.sideLabel[panel.side];
  const multiSide = panels.length > 1;
  const accountNumber = accountNumberOf(panel);

  return (
    <div className={styles.giftStage} data-open={open ? "true" : undefined}>
      <button
        type="button"
        className={styles.giftEnvelope}
        aria-expanded={open}
        aria-controls={`${fieldId}-panel`}
        aria-label={open ? COPY.closeHint : COPY.openHint}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span className={styles.giftPaper} aria-hidden="true">
          {/* The darker inside, on the same triangle as the flap and hidden
              under it while closed, so the opened mouth has real depth. */}
          <span className={styles.giftMouth} />
          {/* The crease of the bottom flap, folded up the way a pointed-flap
              envelope is made; its peak meets the top flap under the seal. */}
          <span className={styles.giftFold} />
          <span className={styles.giftFlap} />
          <span className={styles.giftSeal} />
        </span>
      </button>

      <div id={`${fieldId}-panel`} className={styles.giftSlip} inert={!open}>
        {multiSide ? (
          <div className={styles.giftTabs} role="tablist" aria-label={COPY.sideLegend}>
            {panels.map((entry, index) => (
              <button
                key={entry.side}
                type="button"
                role="tab"
                id={`${fieldId}-tab-${entry.side}`}
                aria-selected={entry.side === panel.side}
                aria-controls={`${fieldId}-details`}
                className={`${styles.giftTab} ${entry.side === panel.side ? styles.giftTabActive : ""}`}
                onClick={() => {
                  setSideIndex(index);
                }}
              >
                {SE_DUYEN_V2_COPY.sideLabel[entry.side]}
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.giftSideLabel}>{sideLabel}</p>
        )}

        {panel.qr === undefined ? null : (
          <figure className={styles.giftQr}>
            {/* eslint-disable-next-line @next/next/no-img-element -- opaque runtime MediaResolver URL, not a build-known asset */}
            <img
              className={styles.giftQrImage}
              src={panel.qr.url}
              alt={`${COPY.qrAlt} ${sideLabel}`}
              width={panel.qr.width ?? undefined}
              height={panel.qr.height ?? undefined}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </figure>
        )}

        <dl
          className={styles.giftRows}
          id={`${fieldId}-details`}
          role={multiSide ? "tabpanel" : undefined}
          aria-labelledby={multiSide ? `${fieldId}-tab-${panel.side}` : undefined}
        >
          {panel.rows
            .filter((row) => row.key !== "accountNumber")
            .map((row) => (
              <div key={row.key} className={styles.giftRow} data-row={row.key}>
                <dt className={styles.giftRowLabel}>{ROW_LABEL[row.key]}</dt>
                <dd className={styles.giftRowValue}>{row.value}</dd>
              </div>
            ))}
          {accountNumber === undefined ? null : (
            <AccountRow key={panel.side} value={accountNumber} sideLabel={sideLabel} clipboard={clipboard} />
          )}
        </dl>
      </div>

      {/* WC-UI-P0-01: closed, this is still only a caption — the envelope
          itself carries the accessible name, so the text stays an
          aria-hidden paragraph. Open, "Gấp phong bì lại" is what a guest
          reaches for to put the slip away, so it becomes a real control:
          same type, colour, position and box, reachable by keyboard and by
          touch, and it folds the envelope through the same `open` state, so
          the closing animation is the envelope button's own. */}
      {open ? (
        <button
          type="button"
          className={`${styles.giftHint} ${styles.giftHintClose}`}
          onClick={() => {
            setOpen(false);
          }}
        >
          {COPY.closeHint}
        </button>
      ) : (
        <p className={styles.giftHint} aria-hidden="true">
          {COPY.openHint}
        </p>
      )}
    </div>
  );
}
