import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";

const COPY = ROMANTIC_MINIMAL_V1_COPY.gift;

/** One side with honest gift content, in `operationalSides` order. */
export interface GiftDialogPanel {
  readonly side: CoupleSide;
  /** Fixed side label ("Nhà Trai" / "Nhà Gái"), chosen by the explicit side. */
  readonly label: string;
  readonly content: ReactNode;
}

/**
 * Romantic Minimal v1 wedding-gift island (docs/DECISIONS.md "RM-02").
 *
 * The page shows only the Task 029 "Gửi mừng cưới" CTA; the details open in
 * the warm ivory panel over a blush-tinted backdrop: ornament, "Gửi Mừng
 * Cưới", Nhà Trai / Nhà Gái tabs only with two sides (explicit side, never
 * position), otherwise the single side label. A native modal `<dialog>`
 * (top layer, inert background, Escape); ✕ and the backdrop close too. Every
 * close returns focus to the CTA and remounts the content, so copy feedback
 * and the chosen side never carry over. Nothing is persisted.
 */
export function GiftDialog({ panels }: { panels: readonly GiftDialogPanel[] }) {
  const [open, setOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [activeSide, setActiveSide] = useState<CoupleSide | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const selected = panels.find((panel) => panel.side === activeSide) ?? panels[0];
  const tabbed = panels.length > 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function finishClose() {
    setOpen(false);
    setActiveSide(null);
    setGeneration((value) => value + 1);
    openerRef.current?.focus({ preventScroll: true });
  }

  function requestClose() {
    const dialog = dialogRef.current;
    if (dialog !== null && dialog.open) dialog.close();
    finishClose();
  }

  /** Escape (`cancel` → `close`) finishes here; a late event after a reopen is ignored. */
  function handleNativeClose() {
    if (dialogRef.current?.open === true) return;
    if (open) finishClose();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  return (
    <>
      <button ref={openerRef} type="button" className={styles.giftButton} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {COPY.openDialog}
      </button>
      <dialog
        ref={dialogRef}
        className={styles.giftDialog}
        aria-labelledby="rm-gift-dialog-title"
        onClose={handleNativeClose}
        onClick={handleBackdropClick}
      >
        <div key={generation} className={styles.giftPanel}>
          <button type="button" className={styles.giftClose} aria-label={COPY.closeDialog} onClick={requestClose}>
            <span aria-hidden="true">✕</span>
          </button>
          <span className={styles.ornament} aria-hidden="true">
            <span />
            <span className={styles.ornamentDot} />
            <span />
          </span>
          <h2 id="rm-gift-dialog-title" className={styles.giftTitle}>
            {COPY.heading}
          </h2>
          {tabbed ? (
            <div className={styles.giftTabs} role="group" aria-label={COPY.tabsLabel}>
              {panels.map((panel) => (
                <button
                  key={panel.side}
                  type="button"
                  className={panel === selected ? `${styles.giftTab} ${styles.giftTabActive}` : styles.giftTab}
                  aria-pressed={panel === selected}
                  aria-controls={`rm-gift-panel-${panel.side}`}
                  onClick={() => setActiveSide(panel.side)}
                >
                  {panel.label}
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.giftSideLabel}>{selected?.label}</p>
          )}
          {panels.map((panel) => (
            <div key={panel.side} id={`rm-gift-panel-${panel.side}`} data-side={panel.side} hidden={panel !== selected}>
              {panel.content}
            </div>
          ))}
        </div>
      </dialog>
    </>
  );
}
