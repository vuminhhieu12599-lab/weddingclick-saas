import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { validateCreateProjectRequest } from "../validate-create-project-request";

const validCustomerId = "11111111-1111-1111-1111-111111111111";
const validStaffId = "22222222-2222-2222-2222-222222222222";

describe("validateCreateProjectRequest", () => {
  it("accepts a minimal valid request", () => {
    const result = validateCreateProjectRequest({
      customerId: validCustomerId,
      packageCode: "COMMON",
    });

    expect(result).toEqual({
      customerId: validCustomerId,
      packageCode: "COMMON",
      addonCodes: [],
      assignedStaffId: null,
      deadlineAt: null,
    });
  });

  it("accepts a fully populated valid request", () => {
    const result = validateCreateProjectRequest({
      customerId: validCustomerId,
      packageCode: "SEPARATE",
      addonCodes: ["PERSONALIZED_GUEST"],
      assignedStaffId: validStaffId,
      deadlineAt: "2026-12-01T00:00:00.000Z",
    });

    expect(result).toEqual({
      customerId: validCustomerId,
      packageCode: "SEPARATE",
      addonCodes: ["PERSONALIZED_GUEST"],
      assignedStaffId: validStaffId,
      deadlineAt: "2026-12-01T00:00:00.000Z",
    });
  });

  it("rejects a missing/invalid customerId", () => {
    expect(() => validateCreateProjectRequest({ packageCode: "COMMON" })).toThrow(ApiError);
    expect(() =>
      validateCreateProjectRequest({ customerId: "not-a-uuid", packageCode: "COMMON" }),
    ).toThrow(ApiError);
  });

  it("rejects a missing packageCode", () => {
    expect(() => validateCreateProjectRequest({ customerId: validCustomerId })).toThrow(ApiError);
  });

  it("rejects a malformed assignedStaffId", () => {
    expect(() =>
      validateCreateProjectRequest({
        customerId: validCustomerId,
        packageCode: "COMMON",
        assignedStaffId: "not-a-uuid",
      }),
    ).toThrow(ApiError);
  });

  it.each([
    "2026-09-20T17:00:00+07:00",
    "2026-09-20T10:00:00Z",
    "2026-09-20T10:00:00.123Z",
  ])("accepts a valid timezone-aware deadlineAt %s", (deadlineAt) => {
    const result = validateCreateProjectRequest({
      customerId: validCustomerId,
      packageCode: "COMMON",
      deadlineAt,
    });

    expect(result.deadlineAt).toBe(deadlineAt);
  });

  it.each([
    "2026-09-20",
    "2026-09-20T17:00:00",
    "09/20/2026 17:00",
    "2026-02-30T17:00:00+07:00",
    "not-a-date",
  ])("rejects a deadlineAt that is not a timezone-aware RFC 3339 timestamp: %s", (deadlineAt) => {
    expect(() =>
      validateCreateProjectRequest({
        customerId: validCustomerId,
        packageCode: "COMMON",
        deadlineAt,
      }),
    ).toThrow(ApiError);
  });

  it("rejects a non-array addonCodes", () => {
    expect(() =>
      validateCreateProjectRequest({
        customerId: validCustomerId,
        packageCode: "COMMON",
        addonCodes: "PERSONALIZED_GUEST",
      }),
    ).toThrow(ApiError);
  });

});

// Separate describe so the forbidden-field cases above assert the throw
// (it.each with an assertion inside the body reads awkwardly with toThrow).
describe("validateCreateProjectRequest — forbidden fields", () => {
  const forbiddenFields = [
    "projectCode",
    "basePriceVnd",
    "addonTotalVnd",
    "totalPriceVnd",
    "paymentStatus",
    "paidAt",
    "createdBy",
    "status",
    "eventType",
    "servicePackageId",
  ];

  for (const field of forbiddenFields) {
    it(`rejects a request that includes forbidden field "${field}"`, () => {
      const body: Record<string, unknown> = {
        customerId: validCustomerId,
        packageCode: "COMMON",
        [field]: "anything",
      };

      expect(() => validateCreateProjectRequest(body)).toThrow(ApiError);
    });
  }
});
