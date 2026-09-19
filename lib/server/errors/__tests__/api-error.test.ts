import { describe, expect, it } from "vitest";

import { apiErrorStatus } from "../api-error";

/**
 * Task 022 error-contract patch: `INVARIANT` (422) was added to the shared
 * ApiErrorKind/apiErrorStatus contract (docs/API_CONTRACT.md §5). Task 026
 * Phase 2 (docs/DECISIONS.md D3) added `EXPIRED_TOKEN`/`REVOKED_TOKEN`
 * (both 410). This test proves every mapping, old and new.
 */
describe("apiErrorStatus", () => {
  it.each([
    ["BAD_REQUEST", 400],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["EXPIRED_TOKEN", 410],
    ["REVOKED_TOKEN", 410],
    ["INVARIANT", 422],
    ["INTERNAL", 500],
  ] as const)("maps %s to %d", (kind, status) => {
    expect(apiErrorStatus(kind)).toBe(status);
  });
});
