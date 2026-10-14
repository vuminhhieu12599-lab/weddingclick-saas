import type {
  InvitationViewModel,
  MediaResolution,
  ResolvedMedia,
  ViewModelGiftSide,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";

/** One canonical gift line, in fixed order; a null or blank value is never a line. */
export interface GiftLine {
  readonly key: "bankName" | "accountName" | "accountNumber";
  readonly value: string;
}

/** One operational side with honest gift content: its own `RESOLVED` QR and/or canonical lines. */
export interface GiftPanel {
  readonly side: CoupleSide;
  readonly qr: ResolvedMedia | undefined;
  readonly lines: readonly GiftLine[];
}

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

export function giftLines(gift: ViewModelGiftSide | undefined): GiftLine[] {
  if (gift === undefined) return [];
  const lines: GiftLine[] = [];
  if (present(gift.bankName)) lines.push({ key: "bankName", value: gift.bankName });
  if (present(gift.bankAccountName)) lines.push({ key: "accountName", value: gift.bankAccountName });
  if (present(gift.bankAccountNumber)) lines.push({ key: "accountNumber", value: gift.bankAccountNumber });
  return lines;
}

function resolvedQr(qr: MediaResolution | undefined): ResolvedMedia | undefined {
  return qr?.status === "RESOLVED" ? qr : undefined;
}

/**
 * One panel per operational side, in the given order (COMMON both, GROOM /
 * BRIDE that side only), each side reading only its own gift data and its
 * own semantic QR (no common QR, no placeholder). Sides without honest
 * content are dropped; with none left the gift block is not rendered.
 */
export function giftPanels(
  operationalSides: InvitationViewModel["operationalSides"],
  gift: InvitationViewModel["gift"],
  qr: InvitationViewModel["media"]["qr"],
): GiftPanel[] {
  return operationalSides
    .map((side): GiftPanel =>
      side === "GROOM"
        ? { side, qr: resolvedQr(qr.groom), lines: giftLines(gift.groom) }
        : { side, qr: resolvedQr(qr.bride), lines: giftLines(gift.bride) },
    )
    .filter((panel) => panel.qr !== undefined || panel.lines.length > 0);
}
