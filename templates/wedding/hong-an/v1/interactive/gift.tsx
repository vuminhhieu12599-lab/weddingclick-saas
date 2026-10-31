"use client";

import { useCallback, useState } from "react";

import { copyWithFeedback, type CopyFeedback } from "../../../../../lib/invitation-rendering/clipboard-copy-feedback";
import { downloadQrWithFeedback, type DownloadFeedback } from "../../../../../lib/invitation-rendering/media-download-feedback";
import type { ClipboardCapabilityV1, MediaDownloadCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { HONG_AN_V1_COPY } from "../copy";
import styles from "../hong-an-v1.module.css";
import { SectionHeading } from "../sections/arch";
import { accountNumberOf, type GiftPanel } from "../sections/gift-panels";

const COPY = HONG_AN_V1_COPY.gift;

/**
 * Section 13 — "Mừng Cưới" (HA-TEMPLATE-01).
 *
 * A light envelope plate per operational side: a gold arch, the canonical
 * bank rows, the account number centred, an icon-only copy control and
 * that side's own QR when one is configured. Nothing fintech about it.
 *
 * HONEST DATA ONLY. Every value is a canonical per-side gift field. A null
 * or blank bank name, account holder or account number is simply not a row;
 * a side with neither a QR nor a single row is dropped; with no side left
 * the section is not rendered. No bank, account or QR is ever invented, and
 * there is no common QR and no substitution between sides (RF13, S9).
 *
 * THE CONTROLS NEVER LIE. Copy and save both go through the shared
 * feedback models, so "Đã sao chép" appears only when the clipboard
 * capability actually resolved SUCCESS, and "Đã lưu mã QR" only when the
 * file really reached the browser. Each control is drawn only while its
 * capability exists, so a button that cannot work is never shown
 * (CLAUDE.md §22).
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

export function Gift({
  panels,
  clipboard,
  download,
}: {
  readonly panels: readonly GiftPanel[];
  readonly clipboard: ClipboardCapabilityV1 | undefined;
  readonly download: MediaDownloadCapabilityV1 | undefined;
}) {
  if (panels.length === 0) return null;

  return (
    <section className={styles.sectionWarm} aria-labelledby="ha-gift-heading" data-reveal="rise">
      <SectionHeading id="ha-gift-heading">{COPY.heading}</SectionHeading>
      <p className={styles.giftIntro}>{COPY.intro}</p>

      <div className={styles.giftPanels} data-count={panels.length}>
        {panels.map((panel) => {
          const accountNumber = accountNumberOf(panel);
          return (
            <div key={panel.side} className={styles.giftPanel} data-side={panel.side} data-reveal="arch">
              <span className={styles.giftArch} aria-hidden="true" />
              <p className={styles.giftSide}>{COPY.sides[panel.side]}</p>

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
        })}
      </div>
    </section>
  );
}
