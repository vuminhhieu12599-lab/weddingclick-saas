import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import styles from "../our-wedding-story-v1.module.css";

const COPY = OUR_WEDDING_STORY_V1_COPY.gift;

/**
 * Our Wedding Story v1 wedding-gift island (docs/DECISIONS.md "OWS-01").
 *
 * The page shows only the "Gửi quà mừng cưới" button; the bank cards open in
 * the Visual Freeze v1 bottom sheet: "Wedding Gift" kicker and ✕, "Hộp mừng
 * cưới", the fixed short note, then one card per side, stacked. A native
 * modal `<dialog>` (top layer, inert background, Escape); ✕ and the backdrop
 * close too. Every close returns focus to the button and remounts the
 * content, so copy feedback never carries over. Nothing is persisted.
 */
export function GiftSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Visual Freeze v1 focuses ✕, never the scrollable sheet itself.
      closeRef.current?.focus({ preventScroll: true });
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function finishClose() {
    setOpen(false);
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
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <path
            d="M2.5 6.5h11v2h-11zM3.5 8.5h9v5.5h-9zM8 6.5V14M8 6.3C6.6 3.6 4.4 3.7 4.6 5.1c.2 1.1 2.1 1.3 3.4 1.2zm0 0c1.4-2.7 3.6-2.6 3.4-1.2-.2 1.1-2.1 1.3-3.4 1.2z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
        {COPY.open}
      </button>
      <dialog
        ref={dialogRef}
        className={styles.sheetLayer}
        aria-labelledby="ows-gift-title"
        onClose={handleNativeClose}
        onClick={handleBackdropClick}
      >
        <div key={generation} className={styles.sheet}>
          <div className={styles.sheetHead}>
            <span className={styles.sheetKicker}>{COPY.sheetKicker}</span>
            <button ref={closeRef} type="button" className={styles.sheetClose} aria-label={COPY.close} onClick={requestClose}>
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <h2 id="ows-gift-title" className={styles.sheetTitle}>
            {COPY.sheetTitle}
          </h2>
          <p className={styles.sheetNote}>{COPY.sheetNote}</p>
          <div className={styles.sheetSides}>{children}</div>
        </div>
      </dialog>
    </>
  );
}
