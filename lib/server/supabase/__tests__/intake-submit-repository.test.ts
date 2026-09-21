import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import type { SubmitIntakeSubmissionParams } from "../../intake/intake-submit-gateway";
import { createIntakeSubmitGateway } from "../intake-submit-repository";

const projectId = "11111111-1111-1111-1111-111111111111";
const accessLinkId = "22222222-2222-2222-2222-222222222222";
const submissionId = "33333333-3333-3333-3333-333333333333";

const validParams: SubmitIntakeSubmissionParams = {
  projectId,
  accessLinkId,
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

const validRow = {
  id: submissionId,
  project_id: projectId,
  status: "PENDING",
  submitted_at: "2026-09-19T00:00:00.000Z",
};

function fakeRpcClient(result: {
  data?: unknown;
  error?: { code: string; message: string } | null;
  captureCall?: (fn: string, params: Record<string, unknown>) => void;
}): SupabaseClient {
  return {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      result.captureCall?.(fn, params);
      return { data: result.data ?? null, error: result.error ?? null };
    },
  } as unknown as SupabaseClient;
}

describe("createIntakeSubmitGateway.submitIntakeSubmission", () => {
  it("calls submit_intake_submission with resolved ids and every Wedding Details field, never a raw token", async () => {
    let capturedFn: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const client = fakeRpcClient({
      data: [validRow],
      captureCall: (fn, params) => {
        capturedFn = fn;
        capturedParams = params;
      },
    });

    await createIntakeSubmitGateway(client).submitIntakeSubmission(validParams);

    expect(capturedFn).toBe("submit_intake_submission");
    expect(capturedParams).toEqual({
      p_project_id: projectId,
      p_access_link_id: accessLinkId,
      p_groom_name: "Nguyễn Văn Hiếu",
      p_bride_name: "Trần Thị Bình",
      p_groom_father: null,
      p_groom_mother: null,
      p_bride_father: null,
      p_bride_mother: null,
      p_groom_family_address: null,
      p_bride_family_address: null,
      p_invitation_message: null,
      p_love_story: null,
      p_lunar_date_display: null,
      p_additional_note: null,
      p_groom_bank_name: null,
      p_groom_bank_account_name: null,
      p_groom_bank_account_number: null,
      p_groom_bank_qr_media_id: null,
      p_bride_bank_name: null,
      p_bride_bank_account_name: null,
      p_bride_bank_account_number: null,
      p_bride_bank_qr_media_id: null,
    });
    expect(JSON.stringify(capturedParams)).not.toMatch(/token/i);
  });

  it("returns the narrow mapped result on success", async () => {
    const client = fakeRpcClient({ data: [validRow] });
    const result = await createIntakeSubmitGateway(client).submitIntakeSubmission(validParams);
    expect(result).toEqual({
      id: submissionId,
      projectId,
      status: "PENDING",
      submittedAt: "2026-09-19T00:00:00.000Z",
    });
  });

  it.each([
    ["IS004", "NOT_FOUND"],
    ["IS005", "REVOKED_TOKEN"],
    ["IS006", "EXPIRED_TOKEN"],
  ])("maps RPC error code %s to ApiError kind %s", async (code, kind) => {
    const client = fakeRpcClient({ error: { code, message: "raw postgres detail" } });
    const error = await createIntakeSubmitGateway(client)
      .submitIntakeSubmission(validParams)
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe(kind);
    expect((error as ApiError).message).not.toContain("raw postgres detail");
  });

  it("maps an unrecognized SQLSTATE to a generic error, never leaking the raw message", async () => {
    const client = fakeRpcClient({ error: { code: "99999", message: "raw postgres detail" } });
    const error = await createIntakeSubmitGateway(client)
      .submitIntakeSubmission(validParams)
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("throws a generic error when no row is returned", async () => {
    const client = fakeRpcClient({ data: [] });
    await expect(
      createIntakeSubmitGateway(client).submitIntakeSubmission(validParams),
    ).rejects.toThrow();
  });

  it("throws a generic error when the returned row belongs to a different project", async () => {
    const client = fakeRpcClient({ data: [{ ...validRow, project_id: "99999999-9999-9999-9999-999999999999" }] });
    await expect(
      createIntakeSubmitGateway(client).submitIntakeSubmission(validParams),
    ).rejects.toThrow();
  });

  it("throws a generic error when the returned status is not a recognized IntakeSubmissionStatus", async () => {
    const client = fakeRpcClient({ data: [{ ...validRow, status: "BOGUS" }] });
    await expect(
      createIntakeSubmitGateway(client).submitIntakeSubmission(validParams),
    ).rejects.toThrow();
  });

  it("throws a generic error when submitted_at is malformed", async () => {
    const client = fakeRpcClient({ data: [{ ...validRow, submitted_at: "not-a-timestamp" }] });
    await expect(
      createIntakeSubmitGateway(client).submitIntakeSubmission(validParams),
    ).rejects.toThrow();
  });

  it("throws a generic error when the returned status is APPLIED (Finding B: exact literal status required)", async () => {
    const client = fakeRpcClient({ data: [{ ...validRow, status: "APPLIED" }] });
    await expect(
      createIntakeSubmitGateway(client).submitIntakeSubmission(validParams),
    ).rejects.toThrow();
  });

  it("throws a generic error when the returned status is REJECTED (Finding B: exact literal status required)", async () => {
    const client = fakeRpcClient({ data: [{ ...validRow, status: "REJECTED" }] });
    await expect(
      createIntakeSubmitGateway(client).submitIntakeSubmission(validParams),
    ).rejects.toThrow();
  });

  it("throws a generic error when zero rows are returned (Finding B: exact-one-row enforcement)", async () => {
    const client = fakeRpcClient({ data: [] });
    await expect(
      createIntakeSubmitGateway(client).submitIntakeSubmission(validParams),
    ).rejects.toThrow();
  });

  it("throws a generic error when two rows are returned (Finding B: exact-one-row enforcement)", async () => {
    const client = fakeRpcClient({ data: [validRow, { ...validRow, id: "44444444-4444-4444-4444-444444444444" }] });
    await expect(
      createIntakeSubmitGateway(client).submitIntakeSubmission(validParams),
    ).rejects.toThrow();
  });

  it("throws a generic error when data is not an array at all", async () => {
    const client = fakeRpcClient({ data: validRow });
    await expect(
      createIntakeSubmitGateway(client).submitIntakeSubmission(validParams),
    ).rejects.toThrow();
  });
});
