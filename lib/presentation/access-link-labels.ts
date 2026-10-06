import type { AccessLinkType } from "../domain";
import type { AccessLinkStatus } from "../server/access-links/access-link-inventory-types";

/** Launch Hardening 02 / P0-1 — staff labels for capability links. */
export const ACCESS_LINK_TYPE_LABELS: Readonly<Record<AccessLinkType, string>> = {
  PORTAL: "Cổng khách hàng",
  REVIEW: "Duyệt thiệp",
  INTAKE: "Thu thập thông tin",
};

export const ACCESS_LINK_STATUS_LABELS: Readonly<Record<AccessLinkStatus, string>> = {
  ACTIVE: "Đang hoạt động",
  EXPIRED: "Đã hết hạn",
  REVOKED: "Đã thu hồi",
};
