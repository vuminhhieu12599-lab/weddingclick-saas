import { describe, expect, it } from "vitest";

import {
  deriveCeremonyMonthGridV1,
  type CeremonyMonthGridCellV1,
  type CeremonyMonthGridV1,
} from "../ceremony-month-grid";
import * as publicApi from "../index";
import type { InvitationViewModel } from "../invitation-view-model-types";
import { deepFreeze } from "./invitation-view-model-fixtures";
import { contractViewModel } from "./renderer-contract-fixtures";

/**
 * RF-05C ceremony month grid (docs/DECISIONS.md RF-05 clarification K33,
 * K44 "Calendar"). `Date.UTC` is used only as an independent test oracle
 * for civil dates; production code never uses Date objects.
 */

const HCM = "Asia/Ho_Chi_Minh";
const DAY_MS = 86_400_000;

function viewModelWithCeremony(startsAt: string, timezone: string = HCM): InvitationViewModel {
  const viewModel = contractViewModel();
  return { ...viewModel, ceremony: { ...viewModel.ceremony, startsAt, timezone } };
}

function gridFor(startsAt: string, timezone: string = HCM): CeremonyMonthGridV1 {
  return deriveCeremonyMonthGridV1(viewModelWithCeremony(startsAt, timezone));
}

function oracleUtcMs(cell: Pick<CeremonyMonthGridCellV1, "year" | "month" | "day">): number {
  return Date.UTC(cell.year, cell.month - 1, cell.day);
}

function oracleDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function ymd(cell: CeremonyMonthGridCellV1): string {
  return `${cell.year}-${String(cell.month).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
}

/** Invariants every grid must satisfy (K33). */
function expectValidGrid(grid: CeremonyMonthGridV1, ceremony: { year: number; month: number; day: number }): void {
  expect(grid.year).toBe(ceremony.year);
  expect(grid.month).toBe(ceremony.month);
  expect(Number.isInteger(grid.month) && grid.month >= 1 && grid.month <= 12).toBe(true);

  expect(grid.cells).toHaveLength(42);

  // First cell is a Monday on or before the 1st, within the preceding 6 days.
  const first = grid.cells[0];
  expect(new Date(oracleUtcMs(first)).getUTCDay()).toBe(1);
  const firstOfMonthMs = Date.UTC(ceremony.year, ceremony.month - 1, 1);
  const lead = (firstOfMonthMs - oracleUtcMs(first)) / DAY_MS;
  expect(lead >= 0 && lead <= 6).toBe(true);

  // Consecutive civil days, and every seventh cell (column 0) is a Monday.
  for (let index = 1; index < grid.cells.length; index += 1) {
    expect(oracleUtcMs(grid.cells[index]) - oracleUtcMs(grid.cells[index - 1])).toBe(DAY_MS);
  }
  for (let row = 0; row < 6; row += 1) {
    expect(new Date(oracleUtcMs(grid.cells[row * 7])).getUTCDay()).toBe(1);
  }

  // In-month flags agree with the real month length.
  for (const cell of grid.cells) {
    expect(cell.inCeremonyMonth).toBe(cell.year === ceremony.year && cell.month === ceremony.month);
  }
  expect(grid.cells.filter((cell) => cell.inCeremonyMonth)).toHaveLength(
    oracleDaysInMonth(ceremony.year, ceremony.month),
  );

  // Exactly one in-month ceremony marker, on the ceremony civil date.
  const marked = grid.cells.filter((cell) => cell.isCeremonyDay);
  expect(marked).toHaveLength(1);
  expect(marked[0].inCeremonyMonth).toBe(true);
  expect([marked[0].year, marked[0].month, marked[0].day]).toEqual([ceremony.year, ceremony.month, ceremony.day]);

  // Plain data only: no Date objects or strings per cell.
  expect(JSON.parse(JSON.stringify(grid))).toEqual(grid);
  for (const cell of grid.cells) {
    expect(Object.keys(cell).sort()).toEqual(["day", "inCeremonyMonth", "isCeremonyDay", "month", "year"]);
  }
}

describe("deriveCeremonyMonthGridV1", () => {
  it("is exported from the package index; private civil helpers are not", () => {
    expect(publicApi.deriveCeremonyMonthGridV1).toBe(deriveCeremonyMonthGridV1);
    const names = Object.keys(publicApi);
    for (const privateName of [
      "parseCanonicalInstantEpochMs",
      "resolveCivilDateTime",
      "daysFromCivil",
      "civilFromDays",
      "mondayFirstWeekdayIndex",
      "assertValidCivilDate",
    ]) {
      expect(names).not.toContain(privateName);
    }
  });

  it("A. ordinary month: October 2026", () => {
    const grid = gridFor("2026-10-17T02:00:00.000Z");
    expectValidGrid(grid, { year: 2026, month: 10, day: 17 });
    expect(ymd(grid.cells[0])).toBe("2026-09-28");
    expect(ymd(grid.cells[41])).toBe("2026-11-08");
    expect(grid.cells.findIndex((cell) => cell.isCeremonyDay)).toBe(19);
    expect(grid.cells.slice(0, 3).every((cell) => !cell.inCeremonyMonth)).toBe(true);
  });

  it("B. month starting on Monday: June 2026", () => {
    const grid = gridFor("2026-06-20T03:00:00Z");
    expectValidGrid(grid, { year: 2026, month: 6, day: 20 });
    expect(ymd(grid.cells[0])).toBe("2026-06-01");
    expect(grid.cells[0].inCeremonyMonth).toBe(true);
    expect(ymd(grid.cells[41])).toBe("2026-07-12");
  });

  it("C. short February: February 2027 still returns 42 cells", () => {
    const grid = gridFor("2027-02-14T03:00:00Z");
    expectValidGrid(grid, { year: 2027, month: 2, day: 14 });
    expect(ymd(grid.cells[0])).toBe("2027-02-01");
    expect(ymd(grid.cells[27])).toBe("2027-02-28");
    expect(ymd(grid.cells[28])).toBe("2027-03-01");
    expect(grid.cells.slice(28).every((cell) => !cell.inCeremonyMonth)).toBe(true);
  });

  it("D. leap February: February 2028, ceremony on the 29th", () => {
    const grid = gridFor("2028-02-29T03:00:00Z");
    expectValidGrid(grid, { year: 2028, month: 2, day: 29 });
    expect(ymd(grid.cells[0])).toBe("2028-01-31");
    const leapDay = grid.cells.find((cell) => cell.month === 2 && cell.day === 29);
    expect(leapDay).toMatchObject({ inCeremonyMonth: true, isCeremonyDay: true });
  });

  it("E. year boundary: January 2027 leads with December 2026", () => {
    const grid = gridFor("2027-01-09T03:00:00Z");
    expectValidGrid(grid, { year: 2027, month: 1, day: 9 });
    expect(ymd(grid.cells[0])).toBe("2026-12-28");
    expect(grid.cells.slice(0, 4).map((cell) => cell.year)).toEqual([2026, 2026, 2026, 2026]);
  });

  it("E. year boundary: December 2026 spills into January 2027", () => {
    const grid = gridFor("2026-12-31T03:00:00Z");
    expectValidGrid(grid, { year: 2026, month: 12, day: 31 });
    expect(ymd(grid.cells[0])).toBe("2026-11-30");
    expect(ymd(grid.cells[41])).toBe("2027-01-10");
    expect(grid.cells.filter((cell) => cell.year === 2027)).toHaveLength(10);
  });

  it("F. uses the ceremony civil month, not the UTC month, near a month boundary", () => {
    const instant = "2026-10-31T18:00:00Z"; // 2026-11-01 01:00 in Ho Chi Minh City
    const hcm = gridFor(instant, HCM);
    expectValidGrid(hcm, { year: 2026, month: 11, day: 1 });
    expect(ymd(hcm.cells[0])).toBe("2026-10-26");

    const utc = gridFor(instant, "UTC");
    expectValidGrid(utc, { year: 2026, month: 10, day: 31 });
    expect(ymd(utc.cells[0])).toBe("2026-09-28");
  });

  it("F. uses the ceremony civil year near a year boundary", () => {
    const instant = "2026-12-31T17:30:00Z"; // 2027-01-01 00:30 in Ho Chi Minh City
    expectValidGrid(gridFor(instant, HCM), { year: 2027, month: 1, day: 1 });
    expectValidGrid(gridFor(instant, "UTC"), { year: 2026, month: 12, day: 31 });
  });

  it("marks the first and last day of a month", () => {
    expectValidGrid(gridFor("2026-03-01T03:00:00Z"), { year: 2026, month: 3, day: 1 });
    expectValidGrid(gridFor("2026-03-31T03:00:00Z"), { year: 2026, month: 3, day: 31 });
  });

  it("matches the independent oracle for every month 1970–2100, including century leap rules", () => {
    for (let year = 1970; year <= 2100; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const startsAt = `${year}-${String(month).padStart(2, "0")}-15T12:00:00Z`;
        const grid = gridFor(startsAt, "UTC");
        expect(grid.cells).toHaveLength(42);
        expect(new Date(oracleUtcMs(grid.cells[0])).getUTCDay()).toBe(1);
        expect(grid.cells.filter((cell) => cell.inCeremonyMonth)).toHaveLength(oracleDaysInMonth(year, month));
        expect(grid.cells.filter((cell) => cell.isCeremonyDay)).toHaveLength(1);
      }
    }
    // 2100 is not a leap year; 2000 is.
    expect(gridFor("2100-02-15T12:00:00Z", "UTC").cells.filter((cell) => cell.inCeremonyMonth)).toHaveLength(28);
    expect(gridFor("2000-02-15T12:00:00Z", "UTC").cells.filter((cell) => cell.inCeremonyMonth)).toHaveLength(29);
  });

  it("ignores every non-ceremony event and never mutates input", () => {
    const base = viewModelWithCeremony("2026-10-17T02:00:00Z");
    const viewModel = deepFreeze({
      ...base,
      events: [{ ...base.events[0], id: "other", isPrimary: true, startsAt: "2027-05-05T02:00:00Z" }],
    });
    const grid = deriveCeremonyMonthGridV1(viewModel);
    expectValidGrid(grid, { year: 2026, month: 10, day: 17 });
    expect(deriveCeremonyMonthGridV1(viewModel)).toEqual(grid);
  });

  it("rejects invalid ceremony timestamps and timezones", () => {
    for (const startsAt of ["2026-10-17T09:00:00", "2026-10-17", "nope", "2027-02-29T00:00:00Z"]) {
      expect(() => gridFor(startsAt), startsAt).toThrow(RangeError);
    }
    expect(() => gridFor("2026-10-17T02:00:00Z", "Not/AZone")).toThrow(RangeError);
    expect(() => gridFor("2026-10-17T02:00:00Z", "")).toThrow(RangeError);
  });
});
