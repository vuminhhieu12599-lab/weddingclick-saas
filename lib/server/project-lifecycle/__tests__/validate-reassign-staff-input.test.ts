import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { validateReassignStaffInput } from "../validate-reassign-staff-input";

const validStaffId = "11111111-1111-1111-1111-111111111111";

describe("validateReassignStaffInput", () => {
  it("accepts a valid UUID", () => {
    const result = validateReassignStaffInput({ assignedStaffId: validStaffId });
    expect(result).toEqual({ assignedStaffId: validStaffId });
  });

  it("accepts null (unassign)", () => {
    const result = validateReassignStaffInput({ assignedStaffId: null });
    expect(result).toEqual({ assignedStaffId: null });
  });

  it("rejects a missing assignedStaffId key as BAD_REQUEST", () => {
    const error = catchError(() => validateReassignStaffInput({}));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a malformed UUID as BAD_REQUEST", () => {
    const error = catchError(() =>
      validateReassignStaffInput({ assignedStaffId: "not-a-uuid" }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects an unknown field as BAD_REQUEST", () => {
    const error = catchError(() =>
      validateReassignStaffInput({ assignedStaffId: validStaffId, extra: "field" }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a non-string, non-null assignedStaffId as BAD_REQUEST", () => {
    const error = catchError(() => validateReassignStaffInput({ assignedStaffId: 123 }));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a non-object body as BAD_REQUEST", () => {
    const error = catchError(() => validateReassignStaffInput(validStaffId));
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
