import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import type { MediaResolution, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { MediaImage } from "../sections/media-image";

const COPY = ELEGANT_EDITORIAL_V1_COPY.gallery;

/** One viewer entry: a `RESOLVED` album item and its canonical album index. */
export interface GalleryPhoto {
  readonly index: number;
  readonly media: ResolvedMedia;
}

/**
 * The viewer sequence: only `RESOLVED` album items, in canonical order. An
 * `UNAVAILABLE` item keeps its tile in the grid and is simply not in the
 * sequence — never substituted, never opened empty.
 */
export function viewerSequence(gallery: readonly MediaResolution[]): GalleryPhoto[] {
  return gallery.flatMap((media, index): GalleryPhoto[] => (media.status === "RESOLVED" ? [{ index, media }] : []));
}

/** Navigation wraps: previous from the first is the last, next from the last is the first. */
export function stepViewer(position: number, step: 1 | -1, count: number): number {
  return (position + step + count) % count;
}

/** Canonical-position alt text, never renumbered by viewer position. */
export function photoAlt(index: number, coupleText: string): string {
  return `${COPY.imageAlt} ${String(index + 1)} – ${coupleText}`;
}

/**
 * Elegant Editorial v1 album grid with its lightbox (EE-V1-UI-01).
 *
 * Renders the two-column grid exactly as the static album did — same tiles,
 * classes, canonical order, 4:5 crop and `UNAVAILABLE` copy — with each
 * `RESOLVED` photograph inside a real `<button type="button">`
 * ("Xem ảnh cưới {n}"). An `UNAVAILABLE` tile stays non-interactive.
 *
 * The viewer follows the proven Vietnamese Heritage pattern in Elegant
 * Editorial's own classes: a native modal `<dialog>` with a deep scrim, the
 * whole photograph (`object-fit: contain`, bounded by the viewport), ✕, the
 * "2 / 6" position and — only with more than one photo — previous / next.
 * ArrowLeft / ArrowRight navigate, wrapping; Escape, ✕ and the backdrop
 * close; every close returns focus to the tile that opened it. No caption,
 * download, share or zoom; nothing is fetched or stored.
 */
export function GalleryLightbox({ gallery, coupleText }: { gallery: readonly MediaResolution[]; coupleText: string }) {
  const sequence = viewerSequence(gallery);
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

  function openAt(index: number, opener: HTMLButtonElement) {
    const at = sequence.findIndex((photo) => photo.index === index);
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
    setPosition((value) => (value === null ? value : stepViewer(value, direction, sequence.length)));
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
      <ul className={styles.gallery}>
        {gallery.map((item, index) => (
          <li
            key={`${index}-${item.mediaId}`}
            className={styles.galleryItem}
            data-media-state={item.status === "RESOLVED" ? "resolved" : "unavailable"}
          >
            {item.status === "RESOLVED" ? (
              <button
                type="button"
                className={styles.galleryOpen}
                aria-haspopup="dialog"
                aria-label={`${COPY.open} ${String(index + 1)}`}
                onClick={(event) => openAt(index, event.currentTarget)}
              >
                <MediaImage media={item} alt={photoAlt(index, coupleText)} className={styles.galleryImage} />
              </button>
            ) : (
              <div className={styles.galleryUnavailable}>
                <p>{COPY.unavailable}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
      <dialog
        ref={dialogRef}
        className={styles.galleryViewer}
        aria-label={COPY.viewerLabel}
        onClose={handleNativeClose}
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
      >
        {current === undefined ? null : (
          <>
            <figure key={current.index} className={styles.galleryViewerStage} data-index={current.index}>
              <MediaImage media={current.media} alt={photoAlt(current.index, coupleText)} className={styles.galleryViewerImage} eager />
            </figure>
            <button type="button" className={styles.galleryViewerClose} aria-label={COPY.close} onClick={requestClose}>
              <span aria-hidden="true">✕</span>
            </button>
            {navigable ? (
              <>
                <button
                  type="button"
                  className={`${styles.galleryViewerNav} ${styles.galleryViewerPrev}`}
                  aria-label={COPY.previous}
                  onClick={() => step(-1)}
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <button
                  type="button"
                  className={`${styles.galleryViewerNav} ${styles.galleryViewerNext}`}
                  aria-label={COPY.next}
                  onClick={() => step(1)}
                >
                  <span aria-hidden="true">›</span>
                </button>
              </>
            ) : null}
            <p className={styles.galleryViewerCount} aria-live="polite">
              {String((position ?? 0) + 1)} / {String(sequence.length)}
            </p>
          </>
        )}
      </dialog>
    </>
  );
}
