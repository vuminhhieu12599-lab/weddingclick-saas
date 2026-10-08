import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import { LotusMark } from "../sections/decor";
import styles from "../vietnamese-heritage-v1.module.css";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.gift;

/** One side with honest gift content, in `operationalSides` order. */
export interface GiftDialogPanel {
  readonly side: CoupleSide;
  /** Fixed side label ("Nhà Trai" / "Nhà Gái"), chosen by the explicit side. */
  readonly label: string;
  readonly content: ReactNode;
}

/**
 * Vietnamese Heritage v1 wedding-gift island (docs/DECISIONS.md "VH-02B-E1").
 *
 * The page shows only the "Gửi Quà Cưới" CTA (Task 029: note + button); the
 * details open in an ivory sheet: a bottom sheet on phones, a centred modal
 * on wider screens. The sheet carries the lotus, the "Gửi Quà Cưới" title
 * and, only with two sides, the Nhà Trai / Nhà Gái side controls (explicit
 * side, never position); a single side shows its label without controls.
 *
 * A native modal `<dialog>`: `showModal()` gives the top layer, an inert
 * background, focus inside (the close control first) and Escape; a click on
 * the backdrop closes it too. Every close path (✕, backdrop, Escape) returns
 * focus to the CTA and remounts the content, so copy feedback and the chosen
 * side never carry into the next opening. Open state is local; no route change, nothing
 * persisted.
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

  /** Resets the sheet (selected side, copy feedback) and returns focus to the CTA. */
  function finishClose() {
    setOpen(false);
    setActiveSide(null);
    setGeneration((value) => value + 1);
    openerRef.current?.focus();
  }

  /**
   * The close control and the backdrop close the dialog and finish at once,
   * never waiting for the native `close` event, whose delivery timing is
   * the browser's.
   */
  function requestClose() {
    const dialog = dialogRef.current;
    if (dialog !== null && dialog.open) dialog.close();
    finishClose();
  }

  /**
   * Native closes (Escape → `cancel` → `close`) finish here. A late event
   * that arrives after the guest already reopened the sheet is ignored.
   */
  function handleNativeClose() {
    if (dialogRef.current?.open === true) return;
    if (open) finishClose();
  }

  /** A click whose target is the dialog box itself landed on the backdrop, outside the sheet. */
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  return (
    <>
      <button ref={openerRef} type="button" className={styles.giftOpen} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {COPY.openDialog}
      </button>
      <dialog
        ref={dialogRef}
        className={styles.giftDialog}
        aria-labelledby="vh-gift-dialog-title"
        onClose={handleNativeClose}
        onClick={handleBackdropClick}
      >
        <div key={generation} className={styles.giftSheet}>
          <button type="button" className={styles.giftClose} aria-label={COPY.closeDialog} onClick={requestClose}>
            <span aria-hidden="true">✕</span>
          </button>
          <LotusMark className={styles.giftSheetLotus} />
          <h2 id="vh-gift-dialog-title" className={styles.giftTitle}>
            {COPY.heading}
          </h2>
          {tabbed ? (
            <div className={styles.giftTabs} role="group" aria-label={COPY.tabsLabel}>
              {panels.map((panel) => (
                <button
                  key={panel.side}
                  type="button"
                  className={styles.giftTab}
                  aria-pressed={panel === selected}
                  aria-controls={`vh-gift-panel-${panel.side}`}
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
            <div
              key={panel.side}
              id={`vh-gift-panel-${panel.side}`}
              className={styles.giftPanel}
              data-side={panel.side}
              hidden={panel !== selected}
            >
              {panel.content}
            </div>
          ))}
        </div>
      </dialog>
    </>
  );
}
