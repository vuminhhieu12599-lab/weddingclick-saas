import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { validateSubmitIntakeInput } from "../validate-submit-intake-input";

const validWeddingDetails = {
  groomName: "Nguyễn Văn Hiếu",
  brideName: "Trần Thị Bình",
  groomFather: null,
  groomMother: null,
  brideFather: null,
  brideMother: null,
  groomFamilyAddress: null,
  brideFamilyAddress: null,
  invitationMessage: null,
  loveStory: null,
  lunarDateDisplay: null,
  additionalNote: null,
  groomBankName: null,
  groomBankAccountName: null,
  groomBankAccountNumber: null,
  groomBankQrMediaId: null,
  brideBankName: null,
  brideBankAccountName: null,
  brideBankAccountNumber: null,
  brideBankQrMediaId: null,
};

describe("validateSubmitIntakeInput", () => {
  it("accepts the frozen nested shape and returns the exact validated Wedding Details fields", () => {
    const result = validateSubmitIntakeInput({ weddingDetails: validWeddingDetails });
    expect(result).toEqual(validWeddingDetails);
  });

  it("rejects a non-object body", () => {
    expect(() => validateSubmitIntakeInput("not-an-object")).toThrow(ApiError);
  });

  it("rejects a null body", () => {
    expect(() => validateSubmitIntakeInput(null)).toThrow(ApiError);
  });

  it("rejects an array body", () => {
    expect(() => validateSubmitIntakeInput([])).toThrow(ApiError);
  });

  it('rejects a missing "weddingDetails" key', () => {
    const error = (() => {
      try {
        validateSubmitIntakeInput({});
        return undefined;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects an unknown top-level field alongside weddingDetails", () => {
    expect(() =>
      validateSubmitIntakeInput({ weddingDetails: validWeddingDetails, extra: "nope" }),
    ).toThrow(ApiError);
  });

  it("rejects a flattened (non-nested) payload — the frozen shape requires nesting under weddingDetails", () => {
    expect(() => validateSubmitIntakeInput(validWeddingDetails)).toThrow(ApiError);
  });

  it.each(["projectId", "accessLinkId", "status", "reviewedBy", "reviewedAt", "staffNote"])(
    "rejects a caller-controlled %s field at the top level",
    (field) => {
      expect(() =>
        validateSubmitIntakeInput({ weddingDetails: validWeddingDetails, [field]: "x" }),
      ).toThrow(ApiError);
    },
  );

  it("mechanically reuses the Task-022 validator — rejects a server-owned field nested inside weddingDetails", () => {
    expect(() =>
      validateSubmitIntakeInput({
        weddingDetails: { ...validWeddingDetails, projectId: "attacker-supplied" },
      }),
    ).toThrow(ApiError);
  });

  it("mechanically reuses the Task-022 validator — rejects a missing Wedding Details field", () => {
    const incomplete: Record<string, unknown> = { ...validWeddingDetails };
    delete incomplete.groomName;
    expect(() => validateSubmitIntakeInput({ weddingDetails: incomplete })).toThrow(ApiError);
  });

  it("mechanically reuses the Task-022 validator — a non-object weddingDetails value is BAD_REQUEST", () => {
    expect(() => validateSubmitIntakeInput({ weddingDetails: "nope" })).toThrow(ApiError);
  });
});
