import { describe, expect, it } from "vitest";

import { apiErrorStatus } from "../api-error";

/**
 * Task 022 error-contract patch: `INVARIANT` (422) was added to the shared
 * ApiErrorKind/apiErrorStatus contract (docs/API_CONTRACT.md §5). This test
 * proves the new mapping and that every pre-existing mapping is unchanged.
 */
describe("apiErrorStatus", () => {
  it.each([
    ["BAD_REQUEST", 400],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["INVARIANT", 422],
    ["INTERNAL", 500],
  ] as const)("maps %s to %d", (kind, status) => {
    expect(apiErrorStatus(kind)).toBe(status);
  });
});
