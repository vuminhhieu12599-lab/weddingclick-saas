import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import type { MediaResolution, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V2_COPY } from "../copy";
import { MediaImage } from "../sections/media-image";
import styles from "../vietnamese-heritage-v2.module.css";

const COPY = VIETNAMESE_HERITAGE_V2_COPY.ceremonial;

/** One portrait: its 1-based `portraitCluster` slot position and its resolved media. */
export interface PortraitEntry {
  readonly position: number;
  readonly media: ResolvedMedia;
}

/**
 * The `RESOLVED` items of the `portraitCluster` slot in slot order, each
 * keeping its original position. `UNAVAILABLE` items are skipped, never
 * substituted; the visual state follows the resolved count alone.
 */
export function resolvedPortraits(cluster: readonly MediaResolution[]): PortraitEntry[] {
  return cluster.flatMap((media, index): PortraitEntry[] => (media.status === "RESOLVED" ? [{ position: index + 1, media }] : []));
}

/** Navigation wraps, as the album viewer does: previous from the first is the last, next from the last is the first. */
export function stepPortrait(position: number, step: 1 | -1, count: number): number {
  return (position + step + count) % count;
}

/** Slot-position alt text ("Ảnh cưới, khung 2"), never renumbered by viewer position. */
export function portraitAlt(position: number): string {
  return `${COPY.portraitAlt} ${String(position)}`;
}

/**
 * Vietnamese Heritage v2 portrait cluster with its viewer (VH-V2-UI-03).
 *
 * Renders the approved composition exactly as the static cluster did — same
 * row, frames, slot positions, dominant centre photo and reveal targets — with
 * each photograph inside a real `<button type="button">` ("Xem ảnh {n}").
 * Only `RESOLVED` items are in the row and in the sequence, so an
 * `UNAVAILABLE` slot is never opened and never substituted.
 *
 * The viewer follows the proven album pattern (`gallery-lightbox.tsx`) in its
 * own classes, so the album viewer is untouched: a native modal `<dialog>`
 * with the oxblood scrim, the whole photograph (`object-fit: contain`), ✕,
 * the "2 / 3" position and — only with more than one portrait — previous /
 * next. ArrowLeft / ArrowRight navigate, wrapping; Escape, ✕ and the backdrop
 * close; every close returns focus to the portrait that opened it. Nothing is
 * fetched, stored or re-ordered here.
 */
export function PortraitLightbox({ cluster }: { cluster: readonly MediaResolution[] }) {
  const sequence = resolvedPortraits(cluster);
  const [position, setPosition] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const open = position !== null;
  const current = position === null ? undefined : sequence[position];
  const navigable = sequence.length > 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (sequence.length === 0) return null;

  function openAt(slotPosition: number, opener: HTMLButtonElement) {
    const at = sequence.findIndex((photo) => photo.position === slotPosition);
    if (at === -1) return;
    openerRef.current = opener;
    setPosition(at);
  }

  function finishClose() {
    setPosition(null);
    openerRef.current?.focus({ preventScroll: true });
  }

  /** ✕ and the backdrop close at once, never waiting for the native `close` event. */
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

  function step(direction: 1 | -1) {
    setPosition((value) => (value === null ? value : stepPortrait(value, direction, sequence.length)));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (!navigable) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  return (
    <>
      <div className={styles.portraitRow} data-count={sequence.length}>
        {sequence.map(({ position: slotPosition, media }, index) => (
          <figure
            key={slotPosition}
            className={styles.portraitFrame}
            data-position={slotPosition}
            data-emphasis={sequence.length === 3 && index === 1 ? "center" : undefined}
          >
            <button
              type="button"
              className={styles.portraitOpen}
              aria-haspopup="dialog"
              aria-label={`${COPY.portraitOpen} ${String(slotPosition)}`}
              onClick={(event) => openAt(slotPosition, event.currentTarget)}
            >
              <MediaImage media={media} alt={portraitAlt(slotPosition)} className={styles.portraitPhoto} />
            </button>
          </figure>
        ))}
      </div>
      <dialog
        ref={dialogRef}
        className={styles.portraitViewer}
        aria-label={COPY.portraitViewerLabel}
        onClose={handleNativeClose}
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
      >
        {current === undefined ? null : (
          <>
            <figure key={current.position} className={styles.portraitViewerStage} data-position={current.position}>
              <MediaImage media={current.media} alt={portraitAlt(current.position)} className={styles.portraitViewerImage} eager />
            </figure>
            <button type="button" className={styles.portraitViewerClose} aria-label={COPY.portraitClose} onClick={requestClose}>
              <span aria-hidden="true">✕</span>
            </button>
            {navigable ? (
              <>
                <button
                  type="button"
                  className={`${styles.portraitViewerNav} ${styles.portraitViewerPrev}`}
                  aria-label={COPY.portraitPrevious}
                  onClick={() => step(-1)}
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <button
                  type="button"
                  className={`${styles.portraitViewerNav} ${styles.portraitViewerNext}`}
                  aria-label={COPY.portraitNext}
                  onClick={() => step(1)}
                >
                  <span aria-hidden="true">›</span>
                </button>
              </>
            ) : null}
            <p className={styles.portraitViewerCount} aria-live="polite">
              {String((position ?? 0) + 1)} / {String(sequence.length)}
            </p>
          </>
        )}
      </dialog>
    </>
  );
}
