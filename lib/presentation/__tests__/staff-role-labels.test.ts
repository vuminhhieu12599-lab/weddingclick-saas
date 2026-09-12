import { describe, expect, it } from "vitest";

import { STAFF_ROLES } from "../../domain";
import { getStaffRoleLabel } from "../staff-role-labels";

describe("getStaffRoleLabel", () => {
  it("has a Vietnamese label for every StaffRole", () => {
    for (const role of STAFF_ROLES) {
      expect(getStaffRoleLabel(role).length).toBeGreaterThan(0);
    }
  });

  it("falls back to the raw value for an unrecognized role rather than throwing", () => {
    expect(getStaffRoleLabel("SOMETHING_ELSE")).toBe("SOMETHING_ELSE");
  });
});
