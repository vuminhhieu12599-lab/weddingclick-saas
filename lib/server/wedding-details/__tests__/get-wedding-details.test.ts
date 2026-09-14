import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { getWeddingDetailsByProjectId } from "../get-wedding-details";
import type { WeddingDetailsGateway } from "../wedding-details-gateway";
import type { WeddingDetailsRecord } from "../wedding-details-types";

interface FakeClient {
  marker: string;
}

const staff: StaffContext<FakeClient> = {
  userId: "staff-1",
  role: "STAFF",
  displayName: "Test Staff",
  supabase: { marker: "fake" },
};

const existingRecord: WeddingDetailsRecord = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  projectId: "11111111-1111-1111-1111-111111111111",
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

function createFakeGateway(options: {
  projectExists: boolean;
  weddingDetails: WeddingDetailsRecord | null;
}): WeddingDetailsGateway<FakeClient> {
  return {
    async projectExists() {
      return options.projectExists;
    },
    async getWeddingDetailsByProjectId() {
      return options.weddingDetails;
    },
    async saveWeddingDetails() {
      throw new Error("saveWeddingDetails should not be called in this test");
    },
  };
}

describe("getWeddingDetailsByProjectId", () => {
  it("returns the record when the project exists and has wedding details", async () => {
    const gateway = createFakeGateway({ projectExists: true, weddingDetails: existingRecord });

    const result = await getWeddingDetailsByProjectId(existingRecord.projectId, staff, gateway);

    expect(result).toEqual(existingRecord);
  });

  it("returns null when the project exists but has no wedding details yet", async () => {
    const gateway = createFakeGateway({ projectExists: true, weddingDetails: null });

    const result = await getWeddingDetailsByProjectId(existingRecord.projectId, staff, gateway);

    expect(result).toBeNull();
  });

  it("throws NOT_FOUND when the project does not exist", async () => {
    const gateway = createFakeGateway({ projectExists: false, weddingDetails: null });

    const error = await getWeddingDetailsByProjectId(existingRecord.projectId, staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("rejects a malformed project id as BAD_REQUEST without querying the gateway", async () => {
    let called = false;
    const gateway: WeddingDetailsGateway<FakeClient> = {
      async projectExists() {
        called = true;
        return true;
      },
      async getWeddingDetailsByProjectId() {
        return null;
      },
      async saveWeddingDetails() {
        throw new Error("should not be called");
      },
    };

    const error = await getWeddingDetailsByProjectId("not-a-uuid", staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });
});
