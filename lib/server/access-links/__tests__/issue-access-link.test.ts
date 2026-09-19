import { describe, expect, it } from "vitest";

import { hashAccessToken, isValidRawAccessTokenShape } from "../../auth/access-token-crypto";
import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { AccessLinkStaffGateway } from "../access-link-staff-gateway";
import type { IssuedAccessLinkRecord } from "../access-link-staff-types";
import { issueAccessLink } from "../issue-access-link";

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
    id: "33333333-3333-3333-3333-333333333333",
    projectId,
    linkType: "INTAKE",
    expiresAt: null,
    createdAt: "2026-09-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("issueAccessLink", () => {
  it("rejects a malformed project id as BAD_REQUEST without calling the gateway", async () => {
    const gateway = unusedGatewayMethods();

    const error = await issueAccessLink(
      "not-a-uuid",
      { linkType: "INTAKE" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a malformed body as BAD_REQUEST without calling the gateway", async () => {
    const gateway = unusedGatewayMethods();

    const error = await issueAccessLink(
      projectId,
      { linkType: "NOT_A_TYPE" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  describe("INTAKE (direct path)", () => {
    it("checks projectExists before calling the gateway, and returns NOT_FOUND when absent", async () => {
      let projectExistsCalled = false;
      const gateway: AccessLinkStaffGateway<FakeClient> = {
        ...unusedGatewayMethods(),
        async projectExists() {
          projectExistsCalled = true;
          return false;
        },
      };

      const error = await issueAccessLink(
        projectId,
        { linkType: "INTAKE" },
        staff,
        gateway,
      ).catch((e) => e);

      expect(projectExistsCalled).toBe(true);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe("NOT_FOUND");
    });

    it("generates a real raw token, hashes it consistently, and sends createdBy = staff.userId to the direct-insert path", async () => {
      let receivedRow: Parameters<AccessLinkStaffGateway<FakeClient>["issueDirectAccessLink"]>[1] | undefined;

      const gateway: AccessLinkStaffGateway<FakeClient> = {
        ...unusedGatewayMethods(),
        async projectExists() {
          return true;
        },
        async issueDirectAccessLink(_client, row) {
          receivedRow = row;
          return fakeIssuedRecord({ linkType: row.linkType, expiresAt: row.expiresAt });
        },
      };

      const result = await issueAccessLink(projectId, { linkType: "INTAKE" }, staff, gateway);

      expect(isValidRawAccessTokenShape(result.token)).toBe(true);
      expect(receivedRow?.projectId).toBe(projectId);
      expect(receivedRow?.linkType).toBe("INTAKE");
      expect(receivedRow?.createdBy).toBe(staff.userId);
      expect(receivedRow?.expiresAt).toBeNull();
      expect(receivedRow?.tokenHash).toEqual(hashAccessToken(result.token));
    });

    it("never uses the REVIEW RPC path", async () => {
      let reviewCalled = false;
      const gateway: AccessLinkStaffGateway<FakeClient> = {
        ...unusedGatewayMethods(),
        async projectExists() {
          return true;
        },
        async issueDirectAccessLink() {
          return fakeIssuedRecord();
        },
        async issueReviewLink() {
          reviewCalled = true;
          throw new Error("should not be called");
        },
      };

      await issueAccessLink(projectId, { linkType: "INTAKE" }, staff, gateway);
      expect(reviewCalled).toBe(false);
    });

    it("propagates a repository failure without ever exposing the raw token", async () => {
      const gateway: AccessLinkStaffGateway<FakeClient> = {
        ...unusedGatewayMethods(),
        async projectExists() {
          return true;
        },
        async issueDirectAccessLink() {
          throw new Error("Failed to issue access link");
        },
      };

      const error = await issueAccessLink(
        projectId,
        { linkType: "INTAKE" },
        staff,
        gateway,
      ).catch((e) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toMatch(/[A-Za-z0-9_-]{43}/);
    });
  });

  describe("PORTAL (direct path)", () => {
    it("follows the same direct path as INTAKE", async () => {
      let receivedRow: Parameters<AccessLinkStaffGateway<FakeClient>["issueDirectAccessLink"]>[1] | undefined;
      const gateway: AccessLinkStaffGateway<FakeClient> = {
        ...unusedGatewayMethods(),
        async projectExists() {
          return true;
        },
        async issueDirectAccessLink(_client, row) {
          receivedRow = row;
          return fakeIssuedRecord({ linkType: row.linkType });
        },
      };

      const result = await issueAccessLink(projectId, { linkType: "PORTAL" }, staff, gateway);

      expect(receivedRow?.linkType).toBe("PORTAL");
      expect(receivedRow?.createdBy).toBe(staff.userId);
      expect(result.record.linkType).toBe("PORTAL");
    });
  });

  describe("REVIEW (RPC path)", () => {
    it("never pre-reads project existence", async () => {
      let projectExistsCalled = false;
      const gateway: AccessLinkStaffGateway<FakeClient> = {
        ...unusedGatewayMethods(),
        async projectExists() {
          projectExistsCalled = true;
          return true;
        },
        async issueReviewLink() {
          return fakeIssuedRecord({ linkType: "REVIEW" });
        },
      };

      await issueAccessLink(projectId, { linkType: "REVIEW" }, staff, gateway);
      expect(projectExistsCalled).toBe(false);
    });

    it("generates a real raw token and forwards its hash/hint to issueReviewLink", async () => {
      let receivedParams:
        | Parameters<AccessLinkStaffGateway<FakeClient>["issueReviewLink"]>[1]
        | undefined;

      const gateway: AccessLinkStaffGateway<FakeClient> = {
        ...unusedGatewayMethods(),
        async issueReviewLink(_client, params) {
          receivedParams = params;
          return fakeIssuedRecord({ linkType: "REVIEW", expiresAt: params.expiresAt });
        },
      };

      const result = await issueAccessLink(
        projectId,
        { linkType: "REVIEW", expiresAt: "2099-01-01T00:00:00Z" },
        staff,
        gateway,
      );

      expect(isValidRawAccessTokenShape(result.token)).toBe(true);
      expect(receivedParams?.projectId).toBe(projectId);
      expect(receivedParams?.expiresAt).toBe("2099-01-01T00:00:00Z");
      expect(receivedParams?.tokenHash).toEqual(hashAccessToken(result.token));
    });

    it("never uses the direct-insert path", async () => {
      let directCalled = false;
      const gateway: AccessLinkStaffGateway<FakeClient> = {
        ...unusedGatewayMethods(),
        async issueDirectAccessLink() {
          directCalled = true;
          throw new Error("should not be called");
        },
        async issueReviewLink() {
          return fakeIssuedRecord({ linkType: "REVIEW" });
        },
      };

      await issueAccessLink(projectId, { linkType: "REVIEW" }, staff, gateway);
      expect(directCalled).toBe(false);
    });

    it("propagates AL002 -> NOT_FOUND from the RPC", async () => {
      const gateway: AccessLinkStaffGateway<FakeClient> = {
        ...unusedGatewayMethods(),
        async issueReviewLink() {
          throw new ApiError("NOT_FOUND", "Project not found");
        },
      };

      const error = await issueAccessLink(
        projectId,
        { linkType: "REVIEW" },
        staff,
        gateway,
      ).catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe("NOT_FOUND");
    });
  });
});
