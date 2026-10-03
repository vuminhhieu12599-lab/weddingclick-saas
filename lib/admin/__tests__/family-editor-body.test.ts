import { describe, expect, it } from "vitest";

import type { WeddingDetailsRecord } from "../../server/wedding-details/wedding-details-types";
import { buildWeddingDetailsPatchBody, FAMILY_FIELDS, familyFormFrom } from "../optional-content-editor";

const current = {
  id: "w1",
  projectId: "11111111-1111-4111-8111-111111111111",
  groomName: "Minh",
  brideName: "Lan",
  groomFather: "Ông Nguyễn Văn A",
  groomMother: null,
  brideFather: null,
  brideMother: "Bà Trần Thị B",
  groomFamilyAddress: null,
  brideFamilyAddress: "Huế",
  invitationMessage: "Lời mời",
  loveStory: "Chuyện",
  lunarDateDisplay: "Ngày 17 tháng 01",
  additionalNote: "nội bộ",
  groomBankName: "VCB",
  groomBankAccountName: "MINH",
  groomBankAccountNumber: "123",
  groomBankQrMediaId: "22222222-2222-4222-8222-222222222222",
  brideBankName: null,
  brideBankAccountName: null,
  brideBankAccountNumber: null,
  brideBankQrMediaId: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
} as WeddingDetailsRecord;

describe("family editor body", () => {
  it("edits exactly the six canonical family fields", () => {
    expect([...FAMILY_FIELDS]).toEqual([
      "groomFather",
      "groomMother",
      "groomFamilyAddress",
      "brideFather",
      "brideMother",
      "brideFamilyAddress",
    ]);
  });

  it("loads existing values; missing values start blank (no fake names)", () => {
    expect(familyFormFrom(current)).toEqual({
      groomFather: "Ông Nguyễn Văn A",
      groomMother: "",
      groomFamilyAddress: "",
      brideFather: "",
      brideMother: "Bà Trần Thị B",
      brideFamilyAddress: "Huế",
    });
    expect(Object.values(familyFormFrom(null)).every((value) => value === "")).toBe(true);
  });

  it("saves groom-side and bride-side values, trimmed; blanks become null", () => {
    const form = {
      ...familyFormFrom(current),
      groomMother: "  Bà Lê Thị C ",
      groomFamilyAddress: "Hà Nội",
      brideFather: "Ông Phạm Văn D",
      brideFamilyAddress: "   ",
    };
    const result = buildWeddingDetailsPatchBody(current, { family: form });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.groomMother).toBe("Bà Lê Thị C");
    expect(result.value.groomFamilyAddress).toBe("Hà Nội");
    expect(result.value.brideFather).toBe("Ông Phạm Văn D");
    expect(result.value.brideFamilyAddress).toBeNull();
  });

  it("preserves every unrelated wedding_details field on the full-replace PUT", () => {
    const result = buildWeddingDetailsPatchBody(current, { family: familyFormFrom(current) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const [field, value] of Object.entries(result.value)) {
      expect(value, field).toBe(current[field as keyof WeddingDetailsRecord]);
    }
    expect(Object.keys(result.value)).toHaveLength(20);
  });

  it("requires saved wedding details (names) first", () => {
    expect(buildWeddingDetailsPatchBody(null, { family: familyFormFrom(null) }).ok).toBe(false);
  });
});
