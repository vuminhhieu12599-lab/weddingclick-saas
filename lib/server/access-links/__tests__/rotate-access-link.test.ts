import { describe, expect, it } from "vitest";

import { hashAccessToken, isValidRawAccessTokenShape } from "../../auth/access-token-crypto";
import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { AccessLinkStaffGateway } from "../access-link-staff-gateway";
import type { IssuedAccessLinkRecord } from "../access-link-staff-types";
import { rotateAccessLink } from "../rotate-access-link";

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

function fakeIssuedRecord(overrides: Partial<IssuedAccessLinkRecord> = {}): IssuedAccessLinkRecord {
  return {
    id: "55555555-5555-5555-5555-555555555555",
    projectId,
    linkType: "REVIEW",
    expiresAt: null,
    createdAt: "2026-09-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("rotateAccessLink", () => {
  it("rejects a malformed project id as BAD_REQUEST without calling the gateway", async () => {
    const gateway = unusedGatewayMethods();
    const error = await rotateAccessLink("not-a-uuid", linkId, staff, gateway).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a malformed link id as BAD_REQUEST without calling the gateway", async () => {
    const gateway = unusedGatewayMethods();
    const error = await rotateAccessLink(projectId, "not-a-uuid", staff, gateway).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("generates exactly one fresh raw token and forwards its hash/hint to the gateway", async () => {
    let callCount = 0;
    let receivedParams:
      | Parameters<AccessLinkStaffGateway<FakeClient>["rotateAccessLink"]>[1]
      | undefined;

    const gateway: AccessLinkStaffGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async rotateAccessLink(_client, params) {
        callCount += 1;
        receivedParams = params;
        return fakeIssuedRecord();
      },
    };

    const result = await rotateAccessLink(projectId, linkId, staff, gateway);

    expect(callCount).toBe(1);
    expect(receivedParams?.projectId).toBe(projectId);
    expect(receivedParams?.accessLinkId).toBe(linkId);
    expect(isValidRawAccessTokenShape(result.token)).toBe(true);
    expect(receivedParams?.newTokenHash).toEqual(hashAccessToken(result.token));
  });

  it("returns the DB result plus the new raw token only after gateway success", async () => {
    const gateway: AccessLinkStaffGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async rotateAccessLink() {
        return fakeIssuedRecord({ id: linkId, linkType: "PORTAL" });
      },
    };

    const result = await rotateAccessLink(projectId, linkId, staff, gateway);
    expect(result.record.id).toBe(linkId);
    expect(result.record.linkType).toBe("PORTAL");
    expect(typeof result.token).toBe("string");
  });

  it("never returns a token on gateway failure (rejection carries no token)", async () => {
    const gateway: AccessLinkStaffGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async rotateAccessLink() {
        throw new ApiError("CONFLICT", "Access link is already revoked");
      },
    };

    const error = await rotateAccessLink(projectId, linkId, staff, gateway).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("CONFLICT");
    expect((error as ApiError).message).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });

  it("propagates AL003 -> NOT_FOUND from the RPC", async () => {
    const gateway: AccessLinkStaffGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async rotateAccessLink() {
        throw new ApiError("NOT_FOUND", "Access link not found");
      },
    };

    const error = await rotateAccessLink(projectId, linkId, staff, gateway).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("propagates AL004 -> CONFLICT (already revoked) from the RPC", async () => {
    const gateway: AccessLinkStaffGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async rotateAccessLink() {
        throw new ApiError("CONFLICT", "Access link is already revoked");
      },
    };

    const error = await rotateAccessLink(projectId, linkId, staff, gateway).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("CONFLICT");
  });

  it("propagates AL005 -> CONFLICT (expired, not rotatable) from the RPC", async () => {
    const gateway: AccessLinkStaffGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async rotateAccessLink() {
        throw new ApiError("CONFLICT", "Access link is expired and cannot be rotated");
      },
    };

    const error = await rotateAccessLink(projectId, linkId, staff, gateway).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("CONFLICT");
  });
});
