import { describe, expect, expectTypeOf, it } from "vitest";

import type { RsvpAttendanceStatus } from "../../domain";
import {
  RSVP_ATTENDING_PARTY_SIZE_MAX,
  RSVP_ATTENDING_PARTY_SIZE_MIN,
  RSVP_MESSAGE_MAX_LENGTH,
  RSVP_SUBMIT_RESULT_STATUSES,
  isValidRsvpSubmitInputV1,
  type RsvpCapabilityV1,
  type RsvpSubmitInputV1,
  type RsvpSubmitResultStatusV1,
  type RsvpSubmitResultV1,
} from "../rsvp-capability";
import { deepFreeze } from "./invitation-view-model-fixtures";
import { rsvpInput } from "./renderer-contract-fixtures";

// RSVP completion amendment: one rule set for personalized and unpersonalized invitations.
function valid(input: unknown): boolean {
  return isValidRsvpSubmitInputV1(input);
}

// ---------------------------------------------------------------------------
// Types and constants (K15, K17)
// ---------------------------------------------------------------------------

describe("RSVP contract types", () => {
  it("input has exactly four fields over the canonical attendance type", () => {
    expectTypeOf<keyof RsvpSubmitInputV1>().toEqualTypeOf<"attendance" | "partySize" | "message" | "guestName">();
    expectTypeOf<RsvpSubmitInputV1["attendance"]>().toEqualTypeOf<RsvpAttendanceStatus>();
    expectTypeOf<RsvpSubmitInputV1["attendance"]>().toEqualTypeOf<"ATTENDING" | "MAYBE" | "NOT_ATTENDING">();
    expectTypeOf<RsvpSubmitInputV1["partySize"]>().toEqualTypeOf<number>();
    expectTypeOf<RsvpSubmitInputV1["message"]>().toEqualTypeOf<string | null>();
    expectTypeOf<RsvpSubmitInputV1["guestName"]>().toEqualTypeOf<string>();
  });

  it("result is a status-only union of exactly four outcomes", () => {
    expect(RSVP_SUBMIT_RESULT_STATUSES).toEqual(["SUCCESS", "INVALID", "UNAVAILABLE", "FAILED"]);
    expectTypeOf<RsvpSubmitResultStatusV1>().toEqualTypeOf<"SUCCESS" | "INVALID" | "UNAVAILABLE" | "FAILED">();
    expectTypeOf<RsvpSubmitResultV1>().toEqualTypeOf<
      | { readonly status: "SUCCESS" }
      | { readonly status: "INVALID" }
      | { readonly status: "UNAVAILABLE" }
      | { readonly status: "FAILED" }
    >();
    expectTypeOf<keyof RsvpSubmitResultV1>().toEqualTypeOf<"status">();
  });

  it("capability has only submit(input) → Promise<RsvpSubmitResultV1>", () => {
    expectTypeOf<keyof RsvpCapabilityV1>().toEqualTypeOf<"submit">();
    expectTypeOf<Parameters<RsvpCapabilityV1["submit"]>>().toEqualTypeOf<[input: RsvpSubmitInputV1]>();
    expectTypeOf<ReturnType<RsvpCapabilityV1["submit"]>>().toEqualTypeOf<Promise<RsvpSubmitResultV1>>();
  });

  it("accepts MAYBE (RSVP completion amendment) and still has no extra result payload", () => {
    const maybe: RsvpSubmitInputV1 = { attendance: "MAYBE", partySize: 1, message: null, guestName: "Anh Hiếu" };
    // @ts-expect-error -- no extra payload on a result (K17)
    const withMessage: RsvpSubmitResultV1 = { status: "FAILED", message: "boom" };
    expect(valid(maybe)).toBe(true);
    expect(withMessage).toBeDefined();
  });

  it("exposes the canonical §2.20 limits", () => {
    expect(RSVP_ATTENDING_PARTY_SIZE_MIN).toBe(1);
    expect(RSVP_ATTENDING_PARTY_SIZE_MAX).toBe(20);
    expect(RSVP_MESSAGE_MAX_LENGTH).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Validator (K16)
// ---------------------------------------------------------------------------

describe("isValidRsvpSubmitInputV1 — party size", () => {
  it.each([
    [0, false],
    [1, true],
    [20, true],
    [21, false],
    [1.5, false],
    [-1, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
    ["1", false],
  ])("ATTENDING and MAYBE partySize %s → %s", (partySize, expected) => {
    expect(valid({ ...rsvpInput(), attendance: "ATTENDING", partySize })).toBe(expected);
    expect(valid({ ...rsvpInput(), attendance: "MAYBE", partySize })).toBe(expected);
  });

  it.each([
    [0, true],
    [1, false],
    [-0.5, false],
    ["0", false],
  ])("NOT_ATTENDING partySize %s → %s", (partySize, expected) => {
    expect(valid({ ...rsvpInput(), attendance: "NOT_ATTENDING", partySize })).toBe(expected);
  });
});

describe("isValidRsvpSubmitInputV1 — attendance", () => {
  it.each(["ATTENDING", "MAYBE", "NOT_ATTENDING"] as const)("accepts attendance %s", (attendance) => {
    expect(valid({ ...rsvpInput(), attendance, partySize: attendance === "NOT_ATTENDING" ? 0 : 1 })).toBe(true);
  });

  it.each(["maybe", "attending", "", null, undefined, 1])("rejects attendance %s", (attendance) => {
    expect(valid({ ...rsvpInput(), attendance })).toBe(false);
  });
});

describe("isValidRsvpSubmitInputV1 — message", () => {
  it("accepts null, empty string and exactly 500 characters", () => {
    expect(valid(rsvpInput({ message: null }))).toBe(true);
    expect(valid(rsvpInput({ message: "" }))).toBe(true);
    expect(valid(rsvpInput({ message: "a".repeat(500) }))).toBe(true);
  });

  it("rejects 501 characters", () => {
    expect(valid(rsvpInput({ message: "a".repeat(501) }))).toBe(false);
  });

  it("counts Unicode code points like PostgreSQL char_length, not UTF-16 units", () => {
    const emoji500 = "💐".repeat(500);
    expect(emoji500.length).toBe(1000);
    expect(valid(rsvpInput({ message: emoji500 }))).toBe(true);
    expect(valid(rsvpInput({ message: "💐".repeat(501) }))).toBe(false);
    expect(valid(rsvpInput({ message: "Chúc mừng hạnh phúc ".repeat(25) }))).toBe(true);
  });

  it.each([0, true, {}, ["x"], undefined])("rejects non-string message %s", (message) => {
    expect(valid({ ...rsvpInput(), message })).toBe(false);
  });
});

describe("isValidRsvpSubmitInputV1 — guestName (always-required response name)", () => {
  it.each([
    ["", false],
    ["  \t\n ", false],
    ["  Team Marketing  ", false],
    ["Em và sự cô đơn", true],
    ["Anh Hiếu và gia đình", true],
  ])("guestName %j → %s, for personalized and unpersonalized alike", (guestName, expected) => {
    expect(valid(rsvpInput({ guestName }))).toBe(expected);
  });

  it("is at most 200 code points", () => {
    expect(valid(rsvpInput({ guestName: "Ạ".repeat(200) }))).toBe(true);
    expect(valid(rsvpInput({ guestName: "Ạ".repeat(201) }))).toBe(false);
  });

  it.each([null, 0, {}, undefined])("rejects a missing or non-string guestName %s", (guestName) => {
    expect(valid({ ...rsvpInput(), guestName })).toBe(false);
  });
});

describe("isValidRsvpSubmitInputV1 — object shape", () => {
  it.each([null, undefined, [], [rsvpInput()], "ATTENDING", 1, true])("rejects non-object %s", (input) => {
    expect(valid(input)).toBe(false);
  });

  it.each(["attendance", "partySize", "message", "guestName"] as const)("rejects a missing %s", (key) => {
    const input: Record<string, unknown> = { ...rsvpInput() };
    delete input[key];
    expect(valid(input)).toBe(false);
  });

  it("rejects undefined instead of null for message", () => {
    expect(valid({ ...rsvpInput(), message: undefined })).toBe(false);
  });

  it("rejects unknown extra keys", () => {
    expect(valid({ ...rsvpInput(), guestId: "g-1" })).toBe(false);
    expect(valid({ ...rsvpInput(), token: "raw" })).toBe(false);
    expect(valid({ ...rsvpInput(), [Symbol("extra")]: true })).toBe(false);
  });

  it("rejects inherited substitutes for own keys", () => {
    expect(valid(Object.create(rsvpInput()))).toBe(false);
    const { guestName, ...rest } = rsvpInput();
    const partial: Record<string, unknown> = Object.create({ guestName });
    Object.assign(partial, rest);
    expect(valid(partial)).toBe(false);
  });

  it("accepts a valid input without mutating it", () => {
    const input = deepFreeze(rsvpInput({ message: "  giữ nguyên  ", guestName: "Anh Hiếu" }));
    const before = structuredClone(input);
    expect(valid(input)).toBe(true);
    expect(input).toEqual(before);
    expect(input.message).toBe("  giữ nguyên  ");
    expect(input.guestName).toBe("Anh Hiếu");
  });
});
