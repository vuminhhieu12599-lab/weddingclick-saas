import type { ClipboardCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import { CopyAccountButton } from "../interactive/copy-account-button";
import { GiftSheet } from "../interactive/gift-sheet";
import styles from "../our-wedding-story-v1.module.css";
import type { GiftLine, GiftPanel } from "./gift-panels";
import { MediaImage } from "./media-image";

const COPY = OUR_WEDDING_STORY_V1_COPY;

const LINE_LABEL: Readonly<Record<GiftLine["key"], string>> = Object.freeze({
  bankName: COPY.gift.bankName,
  accountName: COPY.gift.accountName,
  accountNumber: COPY.gift.accountNumber,
});

/** One side's bank card: label, its own `RESOLVED` QR, its canonical lines, and copy only with the capability. */
function BankCard({ panel, clipboard }: { panel: GiftPanel; clipboard: ClipboardCapabilityV1 | undefined }) {
  const sideLabel = COPY.sideLabel[panel.side];
  return (
    <div className={styles.bankCard} data-side={panel.side}>
      <div className={styles.bankSide}>{sideLabel}</div>
      {panel.qr === undefined ? null : (
        <div className={styles.bankQr}>
          <MediaImage media={panel.qr} alt={`${COPY.gift.qrAlt} ${sideLabel}`} className={styles.containImage} />
        </div>
      )}
      {panel.lines.length === 0 ? null : (
        <dl className={styles.bankRows}>
          {panel.lines.map((line) => (
            <div key={line.key} className={styles.bankRow} data-line={line.key}>
              <dt>{LINE_LABEL[line.key]}</dt>
              {line.key === "accountNumber" ? (
                <dd className={styles.bankNumberRow}>
                  <span className={styles.bankNumber}>{line.value}</span>
                  {clipboard === undefined ? null : <CopyAccountButton clipboard={clipboard} value={line.value} sideLabel={sideLabel} />}
                </dd>
              ) : (
                <dd>{line.value}</dd>
              )}
            </div>
          ))}
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
}

/**
 * Visual Freeze v1 wedding gift: on the page the caramel rule, the fixed note
 * and the "Gửi quà mừng cưới" button; the bank cards (one per side, stacked)
 * open in the bottom sheet island.
 */
export function Gift({ panels, clipboard }: GiftProps) {
  return (
    <div className={styles.giftBlock} data-island="gift">
      <span className={styles.giftRule} aria-hidden="true" />
      <p className={styles.giftNote}>{COPY.gift.pageNote}</p>
      <GiftSheet>
        {panels.map((panel) => (
          <BankCard key={panel.side} panel={panel} clipboard={clipboard} />
        ))}
      </GiftSheet>
    </div>
  );
}
