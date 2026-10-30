import type { ClipboardCapabilityV1, MediaDownloadCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { OUR_WEDDING_STORY_V2_COPY } from "../copy";
import { CopyAccountButton } from "../interactive/copy-account-button";
import { QrDownloadButton } from "../interactive/qr-download-button";
import { GiftSheet } from "../interactive/gift-sheet";
import styles from "../our-wedding-story-v2.module.css";
import type { GiftLine, GiftPanel } from "./gift-panels";
import { MediaImage } from "./media-image";

const COPY = OUR_WEDDING_STORY_V2_COPY;

const LINE_LABEL: Readonly<Record<GiftLine["key"], string>> = Object.freeze({
  bankName: COPY.gift.bankName,
  accountName: COPY.gift.accountName,
  accountNumber: COPY.gift.accountNumber,
});

/** One side's bank card: label, its own `RESOLVED` QR, its canonical lines, and copy only with the capability. */
function BankCard({ panel, clipboard, download }: { panel: GiftPanel; clipboard: ClipboardCapabilityV1 | undefined; download: MediaDownloadCapabilityV1 | undefined }) {
  const sideLabel = COPY.sideLabel[panel.side];
  return (
    <div className={styles.bankCard} data-side={panel.side}>
      <div className={styles.bankSide}>{sideLabel}</div>
      {panel.qr === undefined ? null : (
        <>
          <div className={styles.bankQr}>
            <MediaImage media={panel.qr} alt={`${COPY.gift.qrAlt} ${sideLabel}`} className={styles.containImage} />
          </div>
          {/* WC-GIFT-QR-01: a sibling of the fixed QR plate, in normal flow
              BELOW it — never inside, where it would sit on the code itself.
              Only for THIS side's own RESOLVED QR. */}
          {download === undefined ? null : (
            <QrDownloadButton download={download} qr={panel.qr} side={panel.side} sideLabel={sideLabel} />
          )}
        </>
      )}
      {panel.lines.length === 0 ? null : (
        <dl className={styles.bankRows}>
          {panel.lines.map((line) =>
            line.key === "accountNumber" ? (
              // GIFT-UI-01: the number leaves the label/value grid and takes a
              // centred plate of its own, with the copy control in the column
              // balancing it, so the icon's width never pulls it off axis.
              <div key={line.key} className={styles.bankAccount} data-line={line.key}>
                <dt>{LINE_LABEL[line.key]}</dt>
                <dd className={styles.bankAccountRow}>
                  <span className={styles.bankNumber}>{line.value}</span>
                  {clipboard === undefined ? null : <CopyAccountButton clipboard={clipboard} value={line.value} sideLabel={sideLabel} />}
                </dd>
              </div>
            ) : (
              <div key={line.key} className={styles.bankRow} data-line={line.key}>
                <dt>{LINE_LABEL[line.key]}</dt>
                <dd>{line.value}</dd>
              </div>
            ),
          )}
        </dl>
      )}
    </div>
  );
}

interface GiftProps {
  /** From `giftPanels`: only operational sides with honest content; never empty here. */
  panels: readonly GiftPanel[];
  /** `capabilities.clipboard`, passed through by the root only; absent → no copy control. */
  clipboard: ClipboardCapabilityV1 | undefined;
  /** `capabilities.download`, passed through by the root only; absent → no QR download control. */
  download: MediaDownloadCapabilityV1 | undefined;
}

/**
 * Visual Freeze v1 wedding gift: on the page the caramel rule, the fixed note
 * and the "Gửi quà mừng cưới" button; the bank cards (one per side, stacked)
 * open in the bottom sheet island.
 */
export function Gift({ panels, clipboard, download }: GiftProps) {
  return (
    <div className={styles.giftBlock} data-island="gift">
      <span className={styles.giftRule} aria-hidden="true" />
      <p className={styles.giftNote}>{COPY.gift.pageNote}</p>
      <GiftSheet>
        {panels.map((panel) => (
          <BankCard key={panel.side} panel={panel} clipboard={clipboard} download={download} />
        ))}
      </GiftSheet>
    </div>
  );
}
