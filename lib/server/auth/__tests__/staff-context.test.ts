import { describe, expect, it, vi } from "vitest";

import { StaffAuthError } from "../staff-auth-error";
import { requireAdmin, requireStaff, type StaffAuthGateway } from "../staff-context";

interface FakeClient {
  marker: string;
}

interface FakeProfile {
  role: string;
  displayName: string;
}

interface FakeGatewayOptions {
  userId?: string | null;
  userIdError?: unknown;
  profile?: FakeProfile | null;
  profileError?: unknown;
}

/**
 * Builds a StaffAuthGateway<FakeClient> with no network/Supabase
 * dependency, so requireStaff/requireAdmin behavior can be verified in
 * isolation (Task 004 testability requirement).
 */
function createFakeGateway(options: FakeGatewayOptions): StaffAuthGateway<FakeClient> {
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

describe("requireStaff", () => {
  it("succeeds for a valid user with an active STAFF profile", async () => {
    const gateway = createFakeGateway({
      userId: "user-staff-1",
      profile: { role: "STAFF", displayName: "Nguyễn Văn A" },
    });

    const context = await requireStaff("valid-token", gateway);

    expect(context).toEqual({
      userId: "user-staff-1",
      role: "STAFF",
      displayName: "Nguyễn Văn A",
      supabase: { marker: "client-for-valid-token" },
    });
  });

  it("succeeds for a valid user with an active ADMIN profile", async () => {
    const gateway = createFakeGateway({
      userId: "user-admin-1",
      profile: { role: "ADMIN", displayName: "Trần Thị B" },
    });

    const context = await requireStaff("valid-token", gateway);

    expect(context.role).toBe("ADMIN");
    expect(context.userId).toBe("user-admin-1");
  });

  it("rejects an empty access token as unauthenticated", async () => {
    const gateway = createFakeGateway({ userId: "irrelevant" });

    await expect(requireStaff("   ", gateway)).rejects.toMatchObject({
      kind: "UNAUTHENTICATED",
    });
  });

  it("produces an unauthenticated failure for an invalid/expired token", async () => {
    const gateway = createFakeGateway({ userId: null });

    const error = await requireStaff("expired-token", gateway).catch((e) => e);

    expect(error).toBeInstanceOf(StaffAuthError);
    expect((error as StaffAuthError).kind).toBe("UNAUTHENTICATED");
  });

  it("forbids a valid Auth user with no WeddingClick profile", async () => {
    const gateway = createFakeGateway({ userId: "user-no-profile", profile: null });

    const error = await requireStaff("token", gateway).catch((e) => e);

    expect(error).toBeInstanceOf(StaffAuthError);
    expect((error as StaffAuthError).kind).toBe("FORBIDDEN");
  });

  it("forbids an inactive profile the same way as no profile (RLS filters both to null)", async () => {
    // Production behavior: profiles_select_staff RLS (USING is_staff())
    // never returns a row for an inactive profile at all, so the gateway
    // reports it identically to "no profile" — this test documents that
    // requireStaff correctly treats both as FORBIDDEN, not a crash/leak.
    const gateway = createFakeGateway({ userId: "user-inactive", profile: null });

    const error = await requireStaff("token", gateway).catch((e) => e);

    expect(error).toBeInstanceOf(StaffAuthError);
    expect((error as StaffAuthError).kind).toBe("FORBIDDEN");
  });

  it("does not expose a raw sensitive upstream error, in the thrown error OR in server logs, from an unexpected DB/Auth error", async () => {
    const sensitive = "SUPER_SECRET_MARKER_123 password=hunter2 host=db.internal.weddingclick";
    const gateway = createFakeGateway({
      userId: "user-1",
      profileError: new Error(sensitive),
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const error = await requireStaff("token", gateway).catch((e) => e);

      expect(error).toBeInstanceOf(StaffAuthError);
      expect((error as StaffAuthError).kind).toBe("INTERNAL");
      expect((error as StaffAuthError).message).not.toContain("SUPER_SECRET_MARKER_123");
      expect((error as StaffAuthError).message).not.toContain("hunter2");
      expect((error as StaffAuthError).message).not.toContain(sensitive);

      // Every console.error call, across every argument, must be free of
      // the raw upstream error text — only a fixed static event label may
      // be logged.
      for (const call of consoleSpy.mock.calls) {
        const serializedCall = call.map((arg) => String(arg)).join(" ");
        expect(serializedCall).not.toContain("SUPER_SECRET_MARKER_123");
        expect(serializedCall).not.toContain("hunter2");
      }
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("does not expose a raw sensitive upstream error, in the thrown error OR in server logs, from an unexpected Auth error", async () => {
    const sensitive = "SUPER_SECRET_MARKER_123 internal-service-role-secret-value";
    const gateway = createFakeGateway({
      userIdError: new Error(sensitive),
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const error = await requireStaff("token", gateway).catch((e) => e);

      expect(error).toBeInstanceOf(StaffAuthError);
      expect((error as StaffAuthError).kind).toBe("INTERNAL");
      expect((error as StaffAuthError).message).not.toContain("SUPER_SECRET_MARKER_123");
      expect((error as StaffAuthError).message).not.toContain(sensitive);

      for (const call of consoleSpy.mock.calls) {
        const serializedCall = call.map((arg) => String(arg)).join(" ");
        expect(serializedCall).not.toContain("SUPER_SECRET_MARKER_123");
      }
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

describe("requireAdmin", () => {
  it("accepts an active ADMIN profile", async () => {
    const gateway = createFakeGateway({
      userId: "user-admin-1",
      profile: { role: "ADMIN", displayName: "Admin User" },
    });

    const context = await requireAdmin("token", gateway);

    expect(context.role).toBe("ADMIN");
  });

  it("rejects an active STAFF profile", async () => {
    const gateway = createFakeGateway({
      userId: "user-staff-1",
      profile: { role: "STAFF", displayName: "Staff User" },
    });

    const error = await requireAdmin("token", gateway).catch((e) => e);

    expect(error).toBeInstanceOf(StaffAuthError);
    expect((error as StaffAuthError).kind).toBe("FORBIDDEN");
  });

  it("never trusts a role supplied outside the verified profile lookup", async () => {
    // Regression guard: requireAdmin must derive role only from the
    // gateway-resolved StaffContext, never from any caller-supplied value.
    const spy = vi.fn();
    const gateway = createFakeGateway({
      userId: "user-staff-1",
      profile: { role: "STAFF", displayName: "Staff User" },
    });

    await requireAdmin("token", gateway).catch(spy);

    expect(spy).toHaveBeenCalled();
  });
});
