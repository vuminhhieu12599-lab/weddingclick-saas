import { describe, expect, it } from "vitest";

import { STAFF_ROLES } from "../staff-role";
import { PROJECT_STATUSES } from "../project-status";
import { EVENT_TYPES } from "../event-type";
import { INVITATION_VARIANTS } from "../invitation-variant";
import { EVENT_SIDES } from "../event-side";
import { ACCESS_LINK_TYPES } from "../access-link-type";
import { PAYMENT_STATUSES } from "../payment-status";
import { OCCASION_TYPES } from "../occasion-type";
import { REVIEW_FEEDBACK_TYPES } from "../review-feedback-type";
import { INTAKE_SUBMISSION_STATUSES } from "../intake-submission-status";
import { RSVP_ATTENDANCE_STATUSES } from "../rsvp-attendance";
import { INVITATION_VERSION_TYPES } from "../invitation-version-type";
import { PROJECT_TASK_STATUSES } from "../project-task-status";
import { MEDIA_TYPES } from "../media-type";
import { SERVICE_PACKAGE_CODES } from "../service-package-code";
import { SERVICE_ADDON_CODES } from "../service-addon-code";

describe("ProjectStatus", () => {
  it("matches the exact lifecycle approved in docs/DECISIONS.md and migration 0005", () => {
    expect(PROJECT_STATUSES).toEqual([
      "NEW",
      "WAITING_FOR_INFO",
      "IN_PROGRESS",
      "INTERNAL_REVIEW",
      "CUSTOMER_REVIEW",
      "REVISION_REQUIRED",
      "APPROVED",
      "AWAITING_PAYMENT",
      "READY_TO_PUBLISH",
      "PUBLISHED",
      "COMPLETED",
      "ARCHIVED",
    ]);
  });
});

describe("InvitationVariant", () => {
  it("matches the exact set approved in docs/DECISIONS.md", () => {
    expect(INVITATION_VARIANTS).toEqual(["COMMON", "GROOM", "BRIDE"]);
  });
});

describe("PaymentStatus", () => {
  it("matches the exact set in migration 0005_projects.sql", () => {
    expect(PAYMENT_STATUSES).toEqual(["UNPAID", "PAID"]);
  });
});

describe("AccessLinkType", () => {
  it("matches the exact set approved in docs/DECISIONS.md", () => {
    expect(ACCESS_LINK_TYPES).toEqual(["INTAKE", "REVIEW", "PORTAL"]);
  });
});

describe("StaffRole", () => {
  it("matches the exact set in migration 0002_profiles.sql", () => {
    expect(STAFF_ROLES).toEqual(["ADMIN", "STAFF"]);
  });
});

describe("EventType", () => {
  it("supports only WEDDING in V1", () => {
    expect(EVENT_TYPES).toEqual(["WEDDING"]);
  });
});

describe("EventSide", () => {
  it("reuses the InvitationVariant vocabulary rather than an independent set", () => {
    expect(EVENT_SIDES).toBe(INVITATION_VARIANTS);
  });
});

describe("OccasionType", () => {
  it("matches the exact set in docs/DATABASE.md §10", () => {
    expect(OCCASION_TYPES).toEqual(["VU_QUY", "THANH_HON", "RECEPTION", "CUSTOM"]);
  });
});

describe("ReviewFeedbackType", () => {
  it("matches the exact set in docs/DATABASE.md §19", () => {
    expect(REVIEW_FEEDBACK_TYPES).toEqual(["COMMENT", "REVISION_REQUEST", "APPROVAL"]);
  });
});

describe("IntakeSubmissionStatus", () => {
  it("matches the exact set in docs/DATABASE.md §17", () => {
    expect(INTAKE_SUBMISSION_STATUSES).toEqual(["PENDING", "APPLIED", "REJECTED"]);
  });
});

describe("RsvpAttendanceStatus", () => {
  it("matches the exact set in docs/DATABASE.md §21", () => {
    expect(RSVP_ATTENDANCE_STATUSES).toEqual(["ATTENDING", "NOT_ATTENDING"]);
  });
});

describe("InvitationVersionType", () => {
  it("matches the exact set in docs/DATABASE.md §16", () => {
    expect(INVITATION_VERSION_TYPES).toEqual(["REVIEW", "PUBLISHED"]);
  });
});

describe("ProjectTaskStatus", () => {
  it("matches the exact set in docs/DATABASE.md §22", () => {
    expect(PROJECT_TASK_STATUSES).toEqual(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]);
  });
});

describe("MediaType", () => {
  it("matches the exact set in docs/PHYSICAL_DATABASE_PLAN.md §2.9", () => {
    expect(MEDIA_TYPES).toEqual(["COVER", "GALLERY", "AUDIO", "QR_GROOM", "QR_BRIDE", "QR_COMMON"]);
  });
});

describe("ServicePackageCode", () => {
  it("matches the initial package codes in docs/DATABASE.md §5", () => {
    expect(SERVICE_PACKAGE_CODES).toEqual(["COMMON", "SEPARATE"]);
  });
});

describe("ServiceAddonCode", () => {
  it("matches the initial add-on code in docs/DATABASE.md §6", () => {
    expect(SERVICE_ADDON_CODES).toEqual(["PERSONALIZED_GUEST"]);
  });
});
