import type { ApprovalChannel } from "../domain";

/** TE-06 — staff labels for how the customer confirmed an approval (migration 0053). */
export const APPROVAL_CHANNEL_LABELS: Readonly<Record<ApprovalChannel, string>> = {
  ZALO: "Zalo",
  PHONE: "Điện thoại",
  IN_PERSON: "Gặp trực tiếp",
  OTHER: "Kênh khác",
};
