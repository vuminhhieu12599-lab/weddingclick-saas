import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { ApiError, apiErrorStatus } from "../../errors/api-error";
import type { SaveWeddingDetailsInput } from "../../wedding-details/wedding-details-types";
import { supabaseWeddingDetailsGateway } from "../wedding-details-repository";

const validInput: SaveWeddingDetailsInput = {
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
};

const projectId = "11111111-1111-1111-1111-111111111111";

const successRow = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  project_id: projectId,
  groom_name: validInput.groomName,
  bride_name: validInput.brideName,
  groom_father: null,
  groom_mother: null,
  bride_father: null,
  bride_mother: null,
  groom_family_address: null,
  bride_family_address: null,
  invitation_message: null,
  love_story: null,
  lunar_date_display: null,
  additional_note: null,
  groom_bank_name: null,
  groom_bank_account_name: null,
  groom_bank_account_number: null,
  groom_bank_qr_media_id: null,
  bride_bank_name: null,
  bride_bank_account_name: null,
  bride_bank_account_number: null,
  bride_bank_qr_media_id: null,
  created_at: "2026-09-12T00:00:00.000Z",
  updated_at: "2026-09-12T00:00:00.000Z",
  changed: true,
  operation: "CREATED" as const,
};

function fakeClientWithRpcResult(result: {
  data?: unknown;
  error?: { code: string; message: string } | null;
  captureParams?: (params: unknown) => void;
}): SupabaseClient {
  return {
    rpc: async (_fn: string, params: unknown) => {
      result.captureParams?.(params);
      return { data: result.data ?? null, error: result.error ?? null };
    },
  } as unknown as SupabaseClient;
}

describe("supabaseWeddingDetailsGateway.saveWeddingDetails", () => {
  it("calls the RPC with snake_case p_-prefixed params derived from the camelCase input", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const client = fakeClientWithRpcResult({
      data: [successRow],
      captureParams: (params) => {
        capturedParams = params as Record<string, unknown>;
      },
    });

    await supabaseWeddingDetailsGateway.saveWeddingDetails(client, projectId, validInput);

    expect(capturedParams).toEqual({
      p_project_id: projectId,
      p_groom_name: validInput.groomName,
      p_bride_name: validInput.brideName,
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
  });

  it("maps the RPC row to a SaveWeddingDetailsResult", async () => {
    const client = fakeClientWithRpcResult({ data: [successRow] });

    const result = await supabaseWeddingDetailsGateway.saveWeddingDetails(
      client,
      projectId,
      validInput,
    );

    expect(result).toEqual({
      weddingDetails: {
        id: successRow.id,
        projectId: successRow.project_id,
        groomName: successRow.groom_name,
        brideName: successRow.bride_name,
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
        createdAt: successRow.created_at,
        updatedAt: successRow.updated_at,
      },
      changed: true,
      operation: "CREATED",
    });
  });

  it("maps changed=false / operation=null through unchanged", async () => {
    const client = fakeClientWithRpcResult({
      data: [{ ...successRow, changed: false, operation: null }],
    });

    const result = await supabaseWeddingDetailsGateway.saveWeddingDetails(
      client,
      projectId,
      validInput,
    );

    expect(result.changed).toBe(false);
    expect(result.operation).toBeNull();
  });

  it.each([
    ["WD001", "FORBIDDEN", "Active WeddingClick staff role required"],
    ["WD002", "NOT_FOUND", "Project not found"],
    ["WD003", "INVARIANT", "Target Project is not a WEDDING project"],
    ["WD004", "INVARIANT", "Gift QR media reference must belong to the same Project"],
  ])("maps known RPC error code %s to ApiError(%s)", async (code, kind, message) => {
    const client = fakeClientWithRpcResult({
      error: { code, message: "raw postgres detail that must never leak" },
    });

    const error = await supabaseWeddingDetailsGateway
      .saveWeddingDetails(client, projectId, validInput)
      .catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe(kind);
    expect((error as ApiError).message).toBe(message);
    expect((error as ApiError).message).not.toContain("raw postgres detail");
  });

  it.each([
    ["WD003", 422],
    ["WD004", 422],
  ])(
    "%s ApiError maps to HTTP %d via apiErrorStatus (Task 022 error-contract patch)",
    async (code, status) => {
      const client = fakeClientWithRpcResult({
        error: { code, message: "raw postgres detail that must never leak" },
      });

      const error = await supabaseWeddingDetailsGateway
        .saveWeddingDetails(client, projectId, validInput)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(apiErrorStatus((error as ApiError).kind)).toBe(status);
    },
  );

  it("maps an unrecognized SQLSTATE to a generic error (unknown DB error -> generic 500) without leaking the raw message", async () => {
    const client = fakeClientWithRpcResult({
      error: { code: "23503", message: "raw postgres detail that must never leak" },
    });

    const error = await supabaseWeddingDetailsGateway
      .saveWeddingDetails(client, projectId, validInput)
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("treats an unexpected response shape (no error, empty row array) as a generic failure", async () => {
    const client = fakeClientWithRpcResult({ data: [], error: null });

    const error = await supabaseWeddingDetailsGateway
      .saveWeddingDetails(client, projectId, validInput)
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("supabaseWeddingDetailsGateway.projectExists / getWeddingDetailsByProjectId", () => {
  function fakeClientWithFromResult(result: {
    data?: unknown;
    error?: { message: string } | null;
  }): SupabaseClient {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
  }

  it("projectExists returns true when a row is found", async () => {
    const client = fakeClientWithFromResult({ data: { id: projectId } });
    expect(await supabaseWeddingDetailsGateway.projectExists(client, projectId)).toBe(true);
  });

  it("projectExists returns false when no row is found", async () => {
    const client = fakeClientWithFromResult({ data: null });
    expect(await supabaseWeddingDetailsGateway.projectExists(client, projectId)).toBe(false);
  });

  it("getWeddingDetailsByProjectId returns null when no row exists", async () => {
    const client = fakeClientWithFromResult({ data: null });
    expect(
      await supabaseWeddingDetailsGateway.getWeddingDetailsByProjectId(client, projectId),
    ).toBeNull();
  });

  it("getWeddingDetailsByProjectId maps a found row to a WeddingDetailsRecord", async () => {
    const client = fakeClientWithFromResult({ data: successRow });
    const result = await supabaseWeddingDetailsGateway.getWeddingDetailsByProjectId(
      client,
      projectId,
    );

    expect(result?.id).toBe(successRow.id);
    expect(result?.groomName).toBe(successRow.groom_name);
  });
});
