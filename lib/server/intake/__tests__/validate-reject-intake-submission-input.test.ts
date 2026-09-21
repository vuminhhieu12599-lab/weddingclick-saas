import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { validateRejectIntakeSubmissionInput } from "../validate-reject-intake-submission-input";

describe("validateRejectIntakeSubmissionInput", () => {
  it("returns null when staffNote is omitted", () => {
    expect(validateRejectIntakeSubmissionInput({})).toBeNull();
  });

  it("returns null when staffNote is explicitly null", () => {
    expect(validateRejectIntakeSubmissionInput({ staffNote: null })).toBeNull();
  });

  it("returns the trimmed string when staffNote is a non-empty string", () => {
    expect(validateRejectIntakeSubmissionInput({ staffNote: "  Looks good  " })).toBe(
      "Looks good",
    );
  });

  it("normalizes an empty/whitespace-only staffNote to null", () => {
    expect(validateRejectIntakeSubmissionInput({ staffNote: "   " })).toBeNull();
  });

  it("rejects a non-string staffNote", () => {
    expect(() => validateRejectIntakeSubmissionInput({ staffNote: 42 })).toThrow(ApiError);
  });

  it("rejects an unknown field", () => {
    expect(() =>
      validateRejectIntakeSubmissionInput({ staffNote: "ok", extra: "nope" }),
    ).toThrow(ApiError);
  });

  it("rejects Wedding Details fields in the reject body", () => {
    expect(() => validateRejectIntakeSubmissionInput({ groomName: "Nope" })).toThrow(ApiError);
  });

  it("rejects a non-object body", () => {
    expect(() => validateRejectIntakeSubmissionInput("nope")).toThrow(ApiError);
  });

  it("rejects a null body", () => {
    expect(() => validateRejectIntakeSubmissionInput(null)).toThrow(ApiError);
  });

  it("rejects an array body", () => {
    expect(() => validateRejectIntakeSubmissionInput([])).toThrow(ApiError);
  });

  it("throws BAD_REQUEST as the ApiError kind for an invalid staffNote", () => {
    const error = (() => {
      try {
        validateRejectIntakeSubmissionInput({ staffNote: 42 });
        return undefined;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });
});
