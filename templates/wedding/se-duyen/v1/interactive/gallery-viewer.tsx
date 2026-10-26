import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { SE_DUYEN_V1_COPY } from "../copy";
import styles from "../se-duyen-v1.module.css";
import { albumPhotos, stepAlbum, type AlbumPhoto } from "../sections/gallery-frames";
import { photoFrameStyle } from "../sections/photo-frame";

const COPY = SE_DUYEN_V1_COPY.gallery;

/** Alt text by the photograph's position in the album ("Ảnh cưới 3"). */
export function albumAlt(position: number): string {
  return `${COPY.imageAlt} ${String(position)}`;
}

/**
 * Se Duyên v1 album frames with their full-size viewer (SD-V1-02B2), ported
 * from the frozen pilot v03 album and its overlay.
 *
 * THE FRAMES are the approved asymmetric composition, unchanged: a
 * full-width lead, a staggered tall/small pair — centred on its own when
 * only one of the two has a photograph, exactly as approved — then a square
 * crop against the right margin. Each frame paints the Project's own
 * photograph as its background, so the approved crop of that frame is kept
 * (the small one is deliberately zoomed past `cover`), and each frame that
 * carries a photograph is itself the control that opens it: there is no
 * separate button, as there is none on the wedding box.
 *
 * THE VIEWER is a native modal `<dialog>`, the same pattern the other
 * production renderers use: `showModal()` brings Escape, the focus trap and
 * an inert page with it, so this island needs no `window` listener of its
 * own. ‹ › and ArrowLeft / ArrowRight step through the album and wrap both
 * ways; ✕, Escape and the field around the photograph close it; focus
 * returns to the frame that was tapped, without scrolling the page.
 *
 * Nothing is fetched, stored or measured, and no photograph is ever shown
 * that is not the Project's own RESOLVED media.
 */
export function AlbumFrames({ gallery }: { readonly gallery: readonly MediaResolution[] }) {
  const photos = albumPhotos(gallery);
  // `position` is null only before the first opening.
  const [position, setPosition] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const current = position === null ? undefined : photos[position];
  const navigable = photos.length > 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function openAt(at: number, opener: HTMLButtonElement) {
    if (photos[at] === undefined) return;
    openerRef.current = opener;
    setPosition(at);
    setOpen(true);
  }

  function finishClose() {
    setOpen(false);
    openerRef.current?.focus({ preventScroll: true });
  }

  function requestClose() {
    const dialog = dialogRef.current;
    if (dialog !== null && dialog.open) dialog.close();
    finishClose();
  }

  /** Escape closes the dialog itself; this keeps React's state in step. */
  function handleNativeClose() {
    if (dialogRef.current?.open === true) return;
    if (open) finishClose();
  }

  function step(next: 1 | -1) {
    if (!navigable || !open) return;
    setPosition((value) => (value === null ? value : stepAlbum(value, next, photos.length)));
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

  /** The field around the photograph closes, as the prototype's scrim did. */
  function handleFieldClick(event: MouseEvent<HTMLElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  const frame = (photo: AlbumPhoto | undefined, className: string) => {
    if (photo === undefined) return null;
    const at = photos.indexOf(photo);
    return (
      <button
        type="button"
        className={`${className} ${styles.photoButton}`}
        style={photoFrameStyle(photo.frame, photo.media)}
        aria-haspopup="dialog"
        aria-label={`${COPY.open}: ${COPY.imageAlt} ${String(photo.position)} ${COPY.of} ${String(photos.length)}`}
        data-position={photo.position}
        onClick={(event) => openAt(at, event.currentTarget)}
      />
    );
  };

  const byFrame = (name: AlbumPhoto["frame"]) => photos.find((photo) => photo.frame === name);
  const lead = byFrame("albumLead");
  const tall = byFrame("albumTall");
  const small = byFrame("albumSmall");
  const foot = byFrame("albumFoot");

  return (
    <>
      {lead === undefined ? null : <div className={styles.albumLeadRow}>{frame(lead, styles.albumLead)}</div>}

      {tall === undefined && small === undefined ? null : (
        <div className={`${styles.albumPair} ${tall !== undefined && small !== undefined ? "" : styles.albumPairSolo}`}>
          {frame(tall, styles.albumPairTall)}
          {frame(small, styles.albumPairSmall)}
        </div>
      )}

      {foot === undefined ? null : <div className={styles.albumFootRow}>{frame(foot, styles.albumFoot)}</div>}

      <dialog
        ref={dialogRef}
        className={styles.lightbox}
        aria-label={COPY.viewerLabel}
        onClose={handleNativeClose}
        onClick={handleFieldClick}
        onKeyDown={handleKeyDown}
      >
        {current === undefined ? null : (
          <>
            <div className={styles.lightboxFrame}>
              {/* eslint-disable-next-line @next/next/no-img-element -- opaque runtime MediaResolver URL, not a build-known asset */}
              <img
                className={styles.lightboxImage}
                src={current.media.url}
                alt={albumAlt(current.position)}
                width={current.media.width ?? undefined}
                height={current.media.height ?? undefined}
                decoding="async"
                draggable={false}
              />
            </div>

            {navigable ? (
              <>
                <button
                  type="button"
                  className={`${styles.lightboxStep} ${styles.lightboxPrev}`}
                  aria-label={COPY.previous}
                  onClick={() => step(-1)}
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <button
                  type="button"
                  className={`${styles.lightboxStep} ${styles.lightboxNext}`}
                  aria-label={COPY.next}
                  onClick={() => step(1)}
                >
                  <span aria-hidden="true">›</span>
                </button>
              </>
            ) : null}

            <button type="button" className={styles.lightboxClose} aria-label={COPY.close} onClick={requestClose}>
              <span aria-hidden="true">✕</span>
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
