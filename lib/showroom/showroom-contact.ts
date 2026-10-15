/**
 * LAUNCH-P0-04 — the one centralized public contact configuration.
 *
 * Read only on the server from two environment variables, set per Vercel
 * environment by the Product Owner (never committed, never invented):
 *
 * - `WEDDINGCLICK_CONTACT_ZALO_PHONE` — the business Zalo phone number;
 * - `WEDDINGCLICK_CONTACT_HOTLINE`    — the business call number.
 *
 * Each must be a Vietnamese mobile number (`0xxxxxxxxx` or `+84xxxxxxxxx`;
 * spaces, dots and dashes are ignored). Anything else (unset, empty, a
 * placeholder such as `sodienthoaicuaban`) yields "not configured": the
 * public pages then show no Zalo/call button at all rather than a broken or
 * fake link. Phone numbers are public business contacts, not secrets.
 *
 * `https://zalo.me/<phone>` opens a chat with that number. It does NOT
 * pre-fill a message, so the consultation page offers a copyable message
 * that names the selected template.
 */

export interface ShowroomContactChannel {
  /** Display form, e.g. "0901 234 567". */
  readonly display: string;
  readonly href: string;
}

export interface ShowroomContact {
  readonly zalo: ShowroomContactChannel | null;
  readonly hotline: ShowroomContactChannel | null;
}

export type ShowroomContactEnv = Readonly<Record<string, string | undefined>>;

const VIETNAMESE_MOBILE_PATTERN = /^0[35789][0-9]{8}$/;

/** Canonical national form `0xxxxxxxxx`, or `null` when not a valid Vietnamese mobile number. */
export function normalizeVietnameseMobile(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const compact = raw.trim().replace(/[\s.\-()]/g, "");
  const national = compact.startsWith("+84") ? `0${compact.slice(3)}` : compact.startsWith("84") && compact.length === 11 ? `0${compact.slice(2)}` : compact;
  return VIETNAMESE_MOBILE_PATTERN.test(national) ? national : null;
}

function displayPhone(national: string): string {
  return `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`;
}

export function resolveShowroomContact(env: ShowroomContactEnv): ShowroomContact {
  const zalo = normalizeVietnameseMobile(env.WEDDINGCLICK_CONTACT_ZALO_PHONE);
  const hotline = normalizeVietnameseMobile(env.WEDDINGCLICK_CONTACT_HOTLINE);
  return Object.freeze({
    zalo: zalo === null ? null : Object.freeze({ display: displayPhone(zalo), href: `https://zalo.me/${zalo}` }),
    hotline: hotline === null ? null : Object.freeze({ display: displayPhone(hotline), href: `tel:+84${hotline.slice(1)}` }),
  });
}

export function hasAnyShowroomContact(contact: ShowroomContact): boolean {
  return contact.zalo !== null || contact.hotline !== null;
}

/** Server-only accessor for the deployed environment. */
export function getShowroomContact(): ShowroomContact {
  return resolveShowroomContact({
    WEDDINGCLICK_CONTACT_ZALO_PHONE: process.env.WEDDINGCLICK_CONTACT_ZALO_PHONE,
    WEDDINGCLICK_CONTACT_HOTLINE: process.env.WEDDINGCLICK_CONTACT_HOTLINE,
  });
}

/**
 * The consultation message a visitor copies into Zalo. Names the template by
 * its Vietnamese name AND its stable code, so Staff can identify it exactly.
 */
export function buildConsultationMessage(template: { readonly nameVi: string; readonly templateCode: string } | null): string {
  if (template === null) {
    return "Chào WeddingClick, mình muốn được tư vấn làm thiệp cưới online.";
  }
  return `Chào WeddingClick, mình muốn tư vấn làm thiệp cưới online theo mẫu “${template.nameVi}” (mã mẫu: ${template.templateCode}).`;
}
