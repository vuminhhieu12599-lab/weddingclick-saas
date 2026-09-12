import type { PaymentStatus } from "../domain";

const PAYMENT_STATUS_LABELS_VI: Record<PaymentStatus, string> = {
  UNPAID: "Chưa thanh toán",
  PAID: "Đã thanh toán",
};

export function getPaymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABELS_VI[status];
}
