import { describe, expect, it } from "vitest";

import type { AccessLinkStaffGateway } from "../../access-links/access-link-staff-gateway";
import type { IssuedAccessLinkRecord, RevokedAccessLinkRecord } from "../../access-links/access-link-staff-types";
import type { StaffAuthGateway } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import {
  handleIssueAccessLinkRequest,
  handleRevokeAccessLinkRequest,
  handleRotateAccessLinkRequest,
} from "../access-links";

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
/** Frozen auth contract: both STAFF and ADMIN are accepted, no ADMIN-only branch. */
const activeAdminAuth = createFakeAuthGateway({
  userId: "admin-1",
  profile: { role: "ADMIN", displayName: "Test Admin" },
});
const invalidTokenAuth = createFakeAuthGateway({ userId: null });
const nonStaffAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

const projectId = "11111111-1111-1111-1111-111111111111";
const linkId = "22222222-2222-2222-2222-222222222222";

function fakeIssuedRecord(overrides: Partial<IssuedAccessLinkRecord> = {}): IssuedAccessLinkRecord {
  return {
    id: linkId,
    projectId,
    linkType: "INTAKE",
    expiresAt: null,
    createdAt: "2026-09-19T00:00:00.000Z",
    ...overrides,
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

function createFakeGateway(options?: {
  projectExists?: AccessLinkStaffGateway<FakeClient>["projectExists"];
  issueDirectAccessLink?: AccessLinkStaffGateway<FakeClient>["issueDirectAccessLink"];
  issueReviewLink?: AccessLinkStaffGateway<FakeClient>["issueReviewLink"];
  rotateAccessLink?: AccessLinkStaffGateway<FakeClient>["rotateAccessLink"];
  revokeAccessLink?: AccessLinkStaffGateway<FakeClient>["revokeAccessLink"];
}): AccessLinkStaffGateway<FakeClient> {
  return {
    async projectExists(client, pid) {
      return options?.projectExists ? options.projectExists(client, pid) : true;
    },
    async issueDirectAccessLink(client, row) {
      return options?.issueDirectAccessLink
        ? options.issueDirectAccessLink(client, row)
        : fakeIssuedRecord({ linkType: row.linkType, expiresAt: row.expiresAt });
    },
    async issueReviewLink(client, params) {
      return options?.issueReviewLink
        ? options.issueReviewLink(client, params)
        : fakeIssuedRecord({ linkType: "REVIEW", expiresAt: params.expiresAt });
    },
    async rotateAccessLink(client, params) {
      return options?.rotateAccessLink
        ? options.rotateAccessLink(client, params)
        : fakeIssuedRecord({ id: `rotated-${params.accessLinkId}` });
    },
    async revokeAccessLink(client, params) {
      return options?.revokeAccessLink
        ? options.revokeAccessLink(client, params)
        : fakeRevokedRecord({ id: params.accessLinkId });
    },
  };
}

describe("handleIssueAccessLinkRequest", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const result = await handleIssueAccessLinkRequest(
      null,
      projectId,
      { linkType: "INTAKE" },
      activeStaffAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(401);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("returns 401 for an invalid/expired token", async () => {
    const result = await handleIssueAccessLinkRequest(
      "Bearer bad-token",
      projectId,
      { linkType: "INTAKE" },
      invalidTokenAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(401);
  });

  it("returns 403 for a non-staff caller", async () => {
    const result = await handleIssueAccessLinkRequest(
      "Bearer good-token",
      projectId,
      { linkType: "INTAKE" },
      nonStaffAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(403);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("returns 400 for a malformed project UUID", async () => {
    const result = await handleIssueAccessLinkRequest(
      "Bearer good-token",
      "not-a-uuid",
      { linkType: "INTAKE" },
      activeStaffAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(400);
  });

  it("returns 400 for a malformed/extraneous body", async () => {
    const result = await handleIssueAccessLinkRequest(
      "Bearer good-token",
      projectId,
      { linkType: "INTAKE", extra: "field" },
      activeStaffAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(400);
  });

  it("returns 201 with the exact documented success shape and no-store header (STAFF)", async () => {
    const result = await handleIssueAccessLinkRequest(
      "Bearer good-token",
      projectId,
      { linkType: "INTAKE" },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(201);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
    const body = result.body as unknown as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual(
      ["id", "projectId", "linkType", "token", "expiresAt", "createdAt"].sort(),
    );
    expect(typeof body.data.token).toBe("string");
    expect(body.data).not.toHaveProperty("tokenHint");
    expect(body.data).not.toHaveProperty("tokenHash");
    expect(body.data).not.toHaveProperty("createdBy");
  });

  it("returns 201 for an ADMIN caller (frozen auth contract: both STAFF and ADMIN are accepted, no ADMIN-only branch)", async () => {
    const result = await handleIssueAccessLinkRequest(
      "Bearer good-token",
      projectId,
      { linkType: "INTAKE" },
      activeAdminAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(201);
  });

  it("maps NOT_FOUND (INTAKE/PORTAL project missing) to 404", async () => {
    const result = await handleIssueAccessLinkRequest(
      "Bearer good-token",
      projectId,
      { linkType: "INTAKE" },
      activeStaffAuth,
      createFakeGateway({ projectExists: async () => false }),
    );
    expect(result.status).toBe(404);
  });

  it("maps AL002 (REVIEW project missing) to 404", async () => {
    const result = await handleIssueAccessLinkRequest(
      "Bearer good-token",
      projectId,
      { linkType: "REVIEW" },
      activeStaffAuth,
      createFakeGateway({
        issueReviewLink: async () => {
          throw new ApiError("NOT_FOUND", "Project not found");
        },
      }),
    );
    expect(result.status).toBe(404);
  });

  it("maps an unexpected repository failure to 500 without leaking detail", async () => {
    const result = await handleIssueAccessLinkRequest(
      "Bearer good-token",
      projectId,
      { linkType: "INTAKE" },
      activeStaffAuth,
      createFakeGateway({
        issueDirectAccessLink: async () => {
          throw new Error("raw postgres detail");
        },
      }),
    );
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain("raw postgres detail");
  });

  it("never includes a raw token in an error response", async () => {
    const result = await handleIssueAccessLinkRequest(
      "Bearer good-token",
      projectId,
      { linkType: "INTAKE" },
      activeStaffAuth,
      createFakeGateway({
        issueDirectAccessLink: async () => {
          throw new ApiError("CONFLICT", "unexpected");
        },
      }),
    );
    expect(result.status).toBe(409);
    expect(JSON.stringify(result.body)).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });
});

describe("handleRotateAccessLinkRequest", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const result = await handleRotateAccessLinkRequest(
      null,
      projectId,
      linkId,
      activeStaffAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(401);
  });

  it("returns 403 for a non-staff caller", async () => {
    const result = await handleRotateAccessLinkRequest(
      "Bearer good-token",
      projectId,
      linkId,
      nonStaffAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(403);
  });

  it("returns 400 for a malformed project UUID", async () => {
    const result = await handleRotateAccessLinkRequest(
      "Bearer good-token",
      "not-a-uuid",
      linkId,
      activeStaffAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(400);
  });

  it("returns 400 for a malformed link UUID", async () => {
    const result = await handleRotateAccessLinkRequest(
      "Bearer good-token",
      projectId,
      "not-a-uuid",
      activeStaffAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(400);
  });

  it("returns 200 with the exact documented success shape and no-store header, never the old token (STAFF)", async () => {
    const result = await handleRotateAccessLinkRequest(
      "Bearer good-token",
      projectId,
      linkId,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(200);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
    const body = result.body as unknown as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual(
      ["id", "projectId", "linkType", "token", "expiresAt", "createdAt"].sort(),
    );
    expect(body.data).not.toHaveProperty("tokenHint");
  });

  it("returns 200 for an ADMIN caller (frozen auth contract: both STAFF and ADMIN are accepted, no ADMIN-only branch)", async () => {
    const result = await handleRotateAccessLinkRequest(
      "Bearer good-token",
      projectId,
      linkId,
      activeAdminAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(200);
  });

  it("maps AL003 -> 404", async () => {
    const result = await handleRotateAccessLinkRequest(
      "Bearer good-token",
      projectId,
      linkId,
      activeStaffAuth,
      createFakeGateway({
        rotateAccessLink: async () => {
          throw new ApiError("NOT_FOUND", "Access link not found");
        },
      }),
    );
    expect(result.status).toBe(404);
  });

  it("maps AL004 -> 409", async () => {
    const result = await handleRotateAccessLinkRequest(
      "Bearer good-token",
      projectId,
      linkId,
      activeStaffAuth,
      createFakeGateway({
        rotateAccessLink: async () => {
          throw new ApiError("CONFLICT", "Access link is already revoked");
        },
      }),
    );
    expect(result.status).toBe(409);
  });

  it("maps AL005 -> 409", async () => {
    const result = await handleRotateAccessLinkRequest(
      "Bearer good-token",
      projectId,
      linkId,
      activeStaffAuth,
      createFakeGateway({
        rotateAccessLink: async () => {
          throw new ApiError("CONFLICT", "Access link is expired and cannot be rotated");
        },
      }),
    );
    expect(result.status).toBe(409);
  });

  it("maps an unexpected failure to 500 without leaking detail, no-store still present", async () => {
    const result = await handleRotateAccessLinkRequest(
      "Bearer good-token",
      projectId,
      linkId,
      activeStaffAuth,
      createFakeGateway({
        rotateAccessLink: async () => {
          throw new Error("raw postgres detail");
        },
      }),
    );
    expect(result.status).toBe(500);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
    expect(JSON.stringify(result.body)).not.toContain("raw postgres detail");
  });
});

describe("handleRevokeAccessLinkRequest", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const result = await handleRevokeAccessLinkRequest(
      null,
      projectId,
      linkId,
      activeStaffAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(401);
  });

  it("returns 403 for a non-staff caller", async () => {
    const result = await handleRevokeAccessLinkRequest(
      "Bearer good-token",
      projectId,
      linkId,
      nonStaffAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(403);
  });

  it("returns 400 for a malformed project UUID", async () => {
    const result = await handleRevokeAccessLinkRequest(
      "Bearer good-token",
      "not-a-uuid",
      linkId,
      activeStaffAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(400);
  });

  it("returns 400 for a malformed link UUID", async () => {
    const result = await handleRevokeAccessLinkRequest(
      "Bearer good-token",
      projectId,
      "not-a-uuid",
      activeStaffAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(400);
  });

  it("returns 200 with the exact documented success shape, no token field (STAFF)", async () => {
    const result = await handleRevokeAccessLinkRequest(
      "Bearer good-token",
      projectId,
      linkId,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(200);
    const body = result.body as unknown as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual(
      ["id", "projectId", "linkType", "revokedAt"].sort(),
    );
    expect(body.data).not.toHaveProperty("token");
  });

  it("returns 200 for an ADMIN caller (frozen auth contract: both STAFF and ADMIN are accepted, no ADMIN-only branch)", async () => {
    const result = await handleRevokeAccessLinkRequest(
      "Bearer good-token",
      projectId,
      linkId,
      activeAdminAuth,
      createFakeGateway(),
    );
    expect(result.status).toBe(200);
  });

  it("maps AL003 -> 404", async () => {
    const result = await handleRevokeAccessLinkRequest(
      "Bearer good-token",
      projectId,
      linkId,
      activeStaffAuth,
      createFakeGateway({
        revokeAccessLink: async () => {
          throw new ApiError("NOT_FOUND", "Access link not found");
        },
      }),
    );
    expect(result.status).toBe(404);
  });

  it("maps AL004 -> 409", async () => {
    const result = await handleRevokeAccessLinkRequest(
      "Bearer good-token",
      projectId,
      linkId,
      activeStaffAuth,
      createFakeGateway({
        revokeAccessLink: async () => {
          throw new ApiError("CONFLICT", "Access link is already revoked");
        },
      }),
    );
    expect(result.status).toBe(409);
  });

  it("maps an unexpected failure to 500 without leaking detail", async () => {
    const result = await handleRevokeAccessLinkRequest(
      "Bearer good-token",
      projectId,
      linkId,
      activeStaffAuth,
      createFakeGateway({
        revokeAccessLink: async () => {
          throw new Error("raw postgres detail");
        },
      }),
    );
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain("raw postgres detail");
  });
});
