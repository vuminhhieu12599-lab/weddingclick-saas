import { describe, expect, it } from "vitest";

import { ACCESS_LINK_TYPES } from "../../../domain";
import { ApiError } from "../../errors/api-error";
import { validateIssueAccessLinkInput } from "../validate-issue-access-link-input";

function catchError(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("validateIssueAccessLinkInput", () => {
  it.each(ACCESS_LINK_TYPES)("accepts %s as a canonical linkType", (linkType) => {
    const result = validateIssueAccessLinkInput({ linkType });
    expect(result.linkType).toBe(linkType);
    expect(result.expiresAt).toBeNull();
  });

  it("normalizes an omitted expiresAt to null", () => {
    const result = validateIssueAccessLinkInput({ linkType: "INTAKE" });
    expect(result.expiresAt).toBeNull();
  });

  it("normalizes an explicit null expiresAt to null", () => {
    const result = validateIssueAccessLinkInput({ linkType: "INTAKE", expiresAt: null });
    expect(result.expiresAt).toBeNull();
  });

  it("accepts a valid past timestamp", () => {
    const result = validateIssueAccessLinkInput({
      linkType: "REVIEW",
      expiresAt: "2020-01-01T00:00:00Z",
    });
    expect(result.expiresAt).toBe("2020-01-01T00:00:00Z");
  });

  it("accepts a valid timestamp representing 'now'-shaped input", () => {
    const now = new Date().toISOString();
    const result = validateIssueAccessLinkInput({ linkType: "PORTAL", expiresAt: now });
    expect(result.expiresAt).toBe(now);
  });

  it("accepts a valid future timestamp", () => {
    const result = validateIssueAccessLinkInput({
      linkType: "INTAKE",
      expiresAt: "2099-01-01T00:00:00Z",
    });
    expect(result.expiresAt).toBe("2099-01-01T00:00:00Z");
  });

  it("rejects a missing linkType as BAD_REQUEST", () => {
    const error = catchError(() => validateIssueAccessLinkInput({}));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects an unrecognized linkType as BAD_REQUEST", () => {
    const error = catchError(() => validateIssueAccessLinkInput({ linkType: "GUEST" }));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a non-string linkType as BAD_REQUEST", () => {
    const error = catchError(() => validateIssueAccessLinkInput({ linkType: 42 }));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a non-string expiresAt as BAD_REQUEST", () => {
    const error = catchError(() =>
      validateIssueAccessLinkInput({ linkType: "INTAKE", expiresAt: 12345 }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a malformed timestamp as BAD_REQUEST", () => {
    const error = catchError(() =>
      validateIssueAccessLinkInput({ linkType: "INTAKE", expiresAt: "not-a-date" }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a date-only (offsetless) expiresAt as BAD_REQUEST", () => {
    const error = catchError(() =>
      validateIssueAccessLinkInput({ linkType: "INTAKE", expiresAt: "2026-01-01" }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects an unknown field as BAD_REQUEST", () => {
    const error = catchError(() =>
      validateIssueAccessLinkInput({ linkType: "INTAKE", extra: "field" }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a non-object body as BAD_REQUEST", () => {
    const error = catchError(() => validateIssueAccessLinkInput("INTAKE"));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects an array body as BAD_REQUEST", () => {
    const error = catchError(() => validateIssueAccessLinkInput(["INTAKE"]));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it.each(["token", "rawToken", "tokenHash", "tokenHint", "createdBy", "projectId"])(
    "rejects a caller-supplied %s field as BAD_REQUEST (server-generated/-derived only)",
    (forbiddenField) => {
      const error = catchError(() =>
        validateIssueAccessLinkInput({ linkType: "INTAKE", [forbiddenField]: "x" }),
      );
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe("BAD_REQUEST");
    },
  );
});
