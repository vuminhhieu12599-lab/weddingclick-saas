"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { HONG_AN_V2_COPY } from "../copy";
import styles from "../hong-an-v2.module.css";
import { SectionHeading } from "../sections/arch";

const COPY = HONG_AN_V2_COPY.gallery;

/**
 * Section 09 — "Khoảnh Khắc" (HA-TEMPLATE-01).
 *
 * The Project's own assigned gallery photographs, in the customer's own
 * order, in an arch-topped grid with a gold hairline frame. Only RESOLVED
 * items are drawn: an UNAVAILABLE one is skipped rather than becoming a
 * broken `<img>`, no photograph is repeated to fill a gap, and nothing is
 * borrowed from another slot or role (docs/DECISIONS.md M6–M10).
 *
 * The lightbox is a native `<dialog>` so focus trapping, Escape and the
 * backdrop come from the platform rather than from hand-written key
 * handling. Arrow keys step through the album, the counter is announced,
 * and every control is a real button with a label. There is no hover
 * choreography: a tap opens, and that is the whole interaction.
 */
export function Gallery({ photos, altFor }: { readonly photos: readonly ResolvedMedia[]; readonly altFor: (position: number) => string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const headingId = useId();

  const open = useCallback((position: number) => {
    setIndex(position);
  }, []);

  const close = useCallback(() => {
    setIndex(null);
  }, []);

  const step = useCallback(
    (delta: number) => {
      setIndex((current) => {
        if (current === null) return current;
        const next = (current + delta + photos.length) % photos.length;
        return next;
      });
    },
    [photos.length],
  );

  // The dialog's open state follows React state, so Escape and the backdrop
  // close it through the same path as the button.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (index === null) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
  }, [index]);

  if (photos.length === 0) return null;
  const current = index === null ? undefined : photos[index];

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      {/*
        The reveal mark sits on the content, never on the section: the
        lightbox below is a `position: fixed` modal, and a transformed
        ancestor would make it lay out against the section rather than the
        viewport (see the gift dialog, HA-FIX-03).
      */}
      <div className={styles.galleryLead} data-reveal="rise">
        <SectionHeading id={headingId}>{COPY.heading}</SectionHeading>
      </div>

      <ul className={styles.galleryGrid}>
        {photos.map((photo, position) => (
          <li key={photo.mediaId} className={styles.galleryCell} data-reveal="photo">
            <button
              className={styles.galleryTile}
              type="button"
              onClick={() => open(position)}
              aria-label={`${COPY.open}: ${COPY.counter(position + 1, photos.length)}`}
            >
              <span className={styles.galleryArch} aria-hidden="true" />
              {/* eslint-disable-next-line @next/next/no-img-element -- opaque runtime MediaResolver URL, not a build-known asset */}
              <img
                className={styles.galleryImage}
                src={photo.url}
                alt={altFor(position + 1)}
                width={photo.width ?? undefined}
                height={photo.height ?? undefined}
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        className={styles.lightbox}
        ref={dialogRef}
        onClose={close}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            step(1);
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            step(-1);
          }
        }}
      >
        {current === undefined || index === null ? null : (
          <div className={styles.lightboxInner}>
            {/* eslint-disable-next-line @next/next/no-img-element -- opaque runtime MediaResolver URL, not a build-known asset */}
            <img
              className={styles.lightboxImage}
              src={current.url}
              alt={altFor(index + 1)}
              width={current.width ?? undefined}
              height={current.height ?? undefined}
              decoding="async"
              draggable={false}
            />
            <p className={styles.lightboxCounter} aria-live="polite">
              {COPY.counter(index + 1, photos.length)}
            </p>
            <div className={styles.lightboxControls}>
              <button className={styles.lightboxStep} type="button" onClick={() => step(-1)} aria-label={COPY.previous}>
                ‹
              </button>
              <button className={styles.lightboxClose} type="button" onClick={close}>
                {COPY.close}
              </button>
              <button className={styles.lightboxStep} type="button" onClick={() => step(1)} aria-label={COPY.next}>
                ›
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
