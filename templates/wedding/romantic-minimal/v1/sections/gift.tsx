import type {
  InvitationViewModel,
  MediaResolution,
  ViewModelGiftSide,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { ClipboardCapabilityV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import { CopyAccountButton } from "../interactive/copy-account-button";
import { GiftDialog } from "../interactive/gift-dialog";
import styles from "../romantic-minimal-v1.module.css";
import { Ornament } from "./invite";
import { MediaImage } from "./media-image";

const COPY = ROMANTIC_MINIMAL_V1_COPY;

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
  if (present(gift.bankAccountNumber)) lines.push({ key: "accountNumber", label: COPY.gift.accountNumber, value: gift.bankAccountNumber });
  return lines;
}

/** One side's honest details: its own `RESOLVED` QR on the white plate, then its canonical lines. */
function GiftDetails({ panel, clipboard }: { panel: GiftPanel; clipboard: ClipboardCapabilityV1 | undefined }) {
  const sideLabel = COPY.identity.labelBySide[panel.side];
  const lines = giftLines(panel.gift);
  const accountNumber = lines.find((line) => line.key === "accountNumber");
  return (
    <div>
      {panel.qr?.status === "RESOLVED" ? (
        <div className={styles.giftQr}>
          <MediaImage media={panel.qr} alt={`${COPY.gift.qrAlt} ${sideLabel}`} className={styles.giftQrImage} />
        </div>
      ) : null}
      {lines.length > 0 ? (
        <dl className={styles.giftInfo}>
          {lines.map((line) => (
            <div key={line.key} className={styles.giftInfoRow} data-line={line.key}>
              <dt>{line.label}</dt>
              <dd className={line.key === "accountNumber" ? styles.giftAccountNumber : undefined}>{line.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {accountNumber !== undefined && clipboard !== undefined ? (
        <CopyAccountButton clipboard={clipboard} value={accountNumber.value} sideLabel={sideLabel} />
      ) : null}
    </div>
  );
}

interface GiftProps {
  operationalSides: InvitationViewModel["operationalSides"];
  gift: InvitationViewModel["gift"];
  qr: InvitationViewModel["media"]["qr"];
  /** `capabilities.clipboard`, passed through by the root only; absent → no copy control. */
  clipboard: ClipboardCapabilityV1 | undefined;
}

/**
 * Task 029 wedding gift: on the page only the ornament, the fixed note and
 * the "Gửi mừng cưới" CTA; details stay in the dialog. One panel per
 * operational side (given order) with honest content: that side's own
 * `RESOLVED` QR (no placeholder, no common QR) and its canonical lines. With
 * no side holding honest content the section renders nothing.
 */
export function Gift({ operationalSides, gift, qr, clipboard }: GiftProps) {
  const panels = operationalSides
    .map((side): GiftPanel => (side === "GROOM" ? { side, gift: gift.groom, qr: qr.groom } : { side, gift: gift.bride, qr: qr.bride }))
    .filter((panel) => panel.qr?.status === "RESOLVED" || giftLines(panel.gift).length > 0);
  if (panels.length === 0) return null;

  return (
    <section className={styles.giftSection} aria-labelledby="rm-gift-heading" data-island="gift">
      <h2 id="rm-gift-heading" className={styles.srOnly}>
        {COPY.gift.heading}
      </h2>
      <div className={styles.giftReveal}>
        <Ornament />
        <p className={styles.giftNote}>{COPY.gift.intro}</p>
        <GiftDialog
          panels={panels.map((panel) => ({
            side: panel.side,
            label: COPY.identity.labelBySide[panel.side],
            content: <GiftDetails panel={panel} clipboard={clipboard} />,
          }))}
        />
      </div>
    </section>
  );
}
