import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { validateMarkPaidInput } from "../validate-mark-paid-input";

describe("validateMarkPaidInput", () => {
  it("accepts the exact { action: MARK_PAID } body", () => {
    expect(() => validateMarkPaidInput({ action: "MARK_PAID" })).not.toThrow();
  });

  it("rejects an empty body as BAD_REQUEST", () => {
    const error = catchError(() => validateMarkPaidInput({}));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a missing action as BAD_REQUEST", () => {
    const error = catchError(() => validateMarkPaidInput({ note: "please" }));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a wrong action value as BAD_REQUEST", () => {
    const error = catchError(() => validateMarkPaidInput({ action: "MARK_UNPAID" }));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects an unknown field as BAD_REQUEST", () => {
    const error = catchError(() =>
      validateMarkPaidInput({ action: "MARK_PAID", extra: "field" }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a non-object body as BAD_REQUEST", () => {
    const error = catchError(() => validateMarkPaidInput("MARK_PAID"));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a null body as BAD_REQUEST", () => {
    const error = catchError(() => validateMarkPaidInput(null));
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
