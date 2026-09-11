import { describe, expect, it, vi } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import { handleStaffMeRequest } from "../staff-me";

interface FakeClient {
  marker: string;
}

function createFakeGateway(options: {
  userId?: string | null;
  userIdError?: unknown;
  profile?: { role: string; displayName: string } | null;
  profileError?: unknown;
}): StaffAuthGateway<FakeClient> {
  return {
    createClient: (accessToken) => ({ marker: `client-for-${accessToken}` }),
    async getAuthenticatedUserId() {
      if (options.userIdError) {
        throw options.userIdError;
      }
      return options.userId ?? null;
    },
    async getActiveStaffProfile() {
      if (options.profileError) {
        throw options.profileError;
      }
      return options.profile ?? null;
    },
  };
}

describe("handleStaffMeRequest", () => {
  it("returns 200 with only safe identity fields for a valid active staff token", async () => {
    const gateway = createFakeGateway({
      userId: "user-1",
      profile: { role: "STAFF", displayName: "Nguyễn Văn A" },
    });

    const result = await handleStaffMeRequest("Bearer good-token", gateway);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      userId: "user-1",
      role: "STAFF",
      displayName: "Nguyễn Văn A",
    });
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const gateway = createFakeGateway({ userId: "user-1" });

    const result = await handleStaffMeRequest(null, gateway);

    expect(result.status).toBe(401);
  });

  it("returns 401 when the Authorization header uses the wrong scheme", async () => {
    const gateway = createFakeGateway({ userId: "user-1" });

    const result = await handleStaffMeRequest("Basic good-token", gateway);

    expect(result.status).toBe(401);
  });

  it("returns 401 for an invalid/expired token", async () => {
    const gateway = createFakeGateway({ userId: null });

    const result = await handleStaffMeRequest("Bearer expired", gateway);

    expect(result.status).toBe(401);
  });

  it("returns 403 for a valid Supabase user with no active WeddingClick profile", async () => {
    const gateway = createFakeGateway({ userId: "user-1", profile: null });

    const result = await handleStaffMeRequest("Bearer good-token", gateway);

    expect(result.status).toBe(403);
  });

  it("returns exactly {status: 500, body: {error: 'Internal server error'}} on an unexpected DB/profile failure, never internal operational detail", async () => {
    const secretMarker = "SUPER_SECRET_MARKER_123";
    const gateway = createFakeGateway({
      userId: "user-1",
      profileError: new Error(`${secretMarker} secret connection string leaked here`),
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await handleStaffMeRequest("Bearer good-token", gateway);

      // Exact shape, not just status — the HTTP mapping must always return
      // the fixed generic message for kind === INTERNAL, never an internal
      // operational description such as "Failed to resolve staff profile".
      expect(result).toEqual({ status: 500, body: { error: "Internal server error" } });

      const serializedBody = JSON.stringify(result.body);
      expect(serializedBody).not.toContain(secretMarker);
      expect(serializedBody).not.toContain("secret connection string");

      for (const call of consoleSpy.mock.calls) {
        const serializedCall = call.map((arg) => String(arg)).join(" ");
        expect(serializedCall).not.toContain(secretMarker);
        expect(serializedCall).not.toContain("secret connection string");
      }
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("returns exactly {status: 500, body: {error: 'Internal server error'}} on an unexpected Auth infrastructure failure (never collapses to 401)", async () => {
    const secretMarker = "SUPER_SECRET_MARKER_123";
    const gateway = createFakeGateway({
      userIdError: new Error(`${secretMarker} upstream Auth 503 detail`),
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await handleStaffMeRequest("Bearer good-token", gateway);

      expect(result).toEqual({ status: 500, body: { error: "Internal server error" } });

      for (const call of consoleSpy.mock.calls) {
        const serializedCall = call.map((arg) => String(arg)).join(" ");
        expect(serializedCall).not.toContain(secretMarker);
      }
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("never returns an access token, refresh token, or session object", async () => {
    const gateway = createFakeGateway({
      userId: "user-1",
      profile: { role: "ADMIN", displayName: "Admin" },
    });

    const result = await handleStaffMeRequest("Bearer good-token", gateway);
    const serialized = JSON.stringify(result.body);

    expect(serialized).not.toContain("good-token");
    expect(serialized.toLowerCase()).not.toContain("access_token");
    expect(serialized.toLowerCase()).not.toContain("refresh_token");
  });
});
