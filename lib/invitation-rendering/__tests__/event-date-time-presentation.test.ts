import { describe, expect, it } from "vitest";

import { deriveCeremonyMonthGridV1 } from "../ceremony-month-grid";
import {
  VIETNAMESE_WEEKDAY_LABELS_V1,
  deriveEventDateTimePresentationV1,
  type EventDateTimePresentationV1,
} from "../event-date-time-presentation";
import * as publicApi from "../index";
import { deepFreeze } from "./invitation-view-model-fixtures";
import { contractViewModel } from "./renderer-contract-fixtures";

/**
 * RF-05C event date/time presentation (docs/DECISIONS.md RF-05
 * clarification K30–K32, K44 "Date/time"). Expected values are written out
 * literally; nothing is compared against machine-local formatting.
 */

const HCM = "Asia/Ho_Chi_Minh";

function present(startsAt: string, timezone: string = HCM): EventDateTimePresentationV1 {
  return deriveEventDateTimePresentationV1({ startsAt, timezone });
}

describe("RF-05C weekday vocabulary", () => {
  it("is the exact fixed Monday-first Vietnamese label set", () => {
    expect(VIETNAMESE_WEEKDAY_LABELS_V1).toEqual([
      "Thứ Hai",
      "Thứ Ba",
      "Thứ Tư",
      "Thứ Năm",
      "Thứ Sáu",
      "Thứ Bảy",
      "Chủ Nhật",
    ]);
  });

  it("is exported from the package index with the derivation", () => {
    expect(publicApi.VIETNAMESE_WEEKDAY_LABELS_V1).toBe(VIETNAMESE_WEEKDAY_LABELS_V1);
    expect(publicApi.deriveEventDateTimePresentationV1).toBe(deriveEventDateTimePresentationV1);
  });
});

describe("deriveEventDateTimePresentationV1", () => {
  it("derives the canonical ceremony fixture in Asia/Ho_Chi_Minh", () => {
    expect(present("2026-10-17T02:00:00.000Z")).toEqual({
      weekday: "Thứ Bảy",
      day: "17",
      month: "10",
      year: "2026",
      time: "09:00",
    });
  });

  it("returns exactly the five presentation fields", () => {
    expect(Object.keys(present("2026-10-17T02:00:00.000Z")).sort()).toEqual([
      "day",
      "month",
      "time",
      "weekday",
      "year",
    ]);
  });

  it("accepts a ViewModel ceremony and event entry directly", () => {
    const viewModel = contractViewModel();
    expect(deriveEventDateTimePresentationV1(viewModel.ceremony)).toEqual(present(viewModel.ceremony.startsAt));
    for (const event of viewModel.events) {
      expect(deriveEventDateTimePresentationV1(event)).toEqual(present(event.startsAt, event.timezone));
    }
  });

  it("produces all seven weekday labels in civil order", () => {
    const labels = [12, 13, 14, 15, 16, 17, 18].map(
      (day) => present(`2026-10-${day}T02:00:00Z`).weekday,
    );
    expect(labels).toEqual([...VIETNAMESE_WEEKDAY_LABELS_V1]);
  });

  it("uses the civil date after midnight in the event timezone, not the UTC date", () => {
    // 2026-10-16 17:00 UTC (Friday) is 2026-10-17 00:00 in Ho Chi Minh City.
    expect(present("2026-10-16T17:00:00Z")).toEqual({
      weekday: "Thứ Bảy",
      day: "17",
      month: "10",
      year: "2026",
      time: "00:00",
    });
  });

  it("gives different civil output for the same instant in different timezones", () => {
    const instant = "2026-10-16T17:00:00Z";
    expect(present(instant, "UTC")).toEqual({
      weekday: "Thứ Sáu",
      day: "16",
      month: "10",
      year: "2026",
      time: "17:00",
    });
    expect(present(instant, "America/Los_Angeles")).toEqual({
      weekday: "Thứ Sáu",
      day: "16",
      month: "10",
      year: "2026",
      time: "10:00",
    });
    expect(present(instant, HCM).weekday).toBe("Thứ Bảy");
  });

  it("renders midnight as 00:00, never 24:00", () => {
    for (const [startsAt, timezone] of [
      ["2026-10-17T00:00:00Z", "UTC"],
      ["2026-10-16T17:00:00Z", HCM],
      ["2026-12-31T17:00:00Z", HCM],
    ] as const) {
      const { time } = present(startsAt, timezone);
      expect(time).toBe("00:00");
      expect(time).not.toMatch(/^24/);
    }
  });

  it("crosses a civil year boundary in the event timezone", () => {
    expect(present("2026-12-31T17:30:00Z")).toEqual({
      weekday: "Thứ Sáu",
      day: "01",
      month: "01",
      year: "2027",
      time: "00:30",
    });
  });

  it("zero-pads every numeric part and uses ASCII digits only", () => {
    const result = present("2027-01-04T01:05:00Z", "UTC");
    expect(result).toEqual({ weekday: "Thứ Hai", day: "04", month: "01", year: "2027", time: "01:05" });
    expect(result.day).toMatch(/^[0-9]{2}$/);
    expect(result.month).toMatch(/^[0-9]{2}$/);
    expect(result.year).toMatch(/^[0-9]{4}$/);
    expect(result.time).toMatch(/^[0-9]{2}:[0-9]{2}$/);
  });

  it("treats an explicit offset as the same canonical instant", () => {
    expect(present("2026-10-17T09:00:00+07:00")).toEqual(present("2026-10-17T02:00:00Z"));
    expect(present("2026-10-16T22:00:00-04:00")).toEqual(present("2026-10-17T02:00:00Z"));
  });

  it("accepts a fractional-second RFC 3339 timestamp and truncates to minutes", () => {
    expect(present("2026-10-17T02:59:59.999Z").time).toBe("09:59");
    expect(present("2026-10-17T02:00:00.123456Z")).toEqual(present("2026-10-17T02:00:00Z"));
  });

  it("handles leap day 2028-02-29", () => {
    expect(present("2028-02-29T02:00:00Z")).toEqual({
      weekday: "Thứ Ba",
      day: "29",
      month: "02",
      year: "2028",
      time: "09:00",
    });
  });

  it("rejects offsetless local timestamps", () => {
    expect(() => present("2026-10-17T09:00:00")).toThrow(RangeError);
    expect(() => present("2026-10-17T09:00:00.000")).toThrow(RangeError);
  });

  it("rejects malformed or impossible timestamps without repairing them", () => {
    for (const startsAt of [
      "",
      "not a date",
      "2026-10-17",
      "2026-10-17 02:00:00Z",
      "2026-02-30T02:00:00Z",
      "2027-02-29T02:00:00Z",
      "2026-10-17T24:00:00Z",
      "2026-10-17T02:00:00+7:00",
      " 2026-10-17T02:00:00Z",
    ]) {
      expect(() => present(startsAt), startsAt).toThrow(RangeError);
    }
  });

  it("rejects a non-string startsAt at runtime", () => {
    const event = { startsAt: 1_792_202_400_000, timezone: HCM } as unknown as { startsAt: string; timezone: string };
    expect(() => deriveEventDateTimePresentationV1(event)).toThrow(RangeError);
  });

  it("rejects an invalid, empty or missing timezone instead of using the machine timezone", () => {
    expect(() => present("2026-10-17T02:00:00Z", "Mars/Olympus_Mons")).toThrow(RangeError);
    expect(() => present("2026-10-17T02:00:00Z", "")).toThrow(RangeError);
    const missing = { startsAt: "2026-10-17T02:00:00Z" } as unknown as { startsAt: string; timezone: string };
    expect(() => deriveEventDateTimePresentationV1(missing)).toThrow(RangeError);
  });

  it("reads neither lunarDateDisplay nor anything but startsAt/timezone, and never mutates input", () => {
    const ceremony = deepFreeze({ ...contractViewModel().ceremony, lunarDateDisplay: "Ngày 7 tháng 9 năm Bính Ngọ" });
    const withoutLunar = { ...ceremony, lunarDateDisplay: null };
    expect(deriveEventDateTimePresentationV1(ceremony)).toEqual(deriveEventDateTimePresentationV1(withoutLunar));
    expect(ceremony.lunarDateDisplay).toBe("Ngày 7 tháng 9 năm Bính Ngọ");
  });
});

describe("RF-05C host timezone independence", () => {
  // Vitest runs each test file in its own forked worker process and the
  // tests of one file sequentially, so this TZ mutation is isolated to this
  // test and restored in `finally`.
  it("gives identical date/time and month-grid output under different host TZ values", () => {
    const originalTz = process.env.TZ;
    const viewModel = {
      ...contractViewModel(),
      ceremony: { ...contractViewModel().ceremony, startsAt: "2026-10-31T18:00:00Z", timezone: HCM },
    };
    const probeInstant = Date.UTC(2026, 9, 31, 18, 0, 0);
    const hostLocalHours = new Set<number>();
    const outputs: string[] = [];

    try {
      for (const hostTz of ["UTC", "America/New_York", "Pacific/Kiritimati", "Asia/Ho_Chi_Minh", "Europe/London"]) {
        process.env.TZ = hostTz;
        // Proves the host timezone really changed for this process.
        hostLocalHours.add(new Date(probeInstant).getHours());
        outputs.push(
          JSON.stringify({
            ceremony: deriveEventDateTimePresentationV1(viewModel.ceremony),
            utcView: present("2026-10-31T18:00:00Z", "UTC"),
            grid: deriveCeremonyMonthGridV1(viewModel),
          }),
        );
      }
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }

    expect(hostLocalHours.size).toBeGreaterThan(1);
    expect(new Set(outputs).size).toBe(1);
    const parsed = JSON.parse(outputs[0]) as {
      ceremony: EventDateTimePresentationV1;
      utcView: EventDateTimePresentationV1;
      grid: { year: number; month: number };
    };
    expect(parsed.ceremony).toEqual({ weekday: "Chủ Nhật", day: "01", month: "11", year: "2026", time: "01:00" });
    expect(parsed.utcView).toEqual({ weekday: "Thứ Bảy", day: "31", month: "10", year: "2026", time: "18:00" });
    expect(parsed.grid.year).toBe(2026);
    expect(parsed.grid.month).toBe(11);
  });
});
