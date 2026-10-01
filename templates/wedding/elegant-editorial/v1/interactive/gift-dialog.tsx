import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

const COPY = ELEGANT_EDITORIAL_V1_COPY.gift;

/** One present gift side, in `operationalSides` order, already rendered by the gift section. */
export interface GiftDialogPanel {
  readonly side: CoupleSide;
  /** Fixed side label ("Nhà Trai" / "Nhà Gái"), chosen by the explicit side. */
  readonly label: string;
  readonly content: ReactNode;
}

interface GiftDialogProps {
  /** The present sides; the gift section never renders this island without at least one. */
  panels: readonly GiftDialogPanel[];
}

/**
 * RF-06D gift dialog island (docs/DECISIONS.md "RF-06-0 …" P7 "Gift", P13;
 * Design Baseline B5 item 15).
 *
 * Task029 presentation: the square moss "Gửi quà cưới" CTA opens an ivory
 * sheet (bottom sheet on mobile, centered modal at ≥ 768 px) with a ✕ close
 * control and, only when more than one side is present, square side tabs.
 * Every present side stays rendered; only the selected one is shown.
 *
 * A platform-native modal `<dialog>`: `showModal()` gives the top layer,
 * inert background, focus moving in (to the close control, the first
 * control) and Escape; a backdrop click also closes it, as the Task029 scrim
 * does. Every close path returns focus to the opener and remounts the
 * content, so copy feedback and the selected tab never carry into the next
 * opening. Open state is local and never persisted.
 */
export function GiftDialog({ panels }: GiftDialogProps) {
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

  /** Every close path (close control, Escape, backdrop) ends here through the native `close` event. */
  function handleClose() {
    setOpen(false);
    setActiveSide(null);
    setGeneration((value) => value + 1);
    openerRef.current?.focus();
  }

  /** A click whose target is the dialog box itself landed on the backdrop, outside the sheet content. */
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) setOpen(false);
  }

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        className={styles.giftOpen}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {COPY.openDialog}
      </button>
      <dialog
        ref={dialogRef}
        className={styles.giftDialog}
        aria-label={COPY.openDialog}
        onClose={handleClose}
        onClick={handleBackdropClick}
      >
        <div key={generation} className={styles.giftDialogContent}>
          <button type="button" className={styles.giftDialogClose} aria-label={COPY.closeDialog} onClick={() => setOpen(false)}>
            <span aria-hidden="true">✕</span>
          </button>
          {tabbed ? (
            <div className={styles.giftTabs}>
              {panels.map((panel) => (
                <button
                  key={panel.side}
                  type="button"
                  className={styles.giftTab}
                  aria-pressed={panel === selected}
                  aria-controls={`ee-gift-panel-${panel.side}`}
                  onClick={() => setActiveSide(panel.side)}
                >
                  {panel.label}
                </button>
              ))}
            </div>
          ) : null}
          {panels.map((panel) => (
            <div
              key={panel.side}
              id={`ee-gift-panel-${panel.side}`}
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
