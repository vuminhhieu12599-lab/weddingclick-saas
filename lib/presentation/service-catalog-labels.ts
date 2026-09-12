import { SERVICE_ADDON_CODES, SERVICE_PACKAGE_CODES, type ServiceAddonCode, type ServicePackageCode } from "../domain";

/**
 * Presentation-only Vietnamese labels for the commercial catalog
 * (migration 0003_catalog_packages_addons.sql seed names are English).
 * Never mutates stored `service_packages`/`service_addons` catalog rows or
 * `*_snapshot` columns — mapping is keyed by the stable catalog `code`, with
 * the already-stored snapshot name as a safe fallback for any future code
 * this UI doesn't yet recognize (CLAUDE.md §16 "Do not hard-code prices
 * throughout UI components" extends to not hard-coding catalog identity —
 * only display wording is mapped here).
 */
const PACKAGE_LABELS_VI: Record<ServicePackageCode, string> = {
  COMMON: "Thiệp chung hai bên",
  SEPARATE: "Thiệp riêng nhà trai / nhà gái",
};

const ADDON_LABELS_VI: Record<ServiceAddonCode, string> = {
  PERSONALIZED_GUEST: "Cá nhân hóa tên khách mời",
};

function isPackageCode(value: string): value is ServicePackageCode {
  return (SERVICE_PACKAGE_CODES as readonly string[]).includes(value);
}

function isAddonCode(value: string): value is ServiceAddonCode {
  return (SERVICE_ADDON_CODES as readonly string[]).includes(value);
}

export function getPackageLabel(codeSnapshot: string, nameSnapshot: string): string {
  return isPackageCode(codeSnapshot) ? PACKAGE_LABELS_VI[codeSnapshot] : nameSnapshot;
}

export function getAddonLabel(codeSnapshot: string, nameSnapshot: string): string {
  return isAddonCode(codeSnapshot) ? ADDON_LABELS_VI[codeSnapshot] : nameSnapshot;
}
