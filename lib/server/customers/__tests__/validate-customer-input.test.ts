import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { validateCreateCustomerInput } from "../validate-customer-input";

describe("validateCreateCustomerInput", () => {
  it("accepts a minimal valid body with only displayName", () => {
    const result = validateCreateCustomerInput({ displayName: "Nguyễn Văn A" });

    expect(result).toEqual({
      displayName: "Nguyễn Văn A",
      phone: null,
      email: null,
      contactNote: null,
    });
  });

  it("accepts and trims optional fields", () => {
    const result = validateCreateCustomerInput({
      displayName: "  Trần Thị B  ",
      phone: " 0901234567 ",
      email: "b@example.com",
      contactNote: "Family shares this phone",
    });

    expect(result).toEqual({
      displayName: "Trần Thị B",
      phone: "0901234567",
      email: "b@example.com",
      contactNote: "Family shares this phone",
    });
  });

  it("rejects a missing displayName", () => {
    expect(() => validateCreateCustomerInput({})).toThrow(ApiError);
  });

  it("rejects an empty/whitespace-only displayName", () => {
    expect(() => validateCreateCustomerInput({ displayName: "   " })).toThrow(ApiError);
  });

  it("rejects a non-string displayName", () => {
    expect(() => validateCreateCustomerInput({ displayName: 123 })).toThrow(ApiError);
  });

  it("rejects a non-object body", () => {
    expect(() => validateCreateCustomerInput("not-an-object")).toThrow(ApiError);
    expect(() => validateCreateCustomerInput(null)).toThrow(ApiError);
    expect(() => validateCreateCustomerInput([])).toThrow(ApiError);
  });

  it("ignores a client-supplied createdBy rather than trusting it", () => {
    const result = validateCreateCustomerInput({
      displayName: "Lê Văn C",
      createdBy: "attacker-supplied-uuid",
    });

    expect(Object.keys(result)).not.toContain("createdBy");
  });

  it("does not reject a shared phone/email (no app-layer uniqueness check)", () => {
    // docs/PHYSICAL_DATABASE_PLAN.md §2.2 — DB design explicitly permits a
    // shared family phone/email; validation must not invent a constraint
    // the database does not enforce.
    expect(() =>
      validateCreateCustomerInput({ displayName: "Same Family", phone: "0900000000" }),
    ).not.toThrow();
  });
});
