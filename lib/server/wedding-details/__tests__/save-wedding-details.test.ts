import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { saveWeddingDetails } from "../save-wedding-details";
import type { WeddingDetailsGateway } from "../wedding-details-gateway";
import type {
  SaveWeddingDetailsInput,
  SaveWeddingDetailsResult,
  WeddingDetailsRecord,
} from "../wedding-details-types";

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

const validBody = {
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

function fakeRecord(input: SaveWeddingDetailsInput): WeddingDetailsRecord {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    projectId,
    ...input,
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
  };
}

describe("saveWeddingDetails", () => {
  it("validates the body, then calls the gateway with the project id and parsed input", async () => {
    let received: { projectId: string; input: SaveWeddingDetailsInput } | undefined;

    const gateway: WeddingDetailsGateway<FakeClient> = {
      async projectExists() {
        return true;
      },
      async getWeddingDetailsByProjectId() {
        return null;
      },
      async saveWeddingDetails(_client, pid, input) {
        received = { projectId: pid, input };
        const result: SaveWeddingDetailsResult = {
          weddingDetails: fakeRecord(input),
          changed: true,
          operation: "CREATED",
        };
        return result;
      },
    };

    const result = await saveWeddingDetails(projectId, validBody, staff, gateway);

    expect(received?.projectId).toBe(projectId);
    expect(received?.input).toEqual(validBody);
    expect(result.changed).toBe(true);
    expect(result.operation).toBe("CREATED");
  });

  it("rejects a malformed project id as BAD_REQUEST without validating the body or calling the gateway", async () => {
    let called = false;
    const gateway: WeddingDetailsGateway<FakeClient> = {
      async projectExists() {
        return true;
      },
      async getWeddingDetailsByProjectId() {
        return null;
      },
      async saveWeddingDetails() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await saveWeddingDetails("not-a-uuid", validBody, staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("rejects a malformed body as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway: WeddingDetailsGateway<FakeClient> = {
      async projectExists() {
        return true;
      },
      async getWeddingDetailsByProjectId() {
        return null;
      },
      async saveWeddingDetails() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await saveWeddingDetails(projectId, { groomName: 123 }, staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("propagates a NOT_FOUND ApiError raised by the gateway (e.g. project deleted mid-request)", async () => {
    const gateway: WeddingDetailsGateway<FakeClient> = {
      async projectExists() {
        return true;
      },
      async getWeddingDetailsByProjectId() {
        return null;
      },
      async saveWeddingDetails() {
        throw new ApiError("NOT_FOUND", "Project not found");
      },
    };

    const error = await saveWeddingDetails(projectId, validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("propagates changed=false with operation=null for a no-op save", async () => {
    const gateway: WeddingDetailsGateway<FakeClient> = {
      async projectExists() {
        return true;
      },
      async getWeddingDetailsByProjectId() {
        return fakeRecord(validBody);
      },
      async saveWeddingDetails(_client, _pid, input) {
        return { weddingDetails: fakeRecord(input), changed: false, operation: null };
      },
    };

    const result = await saveWeddingDetails(projectId, validBody, staff, gateway);

    expect(result.changed).toBe(false);
    expect(result.operation).toBeNull();
  });
});
