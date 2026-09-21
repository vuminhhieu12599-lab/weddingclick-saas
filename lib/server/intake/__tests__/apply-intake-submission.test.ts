import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { applyIntakeSubmission } from "../apply-intake-submission";
import type { IntakeStaffGateway } from "../intake-staff-gateway";
import type { ApplyIntakeSubmissionResult } from "../intake-types";

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

const successResult: ApplyIntakeSubmissionResult = {
  id: submissionId,
  projectId,
  status: "APPLIED",
  reviewedBy: staff.userId,
  reviewedAt: "2026-09-19T00:00:00.000Z",
  weddingDetailsChanged: true,
};

function createFakeGateway(options?: {
  onApply?: IntakeStaffGateway<FakeClient>["applyIntakeSubmission"];
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
    async applyIntakeSubmission(client, pId, sId) {
      if (options?.onApply) {
        return options.onApply(client, pId, sId);
      }
      return successResult;
    },
    async rejectIntakeSubmission() {
      throw new Error("should not be called");
    },
  };
}

describe("applyIntakeSubmission", () => {
  it("invokes the gateway with exactly the project id and submission id and returns its result", async () => {
    let capturedArgs: unknown;
    const gateway = createFakeGateway({
      onApply: async (_client, pId, sId) => {
        capturedArgs = [pId, sId];
        return successResult;
      },
    });

    const result = await applyIntakeSubmission(projectId, submissionId, staff, gateway);

    expect(capturedArgs).toEqual([projectId, submissionId]);
    expect(result).toEqual(successResult);
  });

  it("rejects a malformed project id as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway = createFakeGateway({
      onApply: async () => {
        called = true;
        return successResult;
      },
    });

    const error = await applyIntakeSubmission("not-a-uuid", submissionId, staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("rejects a malformed submission id as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway = createFakeGateway({
      onApply: async () => {
        called = true;
        return successResult;
      },
    });

    const error = await applyIntakeSubmission(projectId, "not-a-uuid", staff, gateway).catch(
      (e) => e,
    );

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
      onApply: async () => {
        throw new ApiError(kind as ApiError["kind"], "mapped");
      },
    });

    const error = await applyIntakeSubmission(projectId, submissionId, staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe(kind);
  });

  it("propagates a WD004 -> INVARIANT mapping from a composed save_wedding_details() failure", async () => {
    const gateway = createFakeGateway({
      onApply: async () => {
        throw new ApiError("INVARIANT", "Gift QR media reference must belong to the same Project");
      },
    });

    const error = await applyIntakeSubmission(projectId, submissionId, staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("INVARIANT");
  });
});
