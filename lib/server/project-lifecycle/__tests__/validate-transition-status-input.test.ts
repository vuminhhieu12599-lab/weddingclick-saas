import { describe, expect, it } from "vitest";

import { PROJECT_STATUSES } from "../../../domain";
import { ApiError } from "../../errors/api-error";
import { validateTransitionStatusInput } from "../validate-transition-status-input";

describe("validateTransitionStatusInput", () => {
  it.each(PROJECT_STATUSES)(
    "accepts %s as a syntactically valid targetStatus (including reserved targets)",
    (status) => {
      const result = validateTransitionStatusInput({ targetStatus: status });
      expect(result.targetStatus).toBe(status);
      expect(result.reason).toBeNull();
    },
  );

  it("rejects a missing targetStatus as BAD_REQUEST", () => {
    const error = catchError(() => validateTransitionStatusInput({}));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects an unrecognized targetStatus as BAD_REQUEST", () => {
    const error = catchError(() =>
      validateTransitionStatusInput({ targetStatus: "NOT_A_STATUS" }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a non-string targetStatus as BAD_REQUEST", () => {
    const error = catchError(() => validateTransitionStatusInput({ targetStatus: 123 }));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects an unknown field as BAD_REQUEST", () => {
    const error = catchError(() =>
      validateTransitionStatusInput({ targetStatus: "NEW", extra: "field" }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a non-object body as BAD_REQUEST", () => {
    const error = catchError(() => validateTransitionStatusInput("NEW"));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("defaults reason to null when omitted", () => {
    const result = validateTransitionStatusInput({ targetStatus: "NEW" });
    expect(result.reason).toBeNull();
  });

  it("trims a reason with surrounding whitespace", () => {
    const result = validateTransitionStatusInput({
      targetStatus: "NEW",
      reason: "  Customer requested delay  ",
    });
    expect(result.reason).toBe("Customer requested delay");
  });

  it("normalizes a whitespace-only reason to null", () => {
    const result = validateTransitionStatusInput({ targetStatus: "NEW", reason: "   " });
    expect(result.reason).toBeNull();
  });

  it("accepts a reason exactly 2000 characters long", () => {
    const reason = "a".repeat(2000);
    const result = validateTransitionStatusInput({ targetStatus: "NEW", reason });
    expect(result.reason).toBe(reason);
  });

  it("rejects a reason over 2000 characters as BAD_REQUEST", () => {
    const reason = "a".repeat(2001);
    const error = catchError(() => validateTransitionStatusInput({ targetStatus: "NEW", reason }));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a non-string reason as BAD_REQUEST", () => {
    const error = catchError(() =>
      validateTransitionStatusInput({ targetStatus: "NEW", reason: 42 }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a null reason as BAD_REQUEST (reason is an optional string, not nullable)", () => {
    const error = catchError(() =>
      validateTransitionStatusInput({ targetStatus: "NEW", reason: null }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });
});

function catchError(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error;
  }
}
