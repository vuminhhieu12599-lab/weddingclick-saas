import { describe, expect, it, vi } from "vitest";

import { StaffAuthError } from "../staff-auth-error";
import { readUnverifiedSubjectHint, requireAdmin, requireStaff, type StaffAuthGateway } from "../staff-context";

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

const VERIFIED_ID = "7b0e2c1a-3f4d-4e5a-9b6c-1d2e3f4a5b6c";
const OTHER_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function jwtLike(payload: unknown): string {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

describe("requireStaff concurrent profile lookup (LAUNCH-P0-01)", () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it("starts the profile lookup for the hinted subject before Auth validation settles, and uses it when ids match", async () => {
    const auth = deferred<string | null>();
    const profileCalls: string[] = [];
    const gateway: StaffAuthGateway<FakeClient> = {
      createClient: () => ({ marker: "c" }),
      getAuthenticatedUserId: () => auth.promise,
      async getActiveStaffProfile(_client, userId) {
        profileCalls.push(userId);
        return { role: "STAFF", displayName: "A" };
      },
    };

    const pending = requireStaff(jwtLike({ sub: VERIFIED_ID }), gateway);
    await Promise.resolve();
    expect(profileCalls).toEqual([VERIFIED_ID]);
    auth.resolve(VERIFIED_ID);

    await expect(pending).resolves.toMatchObject({ userId: VERIFIED_ID, role: "STAFF" });
    expect(profileCalls).toEqual([VERIFIED_ID]);
  });

  it("discards a speculative profile for a different subject and re-reads with the verified id", async () => {
    const gateway: StaffAuthGateway<FakeClient> = {
      createClient: () => ({ marker: "c" }),
      getAuthenticatedUserId: async () => VERIFIED_ID,
      getActiveStaffProfile: vi.fn(async (_client: FakeClient, userId: string) =>
        userId === OTHER_ID ? { role: "ADMIN", displayName: "Other" } : null,
      ),
    };

    const error = await requireStaff(jwtLike({ sub: OTHER_ID }), gateway).catch((e) => e);
    expect((error as StaffAuthError).kind).toBe("FORBIDDEN");
    expect(gateway.getActiveStaffProfile).toHaveBeenLastCalledWith({ marker: "c" }, VERIFIED_ID);
  });

  it("a rejected token stays UNAUTHENTICATED even if the speculative lookup returned an ADMIN row", async () => {
    const gateway = createFakeGateway({ userId: null, profile: { role: "ADMIN", displayName: "X" } });
    const error = await requireStaff(jwtLike({ sub: VERIFIED_ID }), gateway).catch((e) => e);
    expect((error as StaffAuthError).kind).toBe("UNAUTHENTICATED");
  });

  it("an Auth infrastructure failure stays INTERNAL even when the speculative lookup also failed", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const gateway = createFakeGateway({ userIdError: new Error("auth down"), profileError: new Error("db down") });
      const error = await requireStaff(jwtLike({ sub: VERIFIED_ID }), gateway).catch((e) => e);
      expect((error as StaffAuthError).kind).toBe("INTERNAL");
      expect(consoleSpy.mock.calls.map((call) => String(call[0]))).toEqual(["[requireStaff] Failed to validate access token"]);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("a speculative lookup failure for a verified matching id is INTERNAL (same as the sequential path)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const gateway = createFakeGateway({ userId: VERIFIED_ID, profileError: new Error("db down") });
      const error = await requireStaff(jwtLike({ sub: VERIFIED_ID }), gateway).catch((e) => e);
      expect((error as StaffAuthError).kind).toBe("INTERNAL");
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("readUnverifiedSubjectHint only yields a UUID sub from a three-part token", () => {
    expect(readUnverifiedSubjectHint(jwtLike({ sub: VERIFIED_ID }))).toBe(VERIFIED_ID);
    expect(readUnverifiedSubjectHint(jwtLike({ sub: "not-a-uuid" }))).toBeNull();
    expect(readUnverifiedSubjectHint(jwtLike({ sub: 42 }))).toBeNull();
    expect(readUnverifiedSubjectHint(jwtLike(null))).toBeNull();
    expect(readUnverifiedSubjectHint("a.%%%.c")).toBeNull();
    expect(readUnverifiedSubjectHint("opaque-token")).toBeNull();
  });
});
