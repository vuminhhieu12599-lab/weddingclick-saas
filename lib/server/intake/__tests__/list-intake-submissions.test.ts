import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { IntakeStaffGateway } from "../intake-staff-gateway";
import type { IntakeSubmissionRecord } from "../intake-types";
import { listIntakeSubmissionsByProjectId } from "../list-intake-submissions";

interface FakeClient {
  marker: string;
}

const staff: StaffContext<FakeClient> = {
  userId: "staff-1",
  role: "STAFF",
  displayName: "Test Staff",
  supabase: { marker: "fake" },
};

const projectId = "11111111-1111-1111-1111-111111111111";

const existingSubmission: IntakeSubmissionRecord = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  projectId,
  accessLinkId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  status: "PENDING",
  submittedAt: "2026-09-19T00:00:00.000Z",
  reviewedBy: null,
  reviewedAt: null,
  staffNote: null,
  weddingDetails: {
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
  },
};

function createFakeGateway(options: {
  projectExists: boolean;
  submissions: IntakeSubmissionRecord[];
}): IntakeStaffGateway<FakeClient> {
  return {
    async projectExists() {
      return options.projectExists;
    },
    async listIntakeSubmissionsByProjectId() {
      return options.submissions;
    },
    async getIntakeSubmissionById() {
      throw new Error("should not be called");
    },
    async applyIntakeSubmission() {
      throw new Error("should not be called");
    },
    async rejectIntakeSubmission() {
      throw new Error("should not be called");
    },
  };
}

describe("listIntakeSubmissionsByProjectId", () => {
  it("returns submissions when the project exists and has submissions", async () => {
    const gateway = createFakeGateway({ projectExists: true, submissions: [existingSubmission] });
    const result = await listIntakeSubmissionsByProjectId(projectId, staff, gateway);
    expect(result).toEqual([existingSubmission]);
  });

  it("returns an empty array when the project exists but has no submissions", async () => {
    const gateway = createFakeGateway({ projectExists: true, submissions: [] });
    const result = await listIntakeSubmissionsByProjectId(projectId, staff, gateway);
    expect(result).toEqual([]);
  });

  it("throws NOT_FOUND when the project does not exist", async () => {
    const gateway = createFakeGateway({ projectExists: false, submissions: [] });
    const error = await listIntakeSubmissionsByProjectId(projectId, staff, gateway).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("rejects a malformed project id as BAD_REQUEST without querying the gateway", async () => {
    let called = false;
    const gateway: IntakeStaffGateway<FakeClient> = {
      async projectExists() {
        called = true;
        return true;
      },
      async listIntakeSubmissionsByProjectId() {
        return [];
      },
      async getIntakeSubmissionById() {
        throw new Error("should not be called");
      },
      async applyIntakeSubmission() {
        throw new Error("should not be called");
      },
      async rejectIntakeSubmission() {
        throw new Error("should not be called");
      },
    };

    const error = await listIntakeSubmissionsByProjectId("not-a-uuid", staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });
});
