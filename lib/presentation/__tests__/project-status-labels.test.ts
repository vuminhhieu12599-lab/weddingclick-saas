import { describe, expect, it } from "vitest";

import { PROJECT_STATUSES } from "../../domain";
import {
  getProjectStatusLabel,
  getProjectStatusTone,
  isStatusNeedingStaffAttention,
} from "../project-status-labels";

describe("getProjectStatusLabel", () => {
  it("has a Vietnamese label for every ProjectStatus", () => {
    for (const status of PROJECT_STATUSES) {
      expect(getProjectStatusLabel(status).length).toBeGreaterThan(0);
    }
  });

  it("uses the approved GROOM/BRIDE-neutral wording for CUSTOMER_REVIEW", () => {
    expect(getProjectStatusLabel("CUSTOMER_REVIEW")).toBe("Khách đang duyệt");
  });
});

describe("getProjectStatusTone", () => {
  it("has a tone for every ProjectStatus", () => {
    for (const status of PROJECT_STATUSES) {
      expect(getProjectStatusTone(status)).toBeTruthy();
    }
  });

  it("marks REVISION_REQUIRED as danger", () => {
    expect(getProjectStatusTone("REVISION_REQUIRED")).toBe("danger");
  });
});

describe("isStatusNeedingStaffAttention", () => {
  it("flags NEW and IN_PROGRESS as needing attention", () => {
    expect(isStatusNeedingStaffAttention("NEW")).toBe(true);
    expect(isStatusNeedingStaffAttention("IN_PROGRESS")).toBe(true);
  });

  it("does not flag PUBLISHED or ARCHIVED", () => {
    expect(isStatusNeedingStaffAttention("PUBLISHED")).toBe(false);
    expect(isStatusNeedingStaffAttention("ARCHIVED")).toBe(false);
  });
});
