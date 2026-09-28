import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { validateProjectEventInput } from "../validate-project-event-input";

const validBody = {
  occasionType: "VU_QUY",
  side: "BRIDE",
  title: "Lễ Vu Quy",
  startsAt: "2027-02-14T01:00:00.000Z",
  timezone: "Asia/Ho_Chi_Minh",
  venueName: "Nhà hàng Riverside",
  address: "123 Nguyễn Huệ, Quận 1",
  mapUrl: "https://maps.example.com/venue",
  description: "Tiệc cưới nhà gái",
  sortOrder: 1,
  isPrimary: true,
  lunarDateDisplay: "Ngày 17 tháng 01 năm Đinh Mùi",
};

describe("validateProjectEventInput", () => {
  it("accepts a fully populated valid body", () => {
    const result = validateProjectEventInput(validBody);

    expect(result).toEqual({
      occasionType: "VU_QUY",
      side: "BRIDE",
      title: "Lễ Vu Quy",
      startsAt: new Date(validBody.startsAt).toISOString(),
      timezone: "Asia/Ho_Chi_Minh",
      venueName: "Nhà hàng Riverside",
      address: "123 Nguyễn Huệ, Quận 1",
      mapUrl: "https://maps.example.com/venue",
      description: "Tiệc cưới nhà gái",
      sortOrder: 1,
      isPrimary: true,
      lunarDateDisplay: "Ngày 17 tháng 01 năm Đinh Mùi",
    });
  });

  it("accepts null for nullable fields", () => {
    const result = validateProjectEventInput({
      ...validBody,
      venueName: null,
      address: null,
      mapUrl: null,
      description: null,
      lunarDateDisplay: null,
    });

    expect(result.venueName).toBeNull();
    expect(result.address).toBeNull();
    expect(result.mapUrl).toBeNull();
    expect(result.description).toBeNull();
    expect(result.lunarDateDisplay).toBeNull();
  });

  it("accepts the schema's own default IANA timezone (regression: Intl.supportedValuesOf omits this alias)", () => {
    const result = validateProjectEventInput({ ...validBody, timezone: "Asia/Ho_Chi_Minh" });
    expect(result.timezone).toBe("Asia/Ho_Chi_Minh");
  });

  it("rejects a non-object body", () => {
    expect(() => validateProjectEventInput("not an object")).toThrow(ApiError);
    expect(() => validateProjectEventInput(null)).toThrow(ApiError);
    expect(() => validateProjectEventInput([])).toThrow(ApiError);
  });

  it("rejects an unknown field", () => {
    expect(() => validateProjectEventInput({ ...validBody, extra: "nope" })).toThrow(ApiError);
  });

  it.each(["id", "projectId", "project_id", "createdAt", "created_at", "updatedAt", "updated_at"])(
    "rejects the forbidden server-owned field %s",
    (field) => {
      expect(() =>
        validateProjectEventInput({ ...validBody, [field]: "attacker-supplied" }),
      ).toThrow(ApiError);
    },
  );

  it("rejects a missing required field", () => {
    const withoutOccasionType: Record<string, unknown> = { ...validBody };
    delete withoutOccasionType.occasionType;
    expect(() => validateProjectEventInput(withoutOccasionType)).toThrow(ApiError);
  });

  it("rejects an invalid occasionType", () => {
    expect(() => validateProjectEventInput({ ...validBody, occasionType: "BIRTHDAY" })).toThrow(
      ApiError,
    );
  });

  it("rejects an invalid side", () => {
    expect(() => validateProjectEventInput({ ...validBody, side: "GUEST" })).toThrow(ApiError);
  });

  it("rejects an empty title", () => {
    expect(() => validateProjectEventInput({ ...validBody, title: "   " })).toThrow(ApiError);
  });

  it("rejects a non-string title", () => {
    expect(() => validateProjectEventInput({ ...validBody, title: 123 })).toThrow(ApiError);
  });

  it("rejects a malformed startsAt", () => {
    expect(() => validateProjectEventInput({ ...validBody, startsAt: "not-a-date" })).toThrow(
      ApiError,
    );
  });

  it("rejects a date-only startsAt", () => {
    expect(() =>
      validateProjectEventInput({ ...validBody, startsAt: "2027-02-14" }),
    ).toThrow(ApiError);
  });

  it("rejects an offsetless startsAt datetime", () => {
    expect(() =>
      validateProjectEventInput({ ...validBody, startsAt: "2027-02-14T01:00:00" }),
    ).toThrow(ApiError);
  });

  it("rejects an impossible calendar date for startsAt", () => {
    expect(() =>
      validateProjectEventInput({ ...validBody, startsAt: "2027-02-30T01:00:00Z" }),
    ).toThrow(ApiError);
  });

  it("accepts an explicit +07:00 offset and normalizes startsAt to UTC", () => {
    const result = validateProjectEventInput({
      ...validBody,
      startsAt: "2027-02-14T08:00:00+07:00",
    });

    expect(result.startsAt).toBe("2027-02-14T01:00:00.000Z");
  });

  it("rejects an invalid IANA timezone", () => {
    expect(() =>
      validateProjectEventInput({ ...validBody, timezone: "Not/AZone" }),
    ).toThrow(ApiError);
  });

  it("rejects a non-https mapUrl", () => {
    expect(() =>
      validateProjectEventInput({ ...validBody, mapUrl: "http://maps.example.com/venue" }),
    ).toThrow(ApiError);
  });

  it("rejects a javascript: mapUrl", () => {
    expect(() =>
      validateProjectEventInput({ ...validBody, mapUrl: "javascript:alert(1)" }),
    ).toThrow(ApiError);
  });

  it("rejects a non-integer sortOrder", () => {
    expect(() => validateProjectEventInput({ ...validBody, sortOrder: 1.5 })).toThrow(ApiError);
    expect(() => validateProjectEventInput({ ...validBody, sortOrder: "1" })).toThrow(ApiError);
  });

  it("rejects a non-boolean isPrimary", () => {
    expect(() => validateProjectEventInput({ ...validBody, isPrimary: "true" })).toThrow(
      ApiError,
    );
  });

  describe("lunarDateDisplay (RF-L03 — same nullable-text convention as venueName/address/description)", () => {
    it("accepts and trims a non-empty lunar display string", () => {
      const result = validateProjectEventInput({
        ...validBody,
        lunarDateDisplay: "  Ngày 17 tháng 01 năm Đinh Mùi  ",
      });
      expect(result.lunarDateDisplay).toBe("Ngày 17 tháng 01 năm Đinh Mùi");
    });

    it("accepts explicit null", () => {
      const result = validateProjectEventInput({ ...validBody, lunarDateDisplay: null });
      expect(result.lunarDateDisplay).toBeNull();
    });

    it.each(["", "   ", "\n\t "])("normalizes empty/whitespace-only %j to null", (value) => {
      const result = validateProjectEventInput({ ...validBody, lunarDateDisplay: value });
      expect(result.lunarDateDisplay).toBeNull();
    });

    it("rejects a body missing the lunarDateDisplay key (full-resource input — no silent default)", () => {
      const withoutLunar: Record<string, unknown> = { ...validBody };
      delete withoutLunar.lunarDateDisplay;

      const error = (() => {
        try {
          validateProjectEventInput(withoutLunar);
        } catch (e) {
          return e;
        }
      })();

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe("BAD_REQUEST");
      expect((error as ApiError).message).toBe('"lunarDateDisplay" is required');
    });

    it("rejects undefined the same as the other nullable text fields (key present, not string/null)", () => {
      expect(() =>
        validateProjectEventInput({ ...validBody, lunarDateDisplay: undefined }),
      ).toThrow(ApiError);
    });

    it.each([123, true, {}, [], ["Ngày 17"]])("rejects the wrong type %j", (value) => {
      expect(() => validateProjectEventInput({ ...validBody, lunarDateDisplay: value })).toThrow(
        '"lunarDateDisplay" must be a string or null',
      );
    });

    it("accepts exactly 20000 characters and rejects 20001 (same cap as the other nullable text fields)", () => {
      const atLimit = validateProjectEventInput({
        ...validBody,
        lunarDateDisplay: "a".repeat(20000),
      });
      expect(atLimit.lunarDateDisplay).toHaveLength(20000);

      expect(() =>
        validateProjectEventInput({ ...validBody, lunarDateDisplay: "a".repeat(20001) }),
      ).toThrow('"lunarDateDisplay" exceeds the maximum length of 20000 characters');
      expect(() =>
        validateProjectEventInput({ ...validBody, description: "a".repeat(20001) }),
      ).toThrow('"description" exceeds the maximum length of 20000 characters');
    });

    it("rejects the snake_case column name as an unknown field", () => {
      expect(() =>
        validateProjectEventInput({ ...validBody, lunar_date_display: "Ngày 17" }),
      ).toThrow('Unknown field "lunar_date_display" is not accepted');
    });
  });
});
