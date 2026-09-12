import { describe, expect, it } from "vitest";

import { PAYMENT_STATUSES } from "../../domain";
import { getPaymentStatusLabel } from "../payment-status-labels";

describe("getPaymentStatusLabel", () => {
  it("has a Vietnamese label for every PaymentStatus", () => {
    for (const status of PAYMENT_STATUSES) {
      expect(getPaymentStatusLabel(status).length).toBeGreaterThan(0);
    }
  });
});
