import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { validateSaveWeddingDetailsInput } from "../validate-save-wedding-details-input";

const fullValidBody = {
  groomName: "Nguyễn Văn Hiếu",
  brideName: "Trần Thị Bình",
  groomFather: "Nguyễn Văn A",
  groomMother: "Lê Thị B",
  brideFather: "Trần Văn C",
  brideMother: "Phạm Thị D",
  groomFamilyAddress: "Hà Nội",
  brideFamilyAddress: "Hồ Chí Minh",
  invitationMessage: "Trân trọng kính mời",
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

describe("validateSaveWeddingDetailsInput", () => {
  it("accepts a full valid body and normalizes it", () => {
    const result = validateSaveWeddingDetailsInput(fullValidBody);
    expect(result).toEqual(fullValidBody);
  });

  it("rejects a non-object body", () => {
    expect(() => validateSaveWeddingDetailsInput(null)).toThrow(ApiError);
    expect(() => validateSaveWeddingDetailsInput("string")).toThrow(ApiError);
    expect(() => validateSaveWeddingDetailsInput([])).toThrow(ApiError);
  });

  it("rejects a body missing a required (nullable) field rather than defaulting it", () => {
    const { loveStory, ...withoutLoveStory } = fullValidBody;
    void loveStory;

    expect(() => validateSaveWeddingDetailsInput(withoutLoveStory)).toThrow(ApiError);
  });

  it("rejects an unknown field", () => {
    expect(() =>
      validateSaveWeddingDetailsInput({ ...fullValidBody, extraField: "nope" }),
    ).toThrow(ApiError);
  });

  it.each(["id", "projectId", "project_id", "createdAt", "created_at", "updatedAt", "updated_at"])(
    "rejects the server-owned field %s even if it matches what the server would compute",
    (field) => {
      expect(() =>
        validateSaveWeddingDetailsInput({ ...fullValidBody, [field]: "11111111-1111-1111-1111-111111111111" }),
      ).toThrow(ApiError);
    },
  );

  it("rejects a non-string value for a text field", () => {
    expect(() =>
      validateSaveWeddingDetailsInput({ ...fullValidBody, groomName: 123 }),
    ).toThrow(ApiError);
  });

  it("trims a text field and normalizes empty string to null", () => {
    const result = validateSaveWeddingDetailsInput({
      ...fullValidBody,
      groomName: "  Nguyễn Văn Hiếu  ",
      additionalNote: "   ",
    });

    expect(result.groomName).toBe("Nguyễn Văn Hiếu");
    expect(result.additionalNote).toBeNull();
  });

  it("rejects a text field exceeding the defensive max length", () => {
    expect(() =>
      validateSaveWeddingDetailsInput({ ...fullValidBody, loveStory: "a".repeat(20001) }),
    ).toThrow(ApiError);
  });

  it("accepts a valid UUID for a bank QR media id field", () => {
    const result = validateSaveWeddingDetailsInput({
      ...fullValidBody,
      groomBankQrMediaId: "11111111-1111-1111-1111-111111111111",
    });

    expect(result.groomBankQrMediaId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("rejects a malformed UUID for a bank QR media id field", () => {
    expect(() =>
      validateSaveWeddingDetailsInput({ ...fullValidBody, brideBankQrMediaId: "not-a-uuid" }),
    ).toThrow(ApiError);
  });
});
