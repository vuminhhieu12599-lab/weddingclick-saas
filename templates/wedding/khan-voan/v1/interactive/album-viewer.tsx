import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

import type { MediaResolution, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { KHAN_VOAN_V1_COPY } from "../copy";
import styles from "../khan-voan-v1.module.css";
import { MediaImage } from "../sections/media-image";

const COPY = KHAN_VOAN_V1_COPY.album;

export type GalleryTile = "full" | "small" | "tall" | "tallRight";

/**
 * The magazine rhythm, filled in order with no holes: one full-width photo,
 * a pair, a tall photo with two small ones beside it (left, then right).
 * A tail too short for its group falls back to a pair or one full photo.
 */
export function galleryLayout(count: number): GalleryTile[] {
  const groups: readonly (readonly GalleryTile[])[] = [["full"], ["small", "small"], ["tall", "small", "small"], ["tallRight", "small", "small"]];
  const tiles: GalleryTile[] = [];
  let group = 0;
  while (tiles.length < count) {
    const remaining = count - tiles.length;
    const next = groups[group % groups.length] ?? ["full"];
    if (next.length <= remaining) tiles.push(...next);
    else if (remaining === 1) tiles.push("full");
    else tiles.push("small", "small");
    group += 1;
  }
  return tiles.slice(0, count);
}

/** Task 029 swipe threshold (px). */
const SWIPE_THRESHOLD_PX = 60;

/** One viewer entry: a `RESOLVED` slot item and its original slot index. */
export interface ViewerPhoto {
  readonly index: number;
  readonly media: ResolvedMedia;
}

/** Only `RESOLVED` gallery items, in slot order; an `UNAVAILABLE` slot keeps its tile and is skipped here. */
export function viewerSequence(gallery: readonly MediaResolution[]): ViewerPhoto[] {
  return gallery.flatMap((media, index): ViewerPhoto[] => (media.status === "RESOLVED" ? [{ index, media }] : []));
}

/** Task 029 navigation wraps both ways. */
export function stepViewer(position: number, step: 1 | -1, count: number): number {
  return (position + step + count) % count;
}

/** Slot-position alt text ("Ảnh cưới 3"), never renumbered by viewer position. */
export function slotAlt(index: number): string {
  return `${COPY.imageAlt} ${String(index + 1)}`;
}

/**
 * Romantic Minimal v1 Wedding Album grid with its full-screen viewer
 * (docs/DECISIONS.md "RM-02"; Task 029 `RomanticAlbumViewer`).
 *
 * Two columns of uniform 4:5 tiles in frozen slot order; a `RESOLVED` tile is
 * a real button, an `UNAVAILABLE` slot stays a neutral, non-interactive tile
 * (never removed, reordered or replaced). The viewer is a native modal
 * `<dialog>` on the deep rose backdrop: the whole photo (contain), ✕, the
 * "n / N" counter and — with more than one photo — previous / next buttons,
 * ArrowLeft / ArrowRight and a horizontal swipe (60 px), all wrapping. Each
 * step slides the photo in from its direction (fade only under reduced
 * motion). Escape, ✕ and the backdrop close; focus returns to the tapped
 * tile without scrolling. Nothing is fetched or stored.
 */
export function AlbumGrid({ gallery }: { gallery: readonly MediaResolution[] }) {
  const sequence = viewerSequence(gallery);
  const [position, setPosition] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1 | 0>(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const swipeStart = useRef<number | null>(null);
  const open = position !== null;
  const current = position === null ? undefined : sequence[position];
  const navigable = sequence.length > 1;
  const layout = galleryLayout(gallery.length);

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
    setDirection(0);
    setPosition(at);
  }

  function finishClose() {
    setPosition(null);
    openerRef.current?.focus({ preventScroll: true });
  }

  function requestClose() {
    const dialog = dialogRef.current;
    if (dialog !== null && dialog.open) dialog.close();
    finishClose();
  }

  function handleNativeClose() {
    if (dialogRef.current?.open === true) return;
    if (open) finishClose();
  }

  function step(next: 1 | -1) {
    if (!navigable) return;
    setDirection(next);
    setPosition((value) => (value === null ? value : stepViewer(value, next, sequence.length)));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
  }

  /** Taps outside the photo (stage padding or backdrop) close, as in Task 029. */
  function handleBackdropClick(event: MouseEvent<HTMLElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    swipeStart.current = event.clientX;
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (start === null) return;
    const offset = event.clientX - start;
    if (offset < -SWIPE_THRESHOLD_PX) step(1);
    else if (offset > SWIPE_THRESHOLD_PX) step(-1);
  }

  return (
    <>
      <div className={styles.albumGrid}>
        {gallery.map((media, index) => (
          <div
            key={`${media.mediaId}-${String(index)}`}
            className={`${styles.albumTile} ${styles.wipe}`}
            data-tile={layout[index] ?? "small"}
            data-index={index}
            data-status={media.status}
          >
            {media.status === "RESOLVED" ? (
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`${COPY.open} ${String(index + 1)}/${String(gallery.length)}`}
                onClick={(event) => openAt(index, event.currentTarget)}
              >
                <MediaImage media={media} alt={slotAlt(index)} />
              </button>
            ) : (
              <span data-unavailable="true">
                <span className={styles.srOnly}>{COPY.unavailable}</span>
              </span>
            )}
          </div>
        ))}
      </div>
      <dialog
        ref={dialogRef}
        className={styles.albumViewer}
        aria-label={COPY.viewerLabel}
        onClose={handleNativeClose}
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
      >
        {current === undefined ? null : (
          <>
            <div className={styles.albumViewerStage} onClick={handleBackdropClick}>
              <figure
                key={current.index}
                className={styles.albumViewerImage}
                data-index={current.index}
                data-direction={direction === 1 ? "next" : direction === -1 ? "previous" : "none"}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => {
                  swipeStart.current = null;
                }}
              >
                <MediaImage media={current.media} alt={slotAlt(current.index)} eager />
              </figure>
            </div>
            <button type="button" className={styles.albumViewerClose} aria-label={COPY.close} onClick={requestClose}>
              <span aria-hidden="true">✕</span>
            </button>
            {navigable ? (
              <>
                <button type="button" className={`${styles.albumViewerNav} ${styles.albumViewerPrev}`} aria-label={COPY.previous} onClick={() => step(-1)}>
                  <span aria-hidden="true">‹</span>
                </button>
                <button type="button" className={`${styles.albumViewerNav} ${styles.albumViewerNext}`} aria-label={COPY.next} onClick={() => step(1)}>
                  <span aria-hidden="true">›</span>
                </button>
              </>
            ) : null}
            <p className={styles.albumViewerCount} aria-live="polite">
              {String((position ?? 0) + 1)} / {String(sequence.length)}
            </p>
          </>
        )}
      </dialog>
    </>
  );
}
