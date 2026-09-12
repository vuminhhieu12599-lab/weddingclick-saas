import { describe, expect, it } from "vitest";

import { formatVnd } from "../format-vnd";

describe("formatVnd", () => {
  it("formats an integer VND amount with thousands separators and the đ sign", () => {
    expect(formatVnd(15000000)).toBe("15.000.000 ₫");
  });

  it("formats zero", () => {
    expect(formatVnd(0)).toBe("0 ₫");
  });
});
