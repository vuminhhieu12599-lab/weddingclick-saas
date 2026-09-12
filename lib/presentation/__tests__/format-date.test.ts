import { describe, expect, it } from "vitest";

import { formatDateTimeVi, formatDateVi } from "../format-date";

describe("formatDateVi", () => {
  it("formats an ISO timestamp in Asia/Ho_Chi_Minh as dd/MM/yyyy", () => {
    // 2026-09-12T17:05:00Z is 2026-09-13 00:05 in Asia/Ho_Chi_Minh (UTC+7).
    expect(formatDateVi("2026-09-12T17:05:00Z")).toBe("13/09/2026");
  });

  it("returns a placeholder for null", () => {
    expect(formatDateVi(null)).toBe("Chưa có");
  });

  it("returns a placeholder for an unparseable value", () => {
    expect(formatDateVi("not-a-date")).toBe("Chưa có");
  });
});

describe("formatDateTimeVi", () => {
  it("includes the time alongside the date", () => {
    expect(formatDateTimeVi("2026-09-12T17:05:00Z")).toBe("13/09/2026 00:05");
  });

  it("returns a placeholder for null", () => {
    expect(formatDateTimeVi(null)).toBe("Chưa có");
  });
});
