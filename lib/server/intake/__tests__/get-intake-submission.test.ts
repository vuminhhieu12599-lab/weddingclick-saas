import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { getIntakeSubmissionById } from "../get-intake-submission";
import type { IntakeStaffGateway } from "../intake-staff-gateway";
import type { IntakeSubmissionRecord } from "../intake-types";

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
const submissionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const existingSubmission: IntakeSubmissionRecord = {
  id: submissionId,
  projectId,
  accessLinkId: null,
  status: "PENDING",
  submittedAt: "2026-09-19T00:00:00.000Z",
  reviewedBy: null,
  reviewedAt: null,
  staffNote: null,
  weddingDetails: {
    groomName: null,
    brideName: null,
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
  record: IntakeSubmissionRecord | null;
}): IntakeStaffGateway<FakeClient> {
  return {
    async projectExists() {
      return options.projectExists;
    },
    async listIntakeSubmissionsByProjectId() {
      throw new Error("should not be called");
    },
    async getIntakeSubmissionById() {
      return options.record;
    },
    async applyIntakeSubmission() {
      throw new Error("should not be called");
    },
    async rejectIntakeSubmission() {
      throw new Error("should not be called");
    },
  };
}

describe("getIntakeSubmissionById", () => {
  it("returns the record when found", async () => {
    const gateway = createFakeGateway({ projectExists: true, record: existingSubmission });
    const result = await getIntakeSubmissionById(projectId, submissionId, staff, gateway);
    expect(result).toEqual(existingSubmission);
  });

  it("throws NOT_FOUND when the project does not exist", async () => {
    const gateway = createFakeGateway({ projectExists: false, record: null });
    const error = await getIntakeSubmissionById(projectId, submissionId, staff, gateway).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("throws NOT_FOUND when the submission does not exist (including a wrong-project binding)", async () => {
    const gateway = createFakeGateway({ projectExists: true, record: null });
    const error = await getIntakeSubmissionById(projectId, submissionId, staff, gateway).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("rejects a malformed project id as BAD_REQUEST", async () => {
    const gateway = createFakeGateway({ projectExists: true, record: existingSubmission });
    const error = await getIntakeSubmissionById("not-a-uuid", submissionId, staff, gateway).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a malformed submission id as BAD_REQUEST without querying the gateway", async () => {
    let called = false;
    const gateway: IntakeStaffGateway<FakeClient> = {
      async projectExists() {
        return true;
      },
      async listIntakeSubmissionsByProjectId() {
        throw new Error("should not be called");
      },
      async getIntakeSubmissionById() {
        called = true;
        return existingSubmission;
      },
      async applyIntakeSubmission() {
        throw new Error("should not be called");
      },
      async rejectIntakeSubmission() {
        throw new Error("should not be called");
      },
    };

    const error = await getIntakeSubmissionById(projectId, "not-a-uuid", staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });
});
