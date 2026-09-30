import type {
  InvitationViewModel,
  MediaResolution,
  ViewModelGiftSide,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { CopyAccountButton, type CopyAccountButtonProps } from "../interactive/copy-account-button";
import { GiftDialog } from "../interactive/gift-dialog";
import { MediaImage } from "./media-image";

const COPY = ELEGANT_EDITORIAL_V1_COPY;

interface GiftProps {
  operationalSides: InvitationViewModel["operationalSides"];
  gift: InvitationViewModel["gift"];
  qr: InvitationViewModel["media"]["qr"];
  /** RF-06D: `capabilities.clipboard` as given; absent means no copy control at all (P34). */
  clipboard: CopyAccountButtonProps["clipboard"] | undefined;
}

interface BankLine {
  key: "bankName" | "accountName" | "accountNumber";
  label: string;
  value: string;
}

interface GiftSidePresentation {
  side: CoupleSide;
  lines: BankLine[];
  qr: MediaResolution | undefined;
}

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function bankLines(giftSide: ViewModelGiftSide): BankLine[] {
  const lines: BankLine[] = [];
  if (present(giftSide.bankName)) lines.push({ key: "bankName", label: COPY.gift.bankName, value: giftSide.bankName });
  if (present(giftSide.bankAccountName)) {
    lines.push({ key: "accountName", label: COPY.gift.accountName, value: giftSide.bankAccountName });
  }
  if (present(giftSide.bankAccountNumber)) {
    lines.push({ key: "accountNumber", label: COPY.gift.accountNumber, value: giftSide.bankAccountNumber });
  }
  return lines;
}

/**
 * Explicit side → canonical slot mapping: `GROOM` reads `gift.groom` and
 * `media.qr.groom`, `BRIDE` reads `gift.bride` and `media.qr.bride`. There is
 * no common account and no common QR (RF13, S9).
 */
function sidePresentation(
  side: CoupleSide,
  gift: GiftProps["gift"],
  qr: GiftProps["qr"],
): GiftSidePresentation | undefined {
  const giftSide = side === "GROOM" ? gift.groom : gift.bride;
  if (giftSide === undefined) {
    return undefined;
  }
  const presentation = { side, lines: bankLines(giftSide), qr: side === "GROOM" ? qr.groom : qr.bride };
  // Nothing honest to show: no bank text and no displayable QR.
  if (presentation.lines.length === 0 && presentation.qr?.status !== "RESOLVED") {
    return undefined;
  }
  return presentation;
}

/**
 * Gift information (P7). Sides present in `viewModel.gift`, in
 * `operationalSides` order. Each side shows its non-blank canonical bank
 * text and its QR when `RESOLVED`. An `UNAVAILABLE` QR keeps the bank text
 * and adds fixed unavailable copy. A side with no bank text and no
 * displayable QR is omitted, and a gift block with no side left is not
 * rendered, so the RF-06D dialog entry point never opens an empty dialog.
 * Visibility is otherwise decided by the caller from `sections.gift` only.
 *
 * RF-06B static layer (Design Baseline B5 item 15): placed after RSVP and
 * before Gallery by the root, the Task029 note on ivory, and no visible
 * section heading (an accessible name only). The entry-point control, its
 * copy and the dialog presentation belong to the RF-06D island.
 *
 * RF-06D: the sides live inside the gift dialog island. A copy control is
 * added next to a non-blank canonical account number only when a clipboard
 * capability is present; the bank text stays selectable either way.
 */
export function Gift({ operationalSides, gift, qr, clipboard }: GiftProps) {
  const sides = operationalSides
    .map((side) => sidePresentation(side, gift, qr))
    .filter((presentation): presentation is GiftSidePresentation => presentation !== undefined);

  if (sides.length === 0) {
    return null;
  }

  return (
    <section className={styles.giftBlock} aria-labelledby="ee-gift-heading">
      <h2 id="ee-gift-heading" className={styles.srOnly}>
        {COPY.gift.heading}
      </h2>
      <p className={styles.giftIntro}>{COPY.gift.intro}</p>
      <GiftDialog>
        <div className={styles.giftSides}>
          {sides.map(({ side, lines, qr: sideQr }) => {
            const sideLabel = COPY.families.labelBySide[side];
            return (
              <article key={side} className={styles.giftSide} data-side={side}>
                <h3 className={styles.giftSideLabel}>{sideLabel}</h3>
                {sideQr?.status === "RESOLVED" ? (
                  <MediaImage media={sideQr} alt={`${COPY.gift.qrAltPrefix} ${sideLabel}`} className={styles.giftQr} />
                ) : null}
                {lines.length > 0 ? (
                  <dl className={styles.giftLines}>
                    {lines.map((line) => (
                      <div key={line.key} className={styles.giftLine}>
                        <dt className={styles.giftLineLabel}>{line.label}</dt>
                        <dd className={line.key === "accountNumber" ? styles.giftAccountNumber : styles.giftLineValue}>
                          {line.value}
                        </dd>
                        {line.key === "accountNumber" && clipboard !== undefined ? (
                          <dd className={styles.giftLineAction}>
                            <CopyAccountButton clipboard={clipboard} value={line.value} sideLabel={sideLabel} />
                          </dd>
                        ) : null}
                      </div>
                    ))}
                  </dl>
                ) : null}
                {sideQr?.status === "UNAVAILABLE" ? (
                  <p className={styles.giftQrUnavailable} data-qr-state="unavailable">
                    {COPY.gift.qrUnavailable}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </GiftDialog>
    </section>
  );
}
