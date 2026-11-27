import { useEffect, useRef, useState, type MouseEvent } from "react";

import { copyWithFeedback, type CopyFeedback } from "../../../../../lib/invitation-rendering/clipboard-copy-feedback";
import type {
  InvitationViewModel,
  MediaResolution,
  ResolvedMedia,
  ViewModelGiftSide,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { downloadQrWithFeedback, type DownloadFeedback } from "../../../../../lib/invitation-rendering/media-download-feedback";
import type { ClipboardCapabilityV1, MediaDownloadCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";
import { KHAN_VOAN_V1_COPY } from "../copy";
import styles from "../khan-voan-v1.module.css";
import { Bow, GiftBox, Vine } from "../sections/decor";
import { MediaImage } from "../sections/media-image";

const COPY = KHAN_VOAN_V1_COPY.gift;
const SIDE_LABEL = KHAN_VOAN_V1_COPY.families.labelBySide;

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

interface GiftPanel {
  readonly side: CoupleSide;
  readonly gift: ViewModelGiftSide | undefined;
  readonly qr: ResolvedMedia | undefined;
}

function resolved(media: MediaResolution | undefined): ResolvedMedia | undefined {
  return media?.status === "RESOLVED" ? media : undefined;
}

function hasContent(panel: GiftPanel): boolean {
  const gift = panel.gift;
  return panel.qr !== undefined || (gift !== undefined && (present(gift.bankName) || present(gift.bankAccountName) || present(gift.bankAccountNumber)));
}

const COPY_NOTE: Readonly<Record<CopyFeedback, string | null>> = Object.freeze({
  IDLE: null,
  PENDING: null,
  SUCCESS: COPY.copied,
  FAILED: COPY.copyFailed,
  UNAVAILABLE: COPY.copyUnavailable,
});

const DOWNLOAD_NOTE: Readonly<Record<DownloadFeedback, string | null>> = Object.freeze({
  IDLE: null,
  PENDING: null,
  SUCCESS: COPY.qrDownloaded,
  FAILED: COPY.qrDownloadFailed,
  UNAVAILABLE: COPY.qrDownloadUnavailable,
});

function AccountCopy({ clipboard, value, sideLabel }: { clipboard: ClipboardCapabilityV1 | undefined; value: string; sideLabel: string }) {
  const [feedback, setFeedback] = useState<CopyFeedback>("IDLE");
  if (clipboard === undefined) {
    return (
      <p className={styles.giftAccount}>
        <b>{value}</b>
      </p>
    );
  }
  const note = COPY_NOTE[feedback];
  return (
    <button
      type="button"
      className={styles.giftAccount}
      aria-disabled={feedback === "PENDING" ? true : undefined}
      aria-label={`${COPY.copy} ${sideLabel}: ${value}`}
      data-copy-feedback={feedback.toLowerCase()}
      onClick={() => {
        if (feedback === "PENDING") return;
        setFeedback("PENDING");
        void copyWithFeedback(clipboard, value).then(setFeedback);
      }}
    >
      <b>{value}</b>
      <span role="status">{note ?? COPY.copy}</span>
    </button>
  );
}

function QrDownload({ download, qr, side, sideLabel }: { download: MediaDownloadCapabilityV1; qr: ResolvedMedia; side: CoupleSide; sideLabel: string }) {
  const [feedback, setFeedback] = useState<DownloadFeedback>("IDLE");
  const note = DOWNLOAD_NOTE[feedback];
  return (
    <>
      <button
        type="button"
        className={styles.giftDownload}
        aria-disabled={feedback === "PENDING" ? true : undefined}
        aria-label={`${COPY.qrDownload} ${sideLabel}`}
        onClick={() => {
          if (feedback === "PENDING") return;
          setFeedback("PENDING");
          void downloadQrWithFeedback(download, qr, side).then(setFeedback);
        }}
      >
        {COPY.qrDownload}
      </button>
      <span className={note === null ? styles.srOnly : styles.giftNoteSmall} role="status">
        {note}
      </span>
    </>
  );
}

function PanelBody({ panel, clipboard, download }: { panel: GiftPanel; clipboard: ClipboardCapabilityV1 | undefined; download: MediaDownloadCapabilityV1 | undefined }) {
  const sideLabel = SIDE_LABEL[panel.side];
  const gift = panel.gift;
  return (
    <div className={styles.giftBody}>
      {panel.qr === undefined ? null : (
        <>
          <div className={styles.giftQr}>
            <MediaImage media={panel.qr} alt={`${COPY.qrAlt} ${sideLabel}`} />
          </div>
          {download === undefined ? null : <QrDownload download={download} qr={panel.qr} side={panel.side} sideLabel={sideLabel} />}
        </>
      )}
      {gift !== undefined && (present(gift.bankName) || present(gift.bankAccountName)) ? (
        <p className={styles.giftBank}>
          {present(gift.bankName) ? gift.bankName : null}
          {present(gift.bankAccountName) ? <b>{gift.bankAccountName}</b> : null}
        </p>
      ) : null}
      {gift !== undefined && present(gift.bankAccountNumber) ? <AccountCopy clipboard={clipboard} value={gift.bankAccountNumber} sideLabel={sideLabel} /> : null}
    </div>
  );
}

interface GiftProps {
  operationalSides: InvitationViewModel["operationalSides"];
  gift: InvitationViewModel["gift"];
  qr: InvitationViewModel["media"]["qr"];
  clipboard: ClipboardCapabilityV1 | undefined;
  download: MediaDownloadCapabilityV1 | undefined;
}

/** The gift box: one tap lifts its lid and opens the popup with each operational side's QR and account. */
export function Gift({ operationalSides, gift, qr, clipboard, download }: GiftProps) {
  const panels = operationalSides
    .map((side): GiftPanel => (side === "GROOM" ? { side, gift: gift.groom, qr: resolved(qr.groom) } : { side, gift: gift.bride, qr: resolved(qr.bride) }))
    .filter(hasContent);
  const [open, setOpen] = useState(false);
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

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  return (
    <div className={`${styles.giftCta} ${styles.reveal}`} data-island="gift">
      <Vine className={styles.vine} />
      <p className={styles.giftIntro}>{COPY.intro}</p>
      <button ref={openerRef} type="button" className={styles.giftBoxButton} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <GiftBox className={styles.giftBox} lidClassName={styles.giftLid} sparkClassName={styles.giftSpark} />
        <span>{COPY.openDialog}</span>
      </button>
      <dialog ref={dialogRef} className={styles.giftDialog} aria-labelledby="kv-gift-title" onClose={handleNativeClose} onClick={handleBackdropClick}>
        <div className={styles.giftPanel}>
          <Bow className={styles.giftBow} />
          <button type="button" className={styles.giftClose} aria-label={COPY.closeDialog} onClick={requestClose}>
            <span aria-hidden="true">×</span>
          </button>
          <h2 id="kv-gift-title" className={styles.eyebrow}>
            {COPY.heading}
          </h2>
          <p className={styles.giftDialogNote}>{COPY.dialogNote}</p>
          {tabbed ? (
            <div className={styles.giftTabs} role="group" aria-label={COPY.tabsLabel}>
              {panels.map((panel) => (
                <button
                  key={panel.side}
                  type="button"
                  aria-pressed={panel === selected}
                  aria-controls={`kv-gift-panel-${panel.side}`}
                  onClick={() => setActiveSide(panel.side)}
                >
                  {SIDE_LABEL[panel.side]}
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.sideLabel}>{selected === undefined ? null : SIDE_LABEL[selected.side]}</p>
          )}
          {panels.map((panel) => (
            <div key={panel.side} id={`kv-gift-panel-${panel.side}`} data-side={panel.side} hidden={panel !== selected}>
              <PanelBody panel={panel} clipboard={clipboard} download={download} />
            </div>
          ))}
        </div>
      </dialog>
    </div>
  );
}
