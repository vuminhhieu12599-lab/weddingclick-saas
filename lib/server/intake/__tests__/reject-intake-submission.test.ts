import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { IntakeStaffGateway } from "../intake-staff-gateway";
import type { RejectIntakeSubmissionResult } from "../intake-types";
import { rejectIntakeSubmission } from "../reject-intake-submission";

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

const successResult: RejectIntakeSubmissionResult = {
  id: submissionId,
  projectId,
  status: "REJECTED",
  reviewedBy: staff.userId,
  reviewedAt: "2026-09-19T00:00:00.000Z",
  staffNote: "Please resubmit with correct spelling",
};

function createFakeGateway(options?: {
  onReject?: IntakeStaffGateway<FakeClient>["rejectIntakeSubmission"];
}): IntakeStaffGateway<FakeClient> {
  return {
    async projectExists() {
      throw new Error("should not be called");
    },
    async listIntakeSubmissionsByProjectId() {
      throw new Error("should not be called");
    },
    async getIntakeSubmissionById() {
      throw new Error("should not be called");
    },
    async applyIntakeSubmission() {
      throw new Error("should not be called");
    },
    async rejectIntakeSubmission(client, pId, sId, staffNote) {
      if (options?.onReject) {
        return options.onReject(client, pId, sId, staffNote);
      }
      return successResult;
    },
  };
}

describe("rejectIntakeSubmission", () => {
  it("invokes the gateway with exactly the project id, submission id, and validated staffNote", async () => {
    let capturedArgs: unknown;
    const gateway = createFakeGateway({
      onReject: async (_client, pId, sId, staffNote) => {
        capturedArgs = [pId, sId, staffNote];
        return successResult;
      },
    });

    const result = await rejectIntakeSubmission(
      projectId,
      submissionId,
      { staffNote: "  Please resubmit with correct spelling  " },
      staff,
      gateway,
    );

    expect(capturedArgs).toEqual([projectId, submissionId, "Please resubmit with correct spelling"]);
    expect(result).toEqual(successResult);
  });

  it("passes null when staffNote is omitted", async () => {
    let capturedStaffNote: string | null | undefined;
    const gateway = createFakeGateway({
      onReject: async (_client, _pId, _sId, staffNote) => {
        capturedStaffNote = staffNote;
        return successResult;
      },
    });

    await rejectIntakeSubmission(projectId, submissionId, {}, staff, gateway);

    expect(capturedStaffNote).toBeNull();
  });

  it("rejects an unknown field in the body without calling the gateway", async () => {
    let called = false;
    const gateway = createFakeGateway({
      onReject: async () => {
        called = true;
        return successResult;
      },
    });

    const error = await rejectIntakeSubmission(
      projectId,
      submissionId,
      { groomName: "nope" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("rejects a malformed project id as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway = createFakeGateway({
      onReject: async () => {
        called = true;
        return successResult;
      },
    });

    const error = await rejectIntakeSubmission(
      "not-a-uuid",
      submissionId,
      {},
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("rejects a malformed submission id as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway = createFakeGateway({
      onReject: async () => {
        called = true;
        return successResult;
      },
    });

    const error = await rejectIntakeSubmission(
      projectId,
      "not-a-uuid",
      {},
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it.each([
    ["IS003", "NOT_FOUND"],
    ["IS007", "NOT_FOUND"],
    ["IS008", "CONFLICT"],
    ["IS001", "FORBIDDEN"],
  ])("propagates a gateway error with kind %s -> %s", async (_code, kind) => {
    const gateway = createFakeGateway({
      onReject: async () => {
        throw new ApiError(kind as ApiError["kind"], "mapped");
      },
    });

    const error = await rejectIntakeSubmission(projectId, submissionId, {}, staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe(kind);
  });
});
