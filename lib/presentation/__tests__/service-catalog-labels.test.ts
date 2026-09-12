import { describe, expect, it } from "vitest";

import { getAddonLabel, getPackageLabel } from "../service-catalog-labels";

describe("getPackageLabel", () => {
  it("maps COMMON by code", () => {
    expect(getPackageLabel("COMMON", "Common Invitation")).toBe("Thiệp chung hai bên");
  });

  it("maps SEPARATE by code, ignoring the raw catalog name", () => {
    expect(
      getPackageLabel("SEPARATE", "Separate Groom-side / Bride-side Invitations"),
    ).toBe("Thiệp riêng nhà trai / nhà gái");
  });

  it("falls back to the stored snapshot name for an unrecognized code", () => {
    expect(getPackageLabel("FUTURE_CODE", "Some Future Package")).toBe("Some Future Package");
  });
});

describe("getAddonLabel", () => {
  it("maps PERSONALIZED_GUEST by code", () => {
    expect(getAddonLabel("PERSONALIZED_GUEST", "Personalized Guest Names")).toBe(
      "Cá nhân hóa tên khách mời",
    );
  });

  it("falls back to the stored snapshot name for an unrecognized code", () => {
    expect(getAddonLabel("FUTURE_ADDON", "Some Future Addon")).toBe("Some Future Addon");
  });
});
