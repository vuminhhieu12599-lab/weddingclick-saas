import type { ServiceAddonCode, ServicePackageCode } from "../domain";

/**
 * LAUNCH-P0-04 — public price list presentation (CLAUDE.md §16).
 *
 * The authoritative current catalog is `service_packages` / `service_addons`
 * (seeded by migration 0003). Those tables are Staff-only under RLS and the
 * homepage must not weaken that, so this is a centralized, typed
 * presentation copy keyed by the stable catalog codes. A focused test
 * (`__tests__/showroom-pricing.test.ts`) pins every amount to the migration
 * seed, so a catalog change cannot silently diverge from the public page.
 * Projects keep their own agreed price snapshots; nothing here is used to
 * price an order.
 *
 * Pricing is per package, independent of the chosen template design.
 */

export interface ShowroomPackageOffer {
  readonly code: ServicePackageCode;
  readonly nameVi: string;
  readonly priceVnd: number;
  readonly summaryVi: string;
  readonly includesVi: readonly string[];
  /** Visually emphasized (most chosen layout), never a claim about sales. */
  readonly highlighted: boolean;
}

export interface ShowroomAddonOffer {
  readonly code: ServiceAddonCode;
  readonly nameVi: string;
  readonly priceVnd: number;
  readonly summaryVi: string;
}

const SHARED_INCLUDES = [
  "Chọn bất kỳ mẫu thiệp nào trong bộ sưu tập",
  "Xác nhận tham dự (RSVP) cho khách mời",
  "Chỉ đường Google Maps tới nơi tổ chức",
  "Album ảnh cưới và thông tin mừng cưới",
  "Nhân viên WeddingClick hỗ trợ dựng thiệp",
] as const;

export const SHOWROOM_PACKAGE_OFFERS: readonly ShowroomPackageOffer[] = Object.freeze([
  {
    code: "COMMON",
    nameVi: "Thiệp chung hai bên",
    priceVnd: 150000,
    summaryVi: "Một thiệp chung cho cả nhà trai và nhà gái.",
    includesVi: ["Một đường link thiệp chung", ...SHARED_INCLUDES],
    highlighted: false,
  },
  {
    code: "SEPARATE",
    nameVi: "Thiệp riêng nhà trai / nhà gái",
    priceVnd: 250000,
    summaryVi: "Hai thiệp riêng: nhà trai (Lễ Thành Hôn) và nhà gái (Lễ Vu Quy).",
    includesVi: ["Hai đường link riêng cho mỗi nhà", ...SHARED_INCLUDES],
    highlighted: true,
  },
]);

export const SHOWROOM_ADDON_OFFERS: readonly ShowroomAddonOffer[] = Object.freeze([
  {
    code: "PERSONALIZED_GUEST",
    nameVi: "Cá nhân hoá tên khách mời",
    priceVnd: 50000,
    summaryVi: "Mỗi khách nhận một đường link riêng có tên của mình trên thiệp. Thêm vào gói nào cũng được.",
  },
]);
