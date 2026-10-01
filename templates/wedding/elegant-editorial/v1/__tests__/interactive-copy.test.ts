import { describe, expect, it } from "vitest";

import { FIXTURE_GUESTS } from "../../../../core/fixtures/renderer-fixture-sources";
import { ELEGANT_EDITORIAL_V1_COPY as COPY } from "../copy";

/**
 * RF-06D fixed interactive copy (docs/DECISIONS.md "RF-06-0 …" P10): every
 * new control label, status and result text is versioned v1 copy in
 * copy.ts, and none of it is customer data.
 */

const D_COPY = {
  opening: { openEnvelope: COPY.opening.openEnvelope, hint: COPY.opening.hint },
  gift: {
    openDialog: COPY.gift.openDialog,
    closeDialog: COPY.gift.closeDialog,
    copyAccountNumber: COPY.gift.copyAccountNumber,
    copyAccountNumberTarget: COPY.gift.copyAccountNumberTarget,
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
    for (const group of [COPY.countdown, COPY.countdown.units, COPY.music, COPY.rsvp, COPY.rsvp.errors, COPY.rsvp.results, COPY.rsvp.success]) {
      expect(Object.isFrozen(group)).toBe(true);
    }
  });

  it("contains no names, dates, weekdays, places, account values or guest names", () => {
    const text = JSON.stringify(D_COPY);
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/Thứ (Hai|Ba|Tư|Năm|Sáu|Bảy)|Chủ Nhật|Đà Nẵng|Hồ Chí Minh|Nguyễn|Trần|VND/);
    for (const guest of Object.values(FIXTURE_GUESTS)) expect(text).not.toContain(guest.displayName);
  });

  it("RSVP copy covers exactly the three attendance choices, the three non-success results and the D11 success wording", () => {
    expect(Object.keys(COPY.rsvp.attendanceLabels)).toStrictEqual(["ATTENDING", "MAYBE", "NOT_ATTENDING"]);
    expect(Object.keys(COPY.rsvp.results).sort()).toStrictEqual(["FAILED", "INVALID", "UNAVAILABLE"]);
    expect(Object.keys(COPY.rsvp.success)).toStrictEqual(["thanks", "responded", "attendingTail", "notAttendingTail"]);
    expect(JSON.stringify(COPY)).not.toMatch(/QR_COMMON|Có thể/);  // MAYBE / "Sẽ cố gắng tham dự" are canonical since the RSVP completion amendment.
  });

  it("music copy has no unavailable/placeholder text (P35: absence is the degraded state)", () => {
    expect(Object.keys(COPY.music).sort()).toStrictEqual(["blocked", "commandFailed", "error", "toggle"]);
    expect(JSON.stringify(COPY.music)).not.toMatch(/không khả dụng|unavailable/i);
  });

  it("countdown units match the four frozen RF-05C parts", () => {
    expect(Object.keys(COPY.countdown.units)).toStrictEqual(["days", "hours", "minutes", "seconds"]);
  });
});

describe("Task029 / Design Baseline exact RF-06D copy (B6)", () => {
  it("every D string maps to its approved source", () => {
    expect(COPY.opening).toMatchObject({ openEnvelope: "Mở thiệp mời", hint: "Chạm vào thiệp để mở" });
    expect(COPY.opening).not.toHaveProperty("skip");
    expect(COPY.countdown).toMatchObject({ heading: "Đếm ngược", passed: "Ngày vui đã đến" });
    expect(COPY.gift).toMatchObject({ openDialog: "Gửi quà cưới", closeDialog: "Đóng", copyAccountNumber: "Sao chép", copySucceeded: "Đã sao chép" });
    expect(COPY.rsvp).toMatchObject({
      heading: "Xác nhận tham dự",
      headingSecondLine: "Gửi lời chúc",
      attendanceLabel: "Bạn có thể tham dự không?",
      // Product Owner ruling (RSVP completion): the always-visible name prompt.
      guestNameLabel: "Tên bạn là gì?",
      guestNamePlaceholder: "Tên bạn là gì?",
      partySizeLabel: "Số người tham dự",
      messagePlaceholder: "Gửi lời chúc đến cô dâu & chú rể…",
      submit: "Gửi lời chúc",
      edit: "Sửa lại",
    });
    expect(COPY.rsvp.attendanceLabels).toStrictEqual({
      ATTENDING: "Sẽ tham dự",
      MAYBE: "Sẽ cố gắng tham dự",
      NOT_ATTENDING: "Tiếc quá, không tham dự được",
    });
  });

  it("implementation-chosen D copy that the Design Baseline removed is gone", () => {
    const text = JSON.stringify(COPY);
    for (const removed of ["Hẹn ngày chung vui", "Xem ngay", "Mở thiệp\"", "Xem thông tin mừng cưới", "Thông tin mừng cưới", '"Gửi xác nhận"', "Tôi sẽ tham dự", "Bạn sẽ tham dự chứ?"]) {
      expect(text, removed).not.toContain(removed);
    }
  });
});
