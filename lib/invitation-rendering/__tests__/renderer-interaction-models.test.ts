import { describe, expect, it, vi } from "vitest";

import { RSVP_ATTENDANCE_STATUSES } from "../../domain";
import { copyWithFeedback } from "../clipboard-copy-feedback";
import type { ClipboardCapabilityV1, ClipboardCopyResultV1 } from "../renderer-capabilities";
import { isValidRsvpSubmitInputV1, type RsvpCapabilityV1, type RsvpSubmitResultV1 } from "../rsvp-capability";
import {
  INITIAL_RSVP_DRAFT,
  RSVP_PARTY_SIZE_CHOICES,
  buildRsvpSubmitInput,
  createRsvpSubmissionGate,
  rsvpMessageLength,
  rsvpPhaseReducer,
  rsvpTakesPartySize,
  settleRsvpSubmit,
  type RsvpDraft,
  type RsvpPhase,
} from "../rsvp-form-model";

/**
 * VH-02B-E1 — shared renderer interaction models (docs/DECISIONS.md
 * "VH-02B-E1"): the RSVP form model / submission gate and clipboard copy
 * feedback. Pure; capability outcomes come only from the test doubles here.
 */

const DRAFT: RsvpDraft = { ...INITIAL_RSVP_DRAFT, guestName: "  Anh Hiếu và gia đình  " };

function rsvpDouble(outcome: RsvpSubmitResultV1 | "reject" | "malformed"): RsvpCapabilityV1 & { submit: ReturnType<typeof vi.fn> } {
  return {
    submit: vi.fn(async () => {
      if (outcome === "reject") throw new Error("fault");
      if (outcome === "malformed") return { status: "OK" } as unknown as RsvpSubmitResultV1;
      return outcome;
    }),
  };
}

describe("RSVP form model", () => {
  it("starts with an empty name, ATTENDING and a party of 1; party-size choices are exactly 1–20", () => {
    expect(INITIAL_RSVP_DRAFT).toStrictEqual({ attendance: "ATTENDING", partySize: 1, message: "", guestName: "" });
    expect(RSVP_PARTY_SIZE_CHOICES).toStrictEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  it.each(RSVP_ATTENDANCE_STATUSES)("%s builds a frozen-contract input", (attendance) => {
    const built = buildRsvpSubmitInput({ ...DRAFT, attendance, partySize: 3, message: "Chúc mừng!" });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(isValidRsvpSubmitInputV1(built.input)).toBe(true);
    expect(built.input).toStrictEqual({
      attendance,
      partySize: attendance === "NOT_ATTENDING" ? 0 : 3,
      message: "Chúc mừng!",
      guestName: "Anh Hiếu và gia đình",
    });
    expect(rsvpTakesPartySize(attendance)).toBe(attendance !== "NOT_ATTENDING");
  });

  it("party size: ATTENDING/MAYBE need 1–20; NOT_ATTENDING always sends 0", () => {
    for (const partySize of [0, 21, 2.5, Number.NaN]) {
      expect(buildRsvpSubmitInput({ ...DRAFT, partySize })).toStrictEqual({ ok: false, errors: ["PARTY_SIZE_RANGE"] });
      expect(buildRsvpSubmitInput({ ...DRAFT, attendance: "MAYBE", partySize })).toStrictEqual({ ok: false, errors: ["PARTY_SIZE_RANGE"] });
    }
    const declined = buildRsvpSubmitInput({ ...DRAFT, attendance: "NOT_ATTENDING", partySize: 99 });
    expect(declined.ok && declined.input.partySize).toBe(0);
  });

  it("name required; message blank → null, max 500 code points (Vietnamese counted per code point)", () => {
    expect(buildRsvpSubmitInput({ ...DRAFT, guestName: "   " })).toStrictEqual({ ok: false, errors: ["GUEST_NAME_REQUIRED"] });
    const blank = buildRsvpSubmitInput({ ...DRAFT, message: "  \n " });
    expect(blank.ok && blank.input.message).toBeNull();
    expect(rsvpMessageLength("Chúc")).toBe(4);
    expect(buildRsvpSubmitInput({ ...DRAFT, message: "ạ".repeat(500) }).ok).toBe(true);
    expect(buildRsvpSubmitInput({ ...DRAFT, message: "ạ".repeat(501) })).toStrictEqual({ ok: false, errors: ["MESSAGE_TOO_LONG"] });
    expect(buildRsvpSubmitInput({ ...DRAFT, attendance: null })).toStrictEqual({ ok: false, errors: ["ATTENDANCE_REQUIRED"] });
  });

  it("phase machine: success only from pending; no duplicate start; failure is retryable; EDIT only after success", () => {
    const run = (phase: RsvpPhase, ...actions: Parameters<typeof rsvpPhaseReducer>[1][]) => actions.reduce(rsvpPhaseReducer, phase);
    expect(run("IDLE", { type: "SUBMIT_SETTLED", outcome: "SUCCESS" })).toBe("IDLE");
    expect(run("IDLE", { type: "SUBMIT_STARTED" }, { type: "SUBMIT_STARTED" })).toBe("PENDING");
    expect(run("IDLE", { type: "SUBMIT_STARTED" }, { type: "SUBMIT_SETTLED", outcome: "REJECTED" })).toBe("FAILED");
    expect(run("FAILED", { type: "SUBMIT_STARTED" }, { type: "SUBMIT_SETTLED", outcome: "SUCCESS" })).toBe("SUCCESS");
    expect(run("SUCCESS", { type: "SUBMIT_STARTED" })).toBe("SUCCESS");
    expect(run("SUCCESS", { type: "EDIT" })).toBe("IDLE");
    expect(run("FAILED", { type: "EDIT" })).toBe("FAILED");
  });
});

describe("RSVP submission", () => {
  const input = { attendance: "ATTENDING" as const, partySize: 2, message: null, guestName: "Chú B" };

  it.each(["SUCCESS", "INVALID", "UNAVAILABLE", "FAILED"] as const)("resolves the capability's own %s", async (status) => {
    const rsvp = rsvpDouble({ status });
    await expect(settleRsvpSubmit(rsvp, input)).resolves.toBe(status);
    expect(rsvp.submit).toHaveBeenCalledWith(input);
  });

  it("a rejection is REJECTED and a malformed result FAILED — never success", async () => {
    await expect(settleRsvpSubmit(rsvpDouble("reject"), input)).resolves.toBe("REJECTED");
    await expect(settleRsvpSubmit(rsvpDouble("malformed"), input)).resolves.toBe("FAILED");
  });

  it("the gate blocks a duplicate submit while one is in flight and releases after settling", async () => {
    let release: (value: RsvpSubmitResultV1) => void = () => undefined;
    const rsvp: RsvpCapabilityV1 & { submit: ReturnType<typeof vi.fn> } = {
      submit: vi.fn(() => new Promise<RsvpSubmitResultV1>((resolve) => (release = resolve))),
    };
    const gate = createRsvpSubmissionGate();
    const first = gate.run(rsvp, input);
    expect(first).not.toBeNull();
    expect(gate.run(rsvp, input)).toBeNull();
    expect(rsvp.submit).toHaveBeenCalledTimes(1);
    release({ status: "FAILED" });
    await expect(first).resolves.toBe("FAILED");
    expect(gate.run(rsvp, input)).not.toBeNull();
    expect(rsvp.submit).toHaveBeenCalledTimes(2);
  });
});

describe("clipboard copy feedback", () => {
  function clipboard(outcome: ClipboardCopyResultV1 | "reject" | "malformed"): ClipboardCapabilityV1 & { copyText: ReturnType<typeof vi.fn> } {
    return {
      copyText: vi.fn(async () => {
        if (outcome === "reject") throw new Error("fault");
        if (outcome === "malformed") return undefined as unknown as ClipboardCopyResultV1;
        return outcome;
      }),
    };
  }

  it.each(["SUCCESS", "UNAVAILABLE", "FAILED"] as const)("passes the capability's %s through", async (status) => {
    const capability = clipboard({ status });
    await expect(copyWithFeedback(capability, "9001000000001")).resolves.toBe(status);
    expect(capability.copyText).toHaveBeenCalledWith("9001000000001");
  });

  it("Promise completion is never success: rejection and malformed results are FAILED", async () => {
    await expect(copyWithFeedback(clipboard("reject"), "1")).resolves.toBe("FAILED");
    await expect(copyWithFeedback(clipboard("malformed"), "1")).resolves.toBe("FAILED");
  });
});
