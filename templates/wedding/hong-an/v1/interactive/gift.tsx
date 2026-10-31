"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

import { copyWithFeedback, type CopyFeedback } from "../../../../../lib/invitation-rendering/clipboard-copy-feedback";
import { downloadQrWithFeedback, type DownloadFeedback } from "../../../../../lib/invitation-rendering/media-download-feedback";
import type { ClipboardCapabilityV1, MediaDownloadCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";
import { HONG_AN_V1_COPY } from "../copy";
import styles from "../hong-an-v1.module.css";
import { SectionHeading } from "../sections/arch";
import { accountNumberOf, type GiftPanel } from "../sections/gift-panels";

const COPY = HONG_AN_V1_COPY.gift;

/**
 * Section 13 — "Mừng Cưới" (HA-TEMPLATE-01; interaction corrected in
 * HA-FIX-02).
 *
 * THE PAGE SHOWS ONLY AN INVITATION TO GIVE, NEVER THE DETAILS. A guest
 * scrolling the invitation sees the heading, one warm line and a single
 * centred "Gửi mừng cưới" button. Bank names, account numbers and QR codes
 * exist nowhere in the page layout until that button is pressed — which is
 * both the approved WeddingClick UX and the decent way to treat a family's
 * account details.
 *
 * The dialog behaviour follows the pattern the other production renderers
 * already use (Romantic Minimal v1, Vietnamese Heritage v2, Our Wedding
 * Story v2): a native modal `<dialog>`, so the top layer, the inert
 * background, focus containment and Escape all come from the platform
 * rather than from hand-written key handling. The ✕ and the backdrop close
 * it too, every close returns focus to the button that opened it, and the
 * content is remounted on close so a copy result or a chosen side never
 * carries into the next opening. None of their styling is imported: the
 * presentation here is Hồng Ân's own.
 *
 * COMMON shows both families in ONE dialog behind two compact tabs, chosen
 * by each panel's explicit `side` and never by position. GROOM and BRIDE
 * get only their own side, because `operationalSides` already said so.
 *
 * HONEST DATA ONLY. Every value is a canonical per-side gift field; a null
 * or blank one is simply not a row, a side with neither a QR nor a row is
 * dropped, and with no side left the section is not rendered at all. No
 * bank, account or QR is ever invented, and there is no substitution
 * between sides (RF13, S9).
 *
 * THE CONTROLS NEVER LIE. Copy and save go through the shared feedback
 * models, so "Đã sao chép" appears only when the clipboard really resolved
 * SUCCESS and "Đã lưu mã QR" only when the file really reached the
 * browser. Each control is drawn only while its capability exists, so a
 * button that cannot work is never shown (CLAUDE.md §22).
 */
function CopyAccountButton({
  clipboard,
  accountNumber,
}: {
  readonly clipboard: ClipboardCapabilityV1;
  readonly accountNumber: string;
}) {
  const [feedback, setFeedback] = useState<CopyFeedback>("IDLE");

  const copy = useCallback(() => {
    setFeedback("PENDING");
    void copyWithFeedback(clipboard, accountNumber).then(setFeedback);
  }, [clipboard, accountNumber]);

  const message =
    feedback === "SUCCESS"
      ? COPY.copied
      : feedback === "UNAVAILABLE"
        ? COPY.copyUnavailable
        : feedback === "FAILED"
          ? COPY.copyFailed
          : null;

  return (
    <>
      <button
        className={styles.giftCopy}
        type="button"
        onClick={copy}
        disabled={feedback === "PENDING"}
        aria-label={COPY.copy}
        title={COPY.copy}
        data-feedback={feedback}
      >
        <span className={styles.giftCopyGlyph} aria-hidden="true" />
      </button>
      {message === null ? null : (
        <p className={styles.giftFeedback} role="status" data-feedback={feedback}>
          {message}
        </p>
      )}
    </>
  );
}

function SaveQrButton({
  download,
  panel,
}: {
  readonly download: MediaDownloadCapabilityV1;
  readonly panel: GiftPanel;
}) {
  const [feedback, setFeedback] = useState<DownloadFeedback>("IDLE");
  const qr = panel.qr;

  const save = useCallback(() => {
    if (qr === undefined) return;
    setFeedback("PENDING");
    void downloadQrWithFeedback(download, qr, panel.side).then(setFeedback);
  }, [download, qr, panel.side]);

  if (qr === undefined) return null;

  const message =
    feedback === "SUCCESS"
      ? COPY.qrSaved
      : feedback === "UNAVAILABLE"
        ? COPY.qrSaveUnavailable
        : feedback === "FAILED"
          ? COPY.qrSaveFailed
          : null;

  return (
    <>
      <button className={styles.giftSaveQr} type="button" onClick={save} disabled={feedback === "PENDING"}>
        {COPY.saveQr}
      </button>
      {message === null ? null : (
        <p className={styles.giftFeedback} role="status" data-feedback={feedback}>
          {message}
        </p>
      )}
    </>
  );
}

/** One family's canonical details, as shown inside the dialog. */
function GiftPanelBody({
  panel,
  clipboard,
  download,
}: {
  readonly panel: GiftPanel;
  readonly clipboard: ClipboardCapabilityV1 | undefined;
  readonly download: MediaDownloadCapabilityV1 | undefined;
}) {
  const accountNumber = accountNumberOf(panel);

  return (
    <div className={styles.giftBody}>
      <dl className={styles.giftRows}>
        {panel.rows.map((row) => (
          <div key={row.key} className={styles.giftRow} data-row={row.key}>
            <dt className={styles.giftRowLabel}>{COPY.rows[row.key]}</dt>
            <dd className={styles.giftRowValue}>{row.value}</dd>
          </div>
        ))}
      </dl>

      {accountNumber === undefined || clipboard === undefined ? null : (
        <CopyAccountButton clipboard={clipboard} accountNumber={accountNumber} />
      )}

      {panel.qr === undefined ? null : (
        <figure className={styles.giftQr}>
          {/* eslint-disable-next-line @next/next/no-img-element -- opaque runtime MediaResolver URL, not a build-known asset */}
          <img
            className={styles.giftQrImage}
            src={panel.qr.url}
            alt={COPY.qrAlt(COPY.sides[panel.side])}
            width={panel.qr.width ?? undefined}
            height={panel.qr.height ?? undefined}
            loading="lazy"
            decoding="async"
          />
        </figure>
      )}

      {download === undefined ? null : <SaveQrButton download={download} panel={panel} />}
    </div>
  );
}

export function Gift({
  panels,
  clipboard,
  download,
}: {
  readonly panels: readonly GiftPanel[];
  readonly clipboard: ClipboardCapabilityV1 | undefined;
  readonly download: MediaDownloadCapabilityV1 | undefined;
}) {
  const [open, setOpen] = useState(false);
  // Bumped on every close so the panel remounts: a copy result or a chosen
  // side never survives into the next opening.
  const [generation, setGeneration] = useState(0);
  const [activeSide, setActiveSide] = useState<CoupleSide | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (panels.length === 0) return null;

  const selected = panels.find((panel) => panel.side === activeSide) ?? panels[0];
  const tabbed = panels.length > 1;

  function finishClose() {
    setOpen(false);
    setActiveSide(null);
    setGeneration((value) => value + 1);
    openerRef.current?.focus({ preventScroll: true });
  }

  function requestClose() {
    const dialog = dialogRef.current;
    if (dialog !== null && dialog.open) dialog.close();
    finishClose();
  }

  /** Escape (`cancel` → `close`) settles here; a late event after a reopen is ignored. */
  function handleNativeClose() {
    if (dialogRef.current?.open === true) return;
    if (open) finishClose();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  return (
    <section className={styles.sectionWarm} aria-labelledby="ha-gift-heading">
      {/*
        HA-FIX-03 — THE REVEAL MARK IS ON THIS WRAPPER, NOT ON THE SECTION,
        AND THAT IS LOAD-BEARING.

        A reveal target carries `transform: translateY(...)` until it has
        been scrolled into view, and a transformed element becomes the
        containing block for `position: fixed` DESCENDANTS. With the mark
        on the section, the modal below was laid out against the section at
        document coordinates instead of against the viewport, so
        `showModal()` scrolled the whole page up to bring it into view —
        the guest landed back at the top of the invitation. Keeping the
        dialog outside the animated box is the fix; nothing about the
        reveal itself changes.
      */}
      <div className={styles.giftLead} data-reveal="rise">
        <SectionHeading id="ha-gift-heading">{COPY.heading}</SectionHeading>
        <p className={styles.giftIntro}>{COPY.intro}</p>

        <button
          ref={openerRef}
          className={styles.giftOpen}
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {COPY.openDialog}
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className={styles.giftDialog}
        aria-labelledby="ha-gift-dialog-title"
        onClose={handleNativeClose}
        onClick={handleBackdropClick}
      >
        <div key={generation} className={styles.giftDialogPanel}>
          <button
            className={styles.giftDialogClose}
            type="button"
            aria-label={COPY.closeDialog}
            onClick={requestClose}
          >
            <span aria-hidden="true">✕</span>
          </button>

          <span className={styles.giftDialogCross} aria-hidden="true" />
          <h2 className={styles.giftDialogTitle} id="ha-gift-dialog-title">
            {COPY.dialogHeading}
          </h2>

          {tabbed ? (
            <div className={styles.giftTabs} role="group" aria-label={COPY.tabsLabel}>
              {panels.map((panel) => (
                <button
                  key={panel.side}
                  className={styles.giftTab}
                  type="button"
                  aria-pressed={panel === selected}
                  aria-controls={`ha-gift-panel-${panel.side}`}
                  onClick={() => setActiveSide(panel.side)}
                >
                  {COPY.sides[panel.side]}
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.giftSide}>{COPY.sides[selected.side]}</p>
          )}

          {panels.map((panel) => (
            <div key={panel.side} id={`ha-gift-panel-${panel.side}`} hidden={panel !== selected}>
              <GiftPanelBody panel={panel} clipboard={clipboard} download={download} />
            </div>
          ))}
        </div>
      </dialog>
    </section>
  );
}
