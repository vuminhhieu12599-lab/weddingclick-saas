import { describe, expect, it } from "vitest";

import { FIXTURE_GUESTS } from "../../../../core/fixtures/renderer-fixture-sources";
import { ELEGANT_EDITORIAL_V1_COPY as COPY } from "../copy";

/**
 * RF-06D fixed interactive copy (docs/DECISIONS.md "RF-06-0 …" P10): every
 * new control label, status and result text is versioned v1 copy in
 * copy.ts, and none of it is customer data.
 */

const D_COPY = {
  opening: { open: COPY.opening.open, skip: COPY.opening.skip, controlsLabel: COPY.opening.controlsLabel },
  gift: {
    openDialog: COPY.gift.openDialog,
    dialogTitle: COPY.gift.dialogTitle,
    closeDialog: COPY.gift.closeDialog,
    copyAccountNumber: COPY.gift.copyAccountNumber,
    copyAccountNumberTarget: COPY.gift.copyAccountNumberTarget,
    copyPending: COPY.gift.copyPending,
    copySucceeded: COPY.gift.copySucceeded,
    copyFailed: COPY.gift.copyFailed,
    copyUnavailable: COPY.gift.copyUnavailable,
  },
  countdown: COPY.countdown,
  music: COPY.music,
  rsvp: COPY.rsvp,
};

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

describe("RF-06D fixed copy", () => {
  it("every D string is non-blank, trimmed and frozen with the rest of v1 copy", () => {
    const texts = strings(D_COPY);
    expect(texts.length).toBeGreaterThan(40);
    for (const text of texts) {
      expect(text.trim().length, text).toBeGreaterThan(0);
      expect(text, text).toBe(text.trim());
    }
    for (const group of [COPY.countdown, COPY.countdown.units, COPY.music, COPY.rsvp, COPY.rsvp.errors, COPY.rsvp.results]) {
      expect(Object.isFrozen(group)).toBe(true);
    }
  });

  it("contains no names, dates, weekdays, places, account values or guest names", () => {
    const text = JSON.stringify(D_COPY);
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/Thứ (Hai|Ba|Tư|Năm|Sáu|Bảy)|Chủ Nhật|Đà Nẵng|Hồ Chí Minh|Nguyễn|Trần|VND/);
    for (const guest of Object.values(FIXTURE_GUESTS)) expect(text).not.toContain(guest.displayName);
  });

  it("RSVP copy covers exactly the two attendance choices and the four frozen results", () => {
    expect(Object.keys(COPY.rsvp.attendanceLabels)).toStrictEqual(["ATTENDING", "NOT_ATTENDING"]);
    expect(Object.keys(COPY.rsvp.results).sort()).toStrictEqual(["FAILED", "INVALID", "SUCCESS", "UNAVAILABLE"]);
    expect(JSON.stringify(COPY)).not.toMatch(/\bMAYBE\b|QR_COMMON|Có thể|Sẽ cố gắng/);
  });

  it("music copy has no unavailable/placeholder text (P35: absence is the degraded state)", () => {
    expect(Object.keys(COPY.music).sort()).toStrictEqual(["blocked", "commandFailed", "error", "toggle"]);
    expect(JSON.stringify(COPY.music)).not.toMatch(/không khả dụng|unavailable/i);
  });

  it("countdown units match the four frozen RF-05C parts", () => {
    expect(Object.keys(COPY.countdown.units)).toStrictEqual(["days", "hours", "minutes", "seconds"]);
  });
});
