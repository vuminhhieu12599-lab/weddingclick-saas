import { describe, expect, it } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { WeddingDetailsGateway } from "../../wedding-details/wedding-details-gateway";
import type {
  SaveWeddingDetailsInput,
  SaveWeddingDetailsResult,
  WeddingDetailsRecord,
} from "../../wedding-details/wedding-details-types";
import {
  handleGetWeddingDetailsRequest,
  handleSaveWeddingDetailsRequest,
} from "../wedding-details";

interface FakeClient {
  marker: string;
}

function createFakeAuthGateway(options: {
  userId?: string | null;
  profile?: { role: string; displayName: string } | null;
}): StaffAuthGateway<FakeClient> {
  return {
    createClient: (accessToken) => ({ marker: `client-for-${accessToken}` }),
    async getAuthenticatedUserId() {
      return options.userId ?? null;
    },
    async getActiveStaffProfile() {
      return options.profile ?? null;
    },
  };
}

const activeStaffAuth = createFakeAuthGateway({
  userId: "staff-1",
  profile: { role: "STAFF", displayName: "Test Staff" },
});

const existingProjectId = "11111111-1111-1111-1111-111111111111";

const existingRecord: WeddingDetailsRecord = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  projectId: existingProjectId,
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
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
};

const validSaveBody: SaveWeddingDetailsInput = {
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

function createFakeGateway(options?: {
  projectExists?: boolean;
  weddingDetails?: WeddingDetailsRecord | null;
  saveWeddingDetails?: WeddingDetailsGateway<FakeClient>["saveWeddingDetails"];
}): WeddingDetailsGateway<FakeClient> {
  return {
    async projectExists() {
      return options?.projectExists ?? true;
    },
    async getWeddingDetailsByProjectId() {
      return options?.weddingDetails ?? null;
    },
    async saveWeddingDetails(client, projectId, input) {
      if (options?.saveWeddingDetails) {
        return options.saveWeddingDetails(client, projectId, input);
      }
      const result: SaveWeddingDetailsResult = {
        weddingDetails: { ...existingRecord, ...input },
        changed: true,
        operation: "CREATED",
      };
      return result;
    },
  };
}

describe("handleGetWeddingDetailsRequest", () => {
  it("returns 200 with data when wedding details exist", async () => {
    const result = await handleGetWeddingDetailsRequest(
      "Bearer good-token",
      existingProjectId,
      activeStaffAuth,
      createFakeGateway({ projectExists: true, weddingDetails: existingRecord }),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: existingRecord });
  });

  it("returns 200 with data: null when the project exists but has no wedding details yet", async () => {
    const result = await handleGetWeddingDetailsRequest(
      "Bearer good-token",
      existingProjectId,
      activeStaffAuth,
      createFakeGateway({ projectExists: true, weddingDetails: null }),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: null });
  });

  it("returns 404 when the project does not exist", async () => {
    const result = await handleGetWeddingDetailsRequest(
      "Bearer good-token",
      existingProjectId,
      activeStaffAuth,
      createFakeGateway({ projectExists: false }),
    );

    expect(result.status).toBe(404);
  });

  it("returns 400 for a malformed project id", async () => {
    const result = await handleGetWeddingDetailsRequest(
      "Bearer good-token",
      "not-a-uuid",
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleGetWeddingDetailsRequest(
      null,
      existingProjectId,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const noProfileAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

    const result = await handleGetWeddingDetailsRequest(
      "Bearer token",
      existingProjectId,
      noProfileAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(403);
  });
});

describe("handleSaveWeddingDetailsRequest", () => {
  it("returns 200 with the saved record on create", async () => {
    const result = await handleSaveWeddingDetailsRequest(
      "Bearer good-token",
      existingProjectId,
      validSaveBody,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(200);
    expect((result.body as SaveWeddingDetailsResult).changed).toBe(true);
    expect((result.body as SaveWeddingDetailsResult).operation).toBe("CREATED");
  });

  it("returns 200 with changed=false for a no-op save", async () => {
    const gateway = createFakeGateway({
      saveWeddingDetails: async (_client, _projectId, input) => ({
        weddingDetails: { ...existingRecord, ...input },
        changed: false,
        operation: null,
      }),
    });

    const result = await handleSaveWeddingDetailsRequest(
      "Bearer good-token",
      existingProjectId,
      validSaveBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(200);
    expect((result.body as SaveWeddingDetailsResult).changed).toBe(false);
    expect((result.body as SaveWeddingDetailsResult).operation).toBeNull();
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleSaveWeddingDetailsRequest(
      null,
      existingProjectId,
      validSaveBody,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const noProfileAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

    const result = await handleSaveWeddingDetailsRequest(
      "Bearer token",
      existingProjectId,
      validSaveBody,
      noProfileAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(403);
  });

  it("returns 400 for a malformed request body without calling the gateway", async () => {
    let called = false;
    const gateway = createFakeGateway({
      saveWeddingDetails: async () => {
        called = true;
        throw new Error("should not be called");
      },
    });

    const result = await handleSaveWeddingDetailsRequest(
      "Bearer good-token",
      existingProjectId,
      { groomName: 123 },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(400);
    expect(called).toBe(false);
  });

  it("returns 400 for a forbidden server-owned field without calling the gateway", async () => {
    let called = false;
    const gateway = createFakeGateway({
      saveWeddingDetails: async () => {
        called = true;
        throw new Error("should not be called");
      },
    });

    const result = await handleSaveWeddingDetailsRequest(
      "Bearer good-token",
      existingProjectId,
      { ...validSaveBody, projectId: "attacker-supplied" },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(400);
    expect(called).toBe(false);
  });

  it("returns 404 when the RPC reports the Project does not exist", async () => {
    const gateway = createFakeGateway({
      saveWeddingDetails: async () => {
        throw new ApiError("NOT_FOUND", "Project not found");
      },
    });

    const result = await handleSaveWeddingDetailsRequest(
      "Bearer good-token",
      existingProjectId,
      validSaveBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "Project not found" });
  });

  it.each([
    ["WD003", "Target Project is not a WEDDING project"],
    ["WD004", "Gift QR media reference must belong to the same Project"],
  ])(
    "returns 422 when the RPC reports an INVARIANT violation (%s, Task 022 error-contract patch)",
    async (_code, message) => {
      const gateway = createFakeGateway({
        saveWeddingDetails: async () => {
          throw new ApiError("INVARIANT", message);
        },
      });

      const result = await handleSaveWeddingDetailsRequest(
        "Bearer good-token",
        existingProjectId,
        validSaveBody,
        activeStaffAuth,
        gateway,
      );

      expect(result.status).toBe(422);
      expect(result.body).toEqual({ error: message });
    },
  );

  it("maps an unexpected gateway failure to a generic 500 without leaking details", async () => {
    const gateway = createFakeGateway({
      saveWeddingDetails: async () => {
        throw new Error("relation \"public.wedding_details\" internal constraint detail");
      },
    });

    const result = await handleSaveWeddingDetailsRequest(
      "Bearer good-token",
      existingProjectId,
      validSaveBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
  });
});
