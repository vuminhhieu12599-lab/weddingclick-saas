import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { validateUpdateProjectMediaInput } from "../validate-update-project-media-input";

function expectBadRequest(body: unknown) {
  const error = (() => {
    try {
      validateUpdateProjectMediaInput(body);
      return undefined;
    } catch (e) {
      return e;
    }
  })();
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).kind).toBe("BAD_REQUEST");
}

describe("validateUpdateProjectMediaInput — unknown/forbidden fields", () => {
  it.each([
    "id",
    "projectId",
    "mediaType",
    "storageBucket",
    "storagePath",
    "mimeType",
    "sizeBytes",
    "width",
    "height",
    "createdBy",
    "createdAt",
    "updatedAt",
  ])('rejects "%s" as an unknown/forbidden field', (field) => {
    expectBadRequest({ altText: "x", [field]: "anything" });
  });

  it("rejects a non-object body", () => {
    expectBadRequest("not-an-object");
    expectBadRequest(null);
    expectBadRequest([]);
  });
});

describe("validateUpdateProjectMediaInput — empty patch", () => {
  it("rejects an empty body with BAD_REQUEST", () => {
    expectBadRequest({});
  });

  it("never touches the DB to reach this decision (pure input validation)", () => {
    // No gateway is passed to this function at all — the empty-patch
    // rejection is purely a shape check with no read, by construction.
    expect(() => validateUpdateProjectMediaInput({})).toThrow(ApiError);
  });
});

describe("validateUpdateProjectMediaInput — field presence preservation", () => {
  it("altText absent -> not present on the returned patch at all", () => {
    const patch = validateUpdateProjectMediaInput({ sortOrder: 5 });
    expect("altText" in patch).toBe(false);
    expect(patch.sortOrder).toBe(5);
  });

  it("sortOrder absent -> not present on the returned patch at all", () => {
    const patch = validateUpdateProjectMediaInput({ altText: "hello" });
    expect("sortOrder" in patch).toBe(false);
    expect(patch.altText).toBe("hello");
  });

  it("explicit altText: null is present on the patch as null (not absent)", () => {
    const patch = validateUpdateProjectMediaInput({ altText: null });
    expect("altText" in patch).toBe(true);
    expect(patch.altText).toBeNull();
  });

  it("both fields present are both included on the patch", () => {
    const patch = validateUpdateProjectMediaInput({ altText: "hello", sortOrder: 3 });
    expect(patch).toEqual({ altText: "hello", sortOrder: 3 });
  });
});

describe("validateUpdateProjectMediaInput — altText", () => {
  it("accepts explicit null", () => {
    expect(validateUpdateProjectMediaInput({ altText: null }).altText).toBeNull();
  });

  it("trims whitespace", () => {
    expect(validateUpdateProjectMediaInput({ altText: "  Cover photo  " }).altText).toBe(
      "Cover photo",
    );
  });

  it("normalizes a blank string to null", () => {
    expect(validateUpdateProjectMediaInput({ altText: "   " }).altText).toBeNull();
  });

  it("rejects a non-string, non-null altText", () => {
    expectBadRequest({ altText: 123 });
  });

  it("rejects altText over the 20000-character defensive limit", () => {
    expectBadRequest({ altText: "a".repeat(20001) });
  });

  it("accepts altText at exactly the 20000-character limit", () => {
    expect(validateUpdateProjectMediaInput({ altText: "a".repeat(20000) }).altText).toHaveLength(
      20000,
    );
  });
});

describe("validateUpdateProjectMediaInput — sortOrder", () => {
  it("accepts a positive integer", () => {
    expect(validateUpdateProjectMediaInput({ sortOrder: 5 }).sortOrder).toBe(5);
  });

  it("rejects null", () => {
    expectBadRequest({ sortOrder: null });
  });

  it("rejects a non-integer", () => {
    expectBadRequest({ sortOrder: 1.5 });
  });

  it("rejects int4 out-of-range values", () => {
    expectBadRequest({ sortOrder: 2147483648 });
    expectBadRequest({ sortOrder: -2147483649 });
  });

  it("accepts the int4 boundary values", () => {
    expect(validateUpdateProjectMediaInput({ sortOrder: 2147483647 }).sortOrder).toBe(2147483647);
    expect(validateUpdateProjectMediaInput({ sortOrder: -2147483648 }).sortOrder).toBe(
      -2147483648,
    );
  });
});
