import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { validateFinalizeMediaInput } from "../validate-finalize-media-input";

const projectId = "11111111-1111-1111-1111-111111111111";
const uuid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const storagePath = `${projectId}/${uuid}`;

function expectBadRequest(body: unknown, canonicalProjectId = projectId) {
  const error = (() => {
    try {
      validateFinalizeMediaInput(body, canonicalProjectId);
      return undefined;
    } catch (e) {
      return e;
    }
  })();
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).kind).toBe("BAD_REQUEST");
}

describe("validateFinalizeMediaInput — unknown/forbidden fields", () => {
  it.each([
    "mimeType",
    "sizeBytes",
    "storageBucket",
    "projectId",
    "createdBy",
    "width",
    "height",
    "id",
    "createdAt",
    "updatedAt",
  ])('rejects "%s" as an unknown field', (field) => {
    expectBadRequest({ mediaType: "COVER", storagePath, [field]: "x" });
  });

  it("rejects a non-object body", () => {
    expectBadRequest("not-an-object");
    expectBadRequest(null);
    expectBadRequest([]);
  });
});

describe("validateFinalizeMediaInput — storagePath scoping", () => {
  it("accepts an exact <projectId>/<uuid> path", () => {
    const result = validateFinalizeMediaInput({ mediaType: "COVER", storagePath }, projectId);
    expect(result.storagePath).toBe(storagePath);
  });

  it("rejects a path belonging to a different project", () => {
    const otherProjectId = "22222222-2222-2222-2222-222222222222";
    expectBadRequest({ mediaType: "COVER", storagePath: `${otherProjectId}/${uuid}` }, projectId);
  });

  it("rejects a malformed second segment (not a UUID)", () => {
    expectBadRequest({ mediaType: "COVER", storagePath: `${projectId}/not-a-uuid` }, projectId);
  });

  it("rejects a path with a third segment", () => {
    expectBadRequest({ mediaType: "COVER", storagePath: `${storagePath}/extra` }, projectId);
  });

  it("rejects a path with a query string", () => {
    expectBadRequest({ mediaType: "COVER", storagePath: `${storagePath}?x=1` }, projectId);
  });

  it("rejects a path with a file extension appended", () => {
    expectBadRequest({ mediaType: "COVER", storagePath: `${storagePath}.jpg` }, projectId);
  });

  it("rejects an uppercase project-id segment even if otherwise well-formed", () => {
    const hexProjectId = "aabbccdd-1111-2222-3333-444455556666";
    expectBadRequest(
      { mediaType: "COVER", storagePath: `${hexProjectId.toUpperCase()}/${uuid}` },
      hexProjectId,
    );
  });

  it("rejects a missing storagePath", () => {
    expectBadRequest({ mediaType: "COVER" });
  });
});

describe("validateFinalizeMediaInput — mediaType", () => {
  it("rejects an invalid mediaType", () => {
    expectBadRequest({ mediaType: "BANNER", storagePath });
  });

  it("rejects a missing mediaType", () => {
    expectBadRequest({ storagePath });
  });
});

describe("validateFinalizeMediaInput — altText", () => {
  it("defaults to null when absent", () => {
    const result = validateFinalizeMediaInput({ mediaType: "COVER", storagePath }, projectId);
    expect(result.altText).toBeNull();
  });

  it("accepts explicit null", () => {
    const result = validateFinalizeMediaInput(
      { mediaType: "COVER", storagePath, altText: null },
      projectId,
    );
    expect(result.altText).toBeNull();
  });

  it("trims whitespace", () => {
    const result = validateFinalizeMediaInput(
      { mediaType: "COVER", storagePath, altText: "  Cover photo  " },
      projectId,
    );
    expect(result.altText).toBe("Cover photo");
  });

  it("normalizes a blank string to null", () => {
    const result = validateFinalizeMediaInput(
      { mediaType: "COVER", storagePath, altText: "   " },
      projectId,
    );
    expect(result.altText).toBeNull();
  });

  it("rejects a non-string, non-null altText", () => {
    expectBadRequest({ mediaType: "COVER", storagePath, altText: 123 });
  });

  it("rejects altText over the 20000-character defensive limit", () => {
    expectBadRequest({ mediaType: "COVER", storagePath, altText: "a".repeat(20001) });
  });

  it("accepts altText at exactly the 20000-character limit", () => {
    const result = validateFinalizeMediaInput(
      { mediaType: "COVER", storagePath, altText: "a".repeat(20000) },
      projectId,
    );
    expect(result.altText).toHaveLength(20000);
  });
});

describe("validateFinalizeMediaInput — sortOrder", () => {
  it("defaults to 0 when absent", () => {
    const result = validateFinalizeMediaInput({ mediaType: "COVER", storagePath }, projectId);
    expect(result.sortOrder).toBe(0);
  });

  it("accepts a positive integer", () => {
    const result = validateFinalizeMediaInput(
      { mediaType: "COVER", storagePath, sortOrder: 5 },
      projectId,
    );
    expect(result.sortOrder).toBe(5);
  });

  it("rejects null", () => {
    expectBadRequest({ mediaType: "COVER", storagePath, sortOrder: null });
  });

  it("rejects a non-integer", () => {
    expectBadRequest({ mediaType: "COVER", storagePath, sortOrder: 1.5 });
  });

  it("rejects int4 out-of-range values", () => {
    expectBadRequest({ mediaType: "COVER", storagePath, sortOrder: 2147483648 });
    expectBadRequest({ mediaType: "COVER", storagePath, sortOrder: -2147483649 });
  });

  it("accepts the int4 boundary values", () => {
    expect(
      validateFinalizeMediaInput(
        { mediaType: "COVER", storagePath, sortOrder: 2147483647 },
        projectId,
      ).sortOrder,
    ).toBe(2147483647);
    expect(
      validateFinalizeMediaInput(
        { mediaType: "COVER", storagePath, sortOrder: -2147483648 },
        projectId,
      ).sortOrder,
    ).toBe(-2147483648);
  });
});
