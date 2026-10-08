import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";

import type { MediaResolution, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import type { HeritageAlbumRowKind } from "../sections/gallery-layout";
import { MediaImage } from "../sections/media-image";
import styles from "../vietnamese-heritage-v1.module.css";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.gallery;

/** One album print: its frozen slot index, its media and its optional bounded print ratio. */
export interface AlbumPrintItem {
  readonly index: number;
  readonly media: MediaResolution;
  readonly ratio: number | null;
}

export interface AlbumRowItems {
  readonly kind: HeritageAlbumRowKind;
  readonly className: string;
  readonly items: readonly AlbumPrintItem[];
}

/** One viewer entry: a `RESOLVED` slot item and its original slot index. */
export interface ViewerPhoto {
  readonly index: number;
  readonly media: ResolvedMedia;
}

/**
 * The viewer sequence: only `RESOLVED` gallery items, in their original slot
 * order. An `UNAVAILABLE` slot keeps its tile on the page and is simply not
 * in the sequence (never substituted, never opened empty).
 */
export function viewerSequence(rows: readonly AlbumRowItems[]): ViewerPhoto[] {
  return rows
    .flatMap((row) => row.items)
    .flatMap((item): ViewerPhoto[] => (item.media.status === "RESOLVED" ? [{ index: item.index, media: item.media }] : []));
}

/** Task 029 navigation wraps: previous from the first is the last, next from the last is the first. */
export function stepViewer(position: number, step: 1 | -1, count: number): number {
  return (position + step + count) % count;
}

/** Slot-position alt text ("Ảnh cưới 3" for slot 3), never renumbered by viewer position. */
export function slotAlt(index: number): string {
  return `${COPY.imageAlt} ${String(index + 1)}`;
}

/**
 * Vietnamese Heritage v1 album with its lightbox (docs/DECISIONS.md
 * "VH-02B-M2").
 *
 * Renders the album rows exactly as the static album did (same frames,
 * classes, slot order and safe-fit prints). A `RESOLVED` print's photograph
 * sits inside a real `<button type="button">` ("Xem ảnh cưới {n}"); an
 * `UNAVAILABLE` print stays the neutral, non-interactive tile.
 *
 * The viewer is a native modal `<dialog>`: deep oxblood scrim, antique-gold
 * controls, the whole photograph (`object-fit: contain`, bounded by the
 * viewport), ✕ "Đóng album ảnh", the "2 / 7" position indicator (Task 029
 * shows it always) and — only with more than one photo — "Ảnh trước" /
 * "Ảnh tiếp theo". ArrowLeft
 * / ArrowRight navigate (wrapping, as Task 029); Escape, ✕ and the backdrop
 * close. ✕ and the backdrop finish immediately; Escape finishes through the
 * native close event, ignored once the viewer was reopened. Every close
 * returns focus to the exact print that opened it, without scrolling. No
 * caption, download, share or zoom; nothing is fetched or stored.
 */
export function GalleryLightbox({ rows }: { rows: readonly AlbumRowItems[] }) {
  const sequence = viewerSequence(rows);
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
      <ul className={styles.albumRows}>
        {rows.map((row) => (
          <li key={row.items[0]?.index ?? 0} className={`${styles.albumRow} ${row.className}`} data-row={row.kind}>
            {row.items.map(({ index, media, ratio }) => {
              const style: (CSSProperties & Readonly<Record<"--vh-print-ratio", string>>) | undefined =
                ratio === null ? undefined : { "--vh-print-ratio": String(ratio) };
              return (
                <div
                  key={`${media.mediaId}-${String(index)}`}
                  className={styles.albumPrint}
                  style={style}
                  data-status={media.status}
                  data-index={index}
                  data-fit="contain"
                >
                  {media.status === "RESOLVED" ? (
                    <button
                      type="button"
                      className={styles.albumOpen}
                      aria-haspopup="dialog"
                      aria-label={`${COPY.open} ${String(index + 1)}`}
                      onClick={(event) => openAt(index, event.currentTarget)}
                    >
                      <MediaImage media={media} alt={slotAlt(index)} className={styles.albumPhoto} />
                    </button>
                  ) : (
                    <span className={styles.albumUnavailable}>{COPY.unavailable}</span>
                  )}
                </div>
              );
            })}
          </li>
        ))}
      </ul>
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
            <figure key={current.index} className={styles.viewerStage} data-index={current.index}>
              <MediaImage media={current.media} alt={slotAlt(current.index)} className={styles.viewerImage} eager />
            </figure>
            <button type="button" className={styles.viewerClose} aria-label={COPY.close} onClick={requestClose}>
              <span aria-hidden="true">✕</span>
            </button>
            {navigable ? (
              <>
                <button type="button" className={`${styles.viewerNav} ${styles.viewerPrev}`} aria-label={COPY.previous} onClick={() => step(-1)}>
                  <span aria-hidden="true">‹</span>
                </button>
                <button type="button" className={`${styles.viewerNav} ${styles.viewerNext}`} aria-label={COPY.next} onClick={() => step(1)}>
                  <span aria-hidden="true">›</span>
                </button>
              </>
            ) : null}
            <p className={styles.viewerCount} aria-live="polite">
              {String((position ?? 0) + 1)} / {String(sequence.length)}
            </p>
          </>
        )}
      </dialog>
    </>
  );
}
