import { describe, expect, it } from "vitest";

import { getAssignedStaffLabel } from "../assigned-staff";

describe("getAssignedStaffLabel", () => {
  it("returns the staff display name when assigned", () => {
    expect(getAssignedStaffLabel({ id: "s1", displayName: "Nguyễn Văn A" })).toBe(
      "Nguyễn Văn A",
    );
  });

  it("returns a fallback label when unassigned", () => {
    expect(getAssignedStaffLabel(null)).toBe("Chưa phân công");
  });
});
