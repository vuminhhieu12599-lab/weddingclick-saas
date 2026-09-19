import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { AccessLinkStaffGateway } from "../access-link-staff-gateway";
import type { RevokedAccessLinkRecord } from "../access-link-staff-types";
import { revokeAccessLink } from "../revoke-access-link";

interface FakeClient {
  marker: string;
}

const staff: StaffContext<FakeClient> = {
  userId: "22222222-2222-2222-2222-222222222222",
  role: "STAFF",
  displayName: "Test Staff",
  supabase: { marker: "fake" },
};

const projectId = "11111111-1111-1111-1111-111111111111";
const linkId = "44444444-4444-4444-4444-444444444444";

function unusedGatewayMethods(): AccessLinkStaffGateway<FakeClient> {
  return {
    async projectExists() {
      throw new Error("should not be called");
    },
    async issueDirectAccessLink() {
      throw new Error("should not be called");
    },
    async issueReviewLink() {
      throw new Error("should not be called");
    },
    async rotateAccessLink() {
      throw new Error("should not be called");
    },
    async revokeAccessLink() {
      throw new Error("should not be called");
    },
  };
}

function fakeRevokedRecord(
  overrides: Partial<RevokedAccessLinkRecord> = {},
): RevokedAccessLinkRecord {
  return {
    id: linkId,
    projectId,
    linkType: "PORTAL",
    revokedAt: "2026-09-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("revokeAccessLink", () => {
  it("rejects a malformed project id as BAD_REQUEST without calling the gateway", async () => {
    const gateway = unusedGatewayMethods();
    const error = await revokeAccessLink("not-a-uuid", linkId, staff, gateway).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a malformed link id as BAD_REQUEST without calling the gateway", async () => {
    const gateway = unusedGatewayMethods();
    const error = await revokeAccessLink(projectId, "not-a-uuid", staff, gateway).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("never generates a token, calls the gateway exactly once with project id and link id", async () => {
    let callCount = 0;
    let receivedParams:
      | Parameters<AccessLinkStaffGateway<FakeClient>["revokeAccessLink"]>[1]
      | undefined;

    const gateway: AccessLinkStaffGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async revokeAccessLink(_client, params) {
        callCount += 1;
        receivedParams = params;
        return fakeRevokedRecord();
      },
    };

    const result = await revokeAccessLink(projectId, linkId, staff, gateway);

    expect(callCount).toBe(1);
    expect(receivedParams).toEqual({ projectId, accessLinkId: linkId });
    expect(result).toEqual(fakeRevokedRecord());
    expect(result).not.toHaveProperty("token");
  });

  it("propagates AL003 -> NOT_FOUND from the RPC", async () => {
    const gateway: AccessLinkStaffGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async revokeAccessLink() {
        throw new ApiError("NOT_FOUND", "Access link not found");
      },
    };

    const error = await revokeAccessLink(projectId, linkId, staff, gateway).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("propagates AL004 -> CONFLICT (already revoked) from the RPC", async () => {
    const gateway: AccessLinkStaffGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async revokeAccessLink() {
        throw new ApiError("CONFLICT", "Access link is already revoked");
      },
    };

    const error = await revokeAccessLink(projectId, linkId, staff, gateway).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("CONFLICT");
  });

  it("succeeds for an expired-but-not-revoked target (the RPC, not this use case, owns that rule)", async () => {
    const gateway: AccessLinkStaffGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async revokeAccessLink() {
        return fakeRevokedRecord({ linkType: "INTAKE" });
      },
    };

    const result = await revokeAccessLink(projectId, linkId, staff, gateway);
    expect(result.linkType).toBe("INTAKE");
  });
});
