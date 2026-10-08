import type {
  InvitationViewModel,
  MediaResolution,
  ViewModelGiftSide,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { LotusMark } from "./decor";
import { MediaImage } from "./media-image";

const COPY = VIETNAMESE_HERITAGE_V1_COPY;

interface GiftPanel {
  side: CoupleSide;
  gift: ViewModelGiftSide | undefined;
  qr: MediaResolution | undefined;
}

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

interface GiftLine {
  key: "bankName" | "accountName" | "accountNumber";
  label: string;
  value: string;
}

/** The side's canonical lines in fixed order; a null or blank value is omitted. */
function giftLines(gift: ViewModelGiftSide | undefined): GiftLine[] {
  if (gift === undefined) return [];
  const lines: GiftLine[] = [];
  if (present(gift.bankName)) lines.push({ key: "bankName", label: COPY.gift.bankName, value: gift.bankName });
  if (present(gift.bankAccountName)) lines.push({ key: "accountName", label: COPY.gift.accountName, value: gift.bankAccountName });
  if (present(gift.bankAccountNumber)) {
    lines.push({ key: "accountNumber", label: COPY.gift.accountNumber, value: gift.bankAccountNumber });
  }
  return lines;
}

interface GiftProps {
  operationalSides: InvitationViewModel["operationalSides"];
  gift: InvitationViewModel["gift"];
  qr: InvitationViewModel["media"]["qr"];
}

/**
 * Task 029 Wedding Gift, VH-02A static entry/preview composition: the lotus,
 * the gift title and the fixed intro note on ivory paper, then one panel per
 * operational side (given order) styled as the approved gift card: that
 * side's own `media.qr.<side>` in a white QR plate only when `RESOLVED`, and
 * its canonical bank, holder and account-number lines (null lines omitted;
 * a side without content is not shown; no common QR, RF13). The tap-to-open
 * dialog, Nhà Trai / Nhà Gái tabs and the copy control
 * (`capabilities.clipboard`) are the VH-02B island.
 */
export function Gift({ operationalSides, gift, qr }: GiftProps) {
  const panels = operationalSides
    .map((side): GiftPanel => (side === "GROOM" ? { side, gift: gift.groom, qr: qr.groom } : { side, gift: gift.bride, qr: qr.bride }))
    .filter((panel) => panel.qr?.status === "RESOLVED" || giftLines(panel.gift).length > 0);

  return (
    <section className={styles.gift} aria-labelledby="vh-gift-heading" data-island="gift">
      <LotusMark className={styles.giftLotus} />
      <h2 id="vh-gift-heading" className={styles.giftTitle}>
        {COPY.gift.heading}
      </h2>
      <p className={styles.giftIntro}>{COPY.gift.intro}</p>
      {panels.map((panel) => (
        <div key={panel.side} className={styles.giftPanel} data-side={panel.side}>
          <h3 className={styles.giftSide}>{COPY.ceremonial.labelBySide[panel.side]}</h3>
          {panel.qr?.status === "RESOLVED" ? (
            <div className={styles.giftQr}>
              <MediaImage
                media={panel.qr}
                alt={`${COPY.gift.qrAlt} ${COPY.ceremonial.labelBySide[panel.side]}`}
                className={styles.giftQrImage}
              />
            </div>
          ) : null}
          <dl className={styles.giftLines}>
            {giftLines(panel.gift).map((line) => (
              <div key={line.key} className={styles.giftLine} data-line={line.key}>
                <dt>{line.label}</dt>
                <dd className={line.key === "accountNumber" ? styles.giftAccountNumber : undefined}>{line.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}
