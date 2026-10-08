import type {
  InvitationViewModel,
  MediaResolution,
  ViewModelGiftSide,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { ClipboardCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import { CopyAccountButton } from "../interactive/copy-account-button";
import { GiftDialog } from "../interactive/gift-dialog";
import styles from "../vietnamese-heritage-v1.module.css";
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
  /** `capabilities.clipboard`, passed through by the root only; absent → no copy control. */
  clipboard: ClipboardCapabilityV1 | undefined;
}

/** One side's honest details: its own `RESOLVED` QR in a white plate, then its canonical lines. */
function GiftDetails({ panel, clipboard }: { panel: GiftPanel; clipboard: ClipboardCapabilityV1 | undefined }) {
  const sideLabel = COPY.ceremonial.labelBySide[panel.side];
  return (
    <div className={styles.giftDetails}>
      {panel.qr?.status === "RESOLVED" ? (
        <div className={styles.giftQr}>
          <MediaImage media={panel.qr} alt={`${COPY.gift.qrAlt} ${sideLabel}`} className={styles.giftQrImage} />
        </div>
      ) : null}
      <dl className={styles.giftLines}>
        {giftLines(panel.gift).map((line) => (
          <div key={line.key} className={styles.giftLine} data-line={line.key}>
            <dt>{line.label}</dt>
            <dd className={line.key === "accountNumber" ? styles.giftAccountNumber : undefined}>{line.value}</dd>
            {line.key === "accountNumber" && clipboard !== undefined ? (
              <dd className={styles.giftLineAction}>
                <CopyAccountButton clipboard={clipboard} value={line.value} sideLabel={sideLabel} />
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Task 029 Wedding Gift entry (docs/DECISIONS.md "VH-02B-E1"): on ivory
 * paper only the fixed intro note and the "Gửi Quà Cưới" CTA; the details
 * stay in the gift dialog until the guest asks for them. One panel per
 * operational side (given order) with honest content: that side's own
 * `media.qr.<side>` only when `RESOLVED` (an `UNAVAILABLE` QR is simply
 * absent, never replaced; no common QR, RF13) and its canonical bank,
 * holder and account-number lines (blank lines omitted). With no side
 * holding honest content the section renders nothing: no empty CTA, no
 * empty dialog. The copy control exists only with `capabilities.clipboard`.
 */
export function Gift({ operationalSides, gift, qr, clipboard }: GiftProps) {
  const panels = operationalSides
    .map((side): GiftPanel => (side === "GROOM" ? { side, gift: gift.groom, qr: qr.groom } : { side, gift: gift.bride, qr: qr.bride }))
    .filter((panel) => panel.qr?.status === "RESOLVED" || giftLines(panel.gift).length > 0);
  if (panels.length === 0) {
    return null;
  }

  return (
    <section className={styles.gift} aria-labelledby="vh-gift-heading" data-island="gift">
      <h2 id="vh-gift-heading" className={styles.srOnly}>
        {COPY.gift.heading}
      </h2>
      <p className={styles.giftIntro}>{COPY.gift.intro}</p>
      <GiftDialog
        panels={panels.map((panel) => ({
          side: panel.side,
          label: COPY.ceremonial.labelBySide[panel.side],
          content: <GiftDetails panel={panel} clipboard={clipboard} />,
        }))}
      />
    </section>
  );
}
