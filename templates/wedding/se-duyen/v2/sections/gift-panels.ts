import type {
  InvitationViewModel,
  MediaResolution,
  ResolvedMedia,
  ViewModelGiftSide,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";

/**
 * Se Duyên v1 — which family's gift details the slip can show (SD-V1-02C2).
 *
 * Pure and deterministic: no React, no media access, no business rule. It
 * reads only the canonical per-side gift fields and that side's own semantic
 * QR, and decides nothing about variants — `operationalSides` arrives from
 * the one central resolver (COMMON both sides, GROOM and BRIDE their own).
 *
 * A row exists only for a canonical value that is actually there: a null or
 * blank bank name, account holder or account number is simply not a row, and
 * a side's QR is used only when it RESOLVED. There is no common QR (RF13,
 * S9), no placeholder, no generated code and no substitution between sides.
 *
 * A side with neither a QR nor a single row is dropped rather than shown as
 * an empty slip; with no side left the whole envelope is not rendered.
 */

/** One canonical gift row, in the approved slip order. */
export interface GiftRow {
  readonly key: "bankName" | "accountName" | "accountNumber";
  readonly value: string;
}

/** One operational side with honest gift content. */
export interface GiftPanel {
  readonly side: CoupleSide;
  readonly qr: ResolvedMedia | undefined;
  readonly rows: readonly GiftRow[];
}

function present(value: string | null): value is string {
  return value !== null && value.trim() !== "";
}

export function giftRows(gift: ViewModelGiftSide | undefined): GiftRow[] {
  if (gift === undefined) return [];
  const rows: GiftRow[] = [];
  if (present(gift.bankName)) rows.push({ key: "bankName", value: gift.bankName });
  if (present(gift.bankAccountName)) rows.push({ key: "accountName", value: gift.bankAccountName });
  if (present(gift.bankAccountNumber)) rows.push({ key: "accountNumber", value: gift.bankAccountNumber });
  return rows;
}

function resolvedQr(qr: MediaResolution | undefined): ResolvedMedia | undefined {
  return qr?.status === "RESOLVED" ? qr : undefined;
}

/** One panel per operational side with content, in the resolver's own order. */
export function giftPanels(
  operationalSides: InvitationViewModel["operationalSides"],
  gift: InvitationViewModel["gift"],
  qr: InvitationViewModel["media"]["qr"],
): GiftPanel[] {
  return operationalSides
    .map((side): GiftPanel =>
      side === "GROOM"
        ? { side, qr: resolvedQr(qr.groom), rows: giftRows(gift.groom) }
        : { side, qr: resolvedQr(qr.bride), rows: giftRows(gift.bride) },
    )
    .filter((panel) => panel.qr !== undefined || panel.rows.length > 0);
}

/** The account number of a panel, when it has one; the only copyable value. */
export function accountNumberOf(panel: GiftPanel): string | undefined {
  return panel.rows.find((row) => row.key === "accountNumber")?.value;
}
