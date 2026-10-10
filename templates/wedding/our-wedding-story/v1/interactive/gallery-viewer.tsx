import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

import type { MediaResolution, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import styles from "../our-wedding-story-v1.module.css";
import { buildGalleryRows } from "../sections/gallery-rows";
import { MediaImage } from "../sections/media-image";

const COPY = OUR_WEDDING_STORY_V1_COPY.gallery;

/** Visual Freeze v1 swipe threshold (px). */
const SWIPE_THRESHOLD_PX = 40;

/** One viewer entry: a `RESOLVED` slot item and its original slot index. */
export interface ViewerPhoto {
  readonly index: number;
  readonly media: ResolvedMedia;
}

/** Only `RESOLVED` gallery items, in slot order; an `UNAVAILABLE` slot keeps its tile and is skipped here. */
export function viewerSequence(gallery: readonly MediaResolution[]): ViewerPhoto[] {
  return gallery.flatMap((media, index): ViewerPhoto[] => (media.status === "RESOLVED" ? [{ index, media }] : []));
}

/** Navigation wraps both ways. */
export function stepViewer(position: number, step: 1 | -1, count: number): number {
  return (position + step + count) % count;
}

/** Slot-position alt text ("Ảnh cưới 3"), never renumbered by viewer position. */
export function slotAlt(index: number): string {
  return `${COPY.imageAlt} ${String(index + 1)}`;
}

const pad2 = (value: number) => String(value).padStart(2, "0");

/**
 * Our Wedding Story v1 gallery rows with their full-screen viewer
 * (docs/DECISIONS.md "OWS-01"; Visual Freeze v1 "Our Gallery").
 *
 * Magazine rows from `buildGalleryRows` in frozen slot order; a `RESOLVED`
 * tile is a real button, an `UNAVAILABLE` slot stays a neutral,
 * non-interactive tile (never removed, reordered or replaced). The viewer is
 * a native modal `<dialog>` on the deep brown backdrop: "NN / NN" and ✕ at
 * the top, the whole photo (contain), and — with more than one photo — ‹ ›
 * below, ArrowLeft / ArrowRight and a 40 px horizontal swipe, all wrapping.
 * Escape, ✕ and the backdrop close; focus returns to the tapped tile without
 * scrolling. Nothing is fetched or stored.
 */
export function GalleryGrid({ gallery }: { gallery: readonly MediaResolution[] }) {
  const rows = buildGalleryRows(gallery);
  const sequence = viewerSequence(gallery);
  const [position, setPosition] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const swipeStart = useRef<number | null>(null);
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

  /** Taps on the backdrop or the empty stage around the photo close. */
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

  const tile = (index: number, className: string) => {
    const media = gallery[index];
    if (media === undefined) return null;
    return media.status === "RESOLVED" ? (
      <button
        key={index}
        type="button"
        className={`${styles.galleryTile} ${className}`}
        aria-haspopup="dialog"
        aria-label={`${COPY.open} ${String(index + 1)} ${COPY.of} ${String(gallery.length)}`}
        data-index={index}
        onClick={(event) => openAt(index, event.currentTarget)}
      >
        <MediaImage media={media} alt={slotAlt(index)} className={styles.fillImage} />
      </button>
    ) : (
      <span key={index} className={`${styles.galleryTile} ${className}`} data-index={index} data-unavailable="true">
        <span className={styles.srOnly}>{COPY.unavailable}</span>
      </span>
    );
  };

  return (
    <>
      <div className={styles.galleryRows}>
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className={styles.galleryRowWrap} data-row={row.kind}>
            {row.kind === "feature" ? (
              <div className={row.flip ? `${styles.galleryFeature} ${styles.galleryFeatureFlip}` : styles.galleryFeature}>
                {tile(row.large, styles.galleryLarge)}
                {tile(row.small[0], styles.gallerySmall)}
                {tile(row.small[1], styles.gallerySmall)}
              </div>
            ) : row.kind === "pair" ? (
              <div className={styles.galleryPair}>
                {tile(row.items[0], styles.galleryPairTile)}
                {tile(row.items[1], styles.galleryPairTile)}
              </div>
            ) : (
              <div className={styles.gallerySingle}>{tile(row.item, styles.gallerySingleTile)}</div>
            )}
          </div>
        ))}
      </div>
      <dialog
        ref={dialogRef}
        className={styles.viewer}
        aria-label={COPY.viewerLabel}
        onClose={handleNativeClose}
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
      >
        {current === undefined ? null : (
          <>
            <div className={styles.viewerTop}>
              <span className={styles.viewerCount} aria-live="polite">
                {pad2((position ?? 0) + 1)} / {pad2(sequence.length)}
              </span>
              <button type="button" className={styles.viewerClose} aria-label={COPY.close} onClick={requestClose}>
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <div className={styles.viewerStage} onClick={handleBackdropClick}>
              <figure
                key={current.index}
                className={styles.viewerImage}
                data-index={current.index}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => {
                  swipeStart.current = null;
                }}
              >
                <MediaImage media={current.media} alt={slotAlt(current.index)} className={styles.containImage} eager />
              </figure>
            </div>
            {navigable ? (
              <div className={styles.viewerNav}>
                <button type="button" className={styles.viewerArrow} aria-label={COPY.previous} onClick={() => step(-1)}>
                  <span aria-hidden="true">‹</span>
                </button>
                <button type="button" className={styles.viewerArrow} aria-label={COPY.next} onClick={() => step(1)}>
                  <span aria-hidden="true">›</span>
                </button>
              </div>
            ) : null}
          </>
        )}
      </dialog>
    </>
  );
}
