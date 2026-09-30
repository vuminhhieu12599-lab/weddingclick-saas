import { useEffect, useRef, useState, type ReactNode } from "react";

import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

const COPY = ELEGANT_EDITORIAL_V1_COPY.gift;

interface GiftDialogProps {
  /** The canonical gift sides; the gift section never renders this island without at least one. */
  children: ReactNode;
}

/**
 * RF-06D gift dialog island (docs/DECISIONS.md "RF-06-0 …" P7 "Gift", P13).
 *
 * A platform-native modal `<dialog>`: `showModal()` gives the top layer,
 * inert background, focus moving in (to the close button, the first
 * control) and Escape; this island adds the explicit close button, returns
 * focus to the opener on every close path, and remounts the content on
 * close so copy feedback is never carried into the next opening. Open state
 * is local and never persisted. Browser dialog operations exist only here.
 */
export function GiftDialog({ children }: GiftDialogProps) {
  const [open, setOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /** Every close path (close button, Escape) ends here through the native `close` event. */
  function handleClose() {
    setOpen(false);
    setGeneration((value) => value + 1);
    openerRef.current?.focus();
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
        aria-labelledby="ee-gift-dialog-title"
        onClose={handleClose}
      >
        <div className={styles.giftDialogHeader}>
          <h2 id="ee-gift-dialog-title" className={styles.giftDialogTitle}>
            {COPY.dialogTitle}
          </h2>
          <button type="button" className={styles.giftDialogClose} onClick={() => setOpen(false)}>
            {COPY.closeDialog}
          </button>
        </div>
        <div key={generation} className={styles.giftDialogContent}>
          {children}
        </div>
      </dialog>
    </>
  );
}
