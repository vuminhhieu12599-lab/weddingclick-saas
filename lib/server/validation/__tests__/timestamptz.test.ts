import { describe, expect, it } from "vitest";

import { isValidTimestamptz } from "../timestamptz";

describe("isValidTimestamptz", () => {
  it.each([
    "2026-09-20T17:00:00+07:00",
    "2026-09-20T10:00:00Z",
    "2026-09-20T10:00:00.123Z",
  ])("accepts %s", (value) => {
    expect(isValidTimestamptz(value)).toBe(true);
  });

  it.each([
    "2026-09-20",
    "2026-09-20T17:00:00",
    "09/20/2026 17:00",
    "2026-02-30T17:00:00+07:00",
    "not-a-date",
  ])("rejects %s", (value) => {
    expect(isValidTimestamptz(value)).toBe(false);
  });

  it("accepts a leap-year Feb 29", () => {
    expect(isValidTimestamptz("2028-02-29T00:00:00Z")).toBe(true);
  });

  it("rejects a non-leap-year Feb 29", () => {
    expect(isValidTimestamptz("2026-02-29T00:00:00Z")).toBe(false);
  });

  it("rejects an out-of-range offset", () => {
    expect(isValidTimestamptz("2026-09-20T17:00:00+24:00")).toBe(false);
  });

  it("rejects an out-of-range time", () => {
    expect(isValidTimestamptz("2026-09-20T24:00:00Z")).toBe(false);
    expect(isValidTimestamptz("2026-09-20T17:60:00Z")).toBe(false);
    expect(isValidTimestamptz("2026-09-20T17:00:60Z")).toBe(false);
  });

  it("rejects a lowercase t/z variant", () => {
    expect(isValidTimestamptz("2026-09-20t17:00:00z")).toBe(false);
  });
});
