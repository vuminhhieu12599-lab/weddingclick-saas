import { describe, expect, it } from "vitest";

import { formatCoupleDisplayName } from "../sections/display-name";

// Product Owner ruling (Micro-Checkpoint 1): decorative couple names use the
// final two whitespace-separated tokens of the canonical name.
describe("formatCoupleDisplayName", () => {
  it("three tokens → the final two", () => {
    expect(formatCoupleDisplayName("Nguyễn Minh Khôi")).toBe("Minh Khôi");
    expect(formatCoupleDisplayName("Trần Ngọc Hân")).toBe("Ngọc Hân");
  });

  it("four or more tokens → the final two", () => {
    expect(formatCoupleDisplayName("Nguyễn Thị Ngọc Hân")).toBe("Ngọc Hân");
  });

  it("two tokens → unchanged", () => {
    expect(formatCoupleDisplayName("Minh Khôi")).toBe("Minh Khôi");
  });

  it("one token → unchanged", () => {
    expect(formatCoupleDisplayName("Khôi")).toBe("Khôi");
  });

  it("extra leading, trailing and inner whitespace is ignored", () => {
    expect(formatCoupleDisplayName("  Nguyễn   Minh \t Khôi  ")).toBe("Minh Khôi");
    expect(formatCoupleDisplayName(" Khôi ")).toBe("Khôi");
  });
});
