import { useEffect, useRef, useState, type MouseEvent } from "react";

import type { ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import { MediaImage } from "../sections/media-image";
import styles from "../romantic-minimal-v1.module.css";

const COPY = ROMANTIC_MINIMAL_V1_COPY.ourLove;

/** One Our Love photo: its 1-based slot position (layout order only) and media. */
export interface OurLovePhoto {
  readonly position: number;
  readonly media: ResolvedMedia;
}

/**
 * Romantic Minimal v1 Our Love photos with their single-photo lightbox
 * (docs/DECISIONS.md "RM-02"; Task 029 `RomanticLightbox`). Each photo is a
 * real button; the viewer is a native modal `<dialog>` showing the whole
 * photograph (contain) with ✕; Escape, ✕ and the backdrop close and focus
 * returns to the tapped photo without scrolling.
 */
export function OurLovePhotos({ photos }: { photos: readonly OurLovePhoto[] }) {
  const [current, setCurrent] = useState<OurLovePhoto | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const open = current !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function finishClose() {
    setCurrent(null);
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

  function handleBackdropClick(event: MouseEvent<HTMLElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  const alt = (photo: OurLovePhoto) => `${COPY.photoAlt} ${String(photo.position)}`;

  return (
    <>
      <div className={styles.ourLovePhotos} data-count={photos.length}>
        {photos.map((photo) => (
          <div key={photo.position} className={styles.ourLovePhotoWrap} data-position={photo.position}>
            <button
              type="button"
              className={styles.ourLovePhoto}
              aria-haspopup="dialog"
              aria-label={`${COPY.open}: ${alt(photo)}`}
              onClick={(event) => {
                openerRef.current = event.currentTarget;
                setCurrent(photo);
              }}
            >
              <MediaImage media={photo.media} alt={alt(photo)} className={styles.coverImage} />
            </button>
          </div>
        ))}
      </div>
      <dialog
        ref={dialogRef}
        className={styles.lightbox}
        aria-label={current === null ? COPY.heading : alt(current)}
        onClose={handleNativeClose}
        onClick={handleBackdropClick}
      >
        {current === null ? null : (
          <>
            <div className={styles.lightboxImage} onClick={handleBackdropClick}>
              <MediaImage media={current.media} alt={alt(current)} className={styles.containImage} eager />
            </div>
            <button type="button" className={styles.lightboxClose} aria-label={COPY.close} onClick={requestClose}>
              <span aria-hidden="true">✕</span>
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
