import { describe, expect, it } from "vitest";

import { deriveCeremonyCountdownV1, type CeremonyCountdownV1 } from "../ceremony-countdown";
import * as publicApi from "../index";
import type { InvitationViewModel } from "../invitation-view-model-types";
import type { ClockCapabilityV1 } from "../renderer-capabilities";
import { deepFreeze } from "./invitation-view-model-fixtures";
import { contractViewModel } from "./renderer-contract-fixtures";

/**
 * RF-05C ceremony countdown (docs/DECISIONS.md RF-05 clarification K26–K29,
 * K44 "Clock/countdown"). Every "now" is an explicit epoch value.
 */

const TARGET = "2026-10-17T02:00:00.000Z";
const TARGET_MS = Date.parse(TARGET);

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function viewModelWithCeremony(startsAt: string = TARGET, timezone = "Asia/Ho_Chi_Minh"): InvitationViewModel {
  const viewModel = contractViewModel();
  return { ...viewModel, ceremony: { ...viewModel.ceremony, startsAt, timezone } };
}

function countdownAt(nowEpochMs: number, startsAt: string = TARGET): CeremonyCountdownV1 {
  return deriveCeremonyCountdownV1(viewModelWithCeremony(startsAt), { nowEpochMs });
}

const PASSED: CeremonyCountdownV1 = { days: 0, hours: 0, minutes: 0, seconds: 0, hasPassed: true };

describe("deriveCeremonyCountdownV1", () => {
  it("is exported from the package index", () => {
    expect(publicApi.deriveCeremonyCountdownV1).toBe(deriveCeremonyCountdownV1);
  });

  it("splits 1 day 2 hours 3 minutes 4 seconds", () => {
    const remaining = DAY + 2 * HOUR + 3 * MINUTE + 4 * SECOND;
    expect(countdownAt(TARGET_MS - remaining)).toEqual({
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4,
      hasPassed: false,
    });
  });

  it("returns exactly the five countdown fields, all non-negative integers", () => {
    const result = countdownAt(TARGET_MS - 40 * DAY - 23 * HOUR - 59 * MINUTE - 59 * SECOND - 999);
    expect(Object.keys(result).sort()).toEqual(["days", "hasPassed", "hours", "minutes", "seconds"]);
    expect(result).toEqual({ days: 40, hours: 23, minutes: 59, seconds: 59, hasPassed: false });
    for (const value of [result.days, result.hours, result.minutes, result.seconds]) {
      expect(Number.isInteger(value) && value >= 0).toBe(true);
    }
  });

  it("truncates residual milliseconds toward zero", () => {
    expect(countdownAt(TARGET_MS - (5 * SECOND + 999))).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 5,
      hasPassed: false,
    });
    expect(countdownAt(TARGET_MS - (MINUTE + 1))).toEqual({
      days: 0,
      hours: 0,
      minutes: 1,
      seconds: 0,
      hasPassed: false,
    });
  });

  it("uses fixed 24-hour days, independent of the ceremony timezone", () => {
    const now = TARGET_MS - 3 * DAY - 5 * HOUR;
    const expected = { days: 3, hours: 5, minutes: 0, seconds: 0, hasPassed: false };
    for (const timezone of ["Asia/Ho_Chi_Minh", "UTC", "America/New_York"]) {
      expect(deriveCeremonyCountdownV1(viewModelWithCeremony(TARGET, timezone), { nowEpochMs: now })).toEqual(
        expected,
      );
    }
    // Across the 2026-11-01 US DST change the duration is still counted in fixed 24h days.
    const dstTarget = "2026-11-02T12:00:00-05:00";
    const dstNow = Date.parse("2026-10-31T12:00:00-04:00");
    expect(
      deriveCeremonyCountdownV1(viewModelWithCeremony(dstTarget, "America/New_York"), { nowEpochMs: dstNow }),
    ).toEqual({ days: 2, hours: 1, minutes: 0, seconds: 0, hasPassed: false });
  });

  it("shows all zeros but not passed when less than one second remains", () => {
    for (const remaining of [999, 500, 1, 0.5]) {
      expect(countdownAt(TARGET_MS - remaining), String(remaining)).toEqual({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        hasPassed: false,
      });
    }
  });

  it("is passed with all zeros at the exact target", () => {
    expect(countdownAt(TARGET_MS)).toEqual(PASSED);
  });

  it("is passed with all zeros after the target", () => {
    for (const late of [0.5, 1, SECOND, DAY, 365 * DAY]) {
      expect(countdownAt(TARGET_MS + late), String(late)).toEqual(PASSED);
    }
  });

  it("accepts fractional epoch milliseconds", () => {
    expect(countdownAt(TARGET_MS - 2 * SECOND - 0.25)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 2,
      hasPassed: false,
    });
    expect(countdownAt(TARGET_MS + 0.25)).toEqual(PASSED);
  });

  it("rejects NaN, Infinity and non-number nowEpochMs", () => {
    const viewModel = viewModelWithCeremony();
    for (const nowEpochMs of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => deriveCeremonyCountdownV1(viewModel, { nowEpochMs })).toThrow(RangeError);
    }
    for (const nowEpochMs of ["1792202400000", null, undefined, BigInt(10), {}]) {
      const clock = { nowEpochMs } as unknown as ClockCapabilityV1;
      expect(() => deriveCeremonyCountdownV1(viewModel, clock), String(nowEpochMs)).toThrow(RangeError);
    }
  });

  it("rejects a missing clock object instead of reading the current time", () => {
    const viewModel = viewModelWithCeremony();
    for (const clock of [undefined, null, 1_792_202_400_000]) {
      expect(() => deriveCeremonyCountdownV1(viewModel, clock as unknown as ClockCapabilityV1)).toThrow(RangeError);
    }
  });

  it("rejects malformed or offsetless ceremony startsAt", () => {
    for (const startsAt of ["2026-10-17T09:00:00", "2026-10-17", "garbage", "", "2026-02-30T00:00:00Z"]) {
      expect(() => countdownAt(TARGET_MS, startsAt), startsAt).toThrow(RangeError);
    }
  });

  it("targets only ceremony.startsAt, ignoring every other event", () => {
    const base = viewModelWithCeremony();
    const other = base.events[0];
    const withOtherEvents: InvitationViewModel = {
      ...base,
      events: [
        { ...other, id: "earlier", isPrimary: true, startsAt: "2026-01-01T00:00:00Z" },
        { ...other, id: "later", isPrimary: true, startsAt: "2027-06-01T00:00:00Z" },
        { ...other, id: "broken", startsAt: "not a timestamp" },
      ],
    };
    const now = TARGET_MS - (DAY + HOUR);
    expect(deriveCeremonyCountdownV1(withOtherEvents, { nowEpochMs: now })).toEqual({
      days: 1,
      hours: 1,
      minutes: 0,
      seconds: 0,
      hasPassed: false,
    });
  });

  it("is deterministic and never mutates its inputs", () => {
    const viewModel = deepFreeze(viewModelWithCeremony());
    const clock = deepFreeze({ nowEpochMs: TARGET_MS - HOUR });
    const first = deriveCeremonyCountdownV1(viewModel, clock);
    expect(deriveCeremonyCountdownV1(viewModel, clock)).toEqual(first);
    expect(first).toEqual({ days: 0, hours: 1, minutes: 0, seconds: 0, hasPassed: false });
  });
});
