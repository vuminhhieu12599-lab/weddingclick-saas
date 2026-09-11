import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { supabaseStaffAuthGateway } from "../staff-auth-gateway";

/**
 * Task 004 Revision 2 — production gateway unit coverage.
 *
 * Builds a minimal fake/type-cast client whose `auth.getUser` returns
 * controlled results, exactly as the fake/type-cast approach the revision
 * requires. No real Supabase call is made anywhere in this file.
 *
 * Errors are constructed using the real error classes exported by the
 * installed `@supabase/supabase-js` (re-exported from `@supabase/auth-js`)
 * rather than plain duck-typed objects, so these tests exercise the same
 * structured type the gateway actually branches on (`isAuthApiError` /
 * `isAuthSessionMissingError`), not just a `status` number that happens to
 * match.
 */
function fakeClientWithGetUser(
  getUserImpl: () => Promise<{
    data: { user: { id: string } | null };
    error: unknown;
  }>,
): SupabaseClient {
  return {
    auth: {
      getUser: getUserImpl,
    },
  } as unknown as SupabaseClient;
}

describe("supabaseStaffAuthGateway.getAuthenticatedUserId", () => {
  it("1. returns the user id for a valid token", async () => {
    const client = fakeClientWithGetUser(async () => ({
      data: { user: { id: "user-1" } },
      error: null,
    }));

    const result = await supabaseStaffAuthGateway.getAuthenticatedUserId(
      client,
      "good-token",
    );

    expect(result).toBe("user-1");
  });

  it("2. returns null for a structured 401 AuthApiError (invalid/malformed JWT)", async () => {
    const client = fakeClientWithGetUser(async () => ({
      data: { user: null },
      error: new AuthApiError("invalid JWT", 401, "bad_jwt"),
    }));

    const result = await supabaseStaffAuthGateway.getAuthenticatedUserId(
      client,
      "bad-token",
    );

    expect(result).toBeNull();
  });

  it("2b. returns null for a structured 403 AuthApiError (auth-js's own signOut() treats AuthApiError 401/403 as invalid/expired JWT)", async () => {
    const client = fakeClientWithGetUser(async () => ({
      data: { user: null },
      error: new AuthApiError("user is banned", 403, "user_banned"),
    }));

    const result = await supabaseStaffAuthGateway.getAuthenticatedUserId(
      client,
      "banned-user-token",
    );

    expect(result).toBeNull();
  });

  it("3. returns null for AuthSessionMissingError (auth-js's dedicated no-valid-session class, status 400)", async () => {
    const client = fakeClientWithGetUser(async () => ({
      data: { user: null },
      error: new AuthSessionMissingError(),
    }));

    const result = await supabaseStaffAuthGateway.getAuthenticatedUserId(
      client,
      "sessionless-token",
    );

    expect(result).toBeNull();
  });

  it("3b. does NOT treat an arbitrary 400 AuthApiError as credential rejection (400 is not inherently an auth status)", async () => {
    const client = fakeClientWithGetUser(async () => ({
      data: { user: null },
      error: new AuthApiError("bad request body", 400, "bad_json"),
    }));

    await expect(
      supabaseStaffAuthGateway.getAuthenticatedUserId(client, "token"),
    ).rejects.toThrow();
  });

  it("4. returns null for a successful response with no user", async () => {
    const client = fakeClientWithGetUser(async () => ({
      data: { user: null },
      error: null,
    }));

    const result = await supabaseStaffAuthGateway.getAuthenticatedUserId(
      client,
      "token",
    );

    expect(result).toBeNull();
  });

  it("5. throws (does not return null) for a 429 rate-limit AuthApiError", async () => {
    const client = fakeClientWithGetUser(async () => ({
      data: { user: null },
      error: new AuthApiError(
        "Request rate limit reached",
        429,
        "over_request_rate_limit",
      ),
    }));

    await expect(
      supabaseStaffAuthGateway.getAuthenticatedUserId(client, "token"),
    ).rejects.toThrow();
  });

  it("6. throws for an arbitrary non-auth 4xx AuthApiError (404)", async () => {
    const client = fakeClientWithGetUser(async () => ({
      data: { user: null },
      error: new AuthApiError("Not Found", 404, undefined),
    }));

    await expect(
      supabaseStaffAuthGateway.getAuthenticatedUserId(client, "token"),
    ).rejects.toThrow();
  });

  it("7. throws for an unexpected Auth 5xx-style error (503)", async () => {
    const client = fakeClientWithGetUser(async () => ({
      data: { user: null },
      error: new AuthRetryableFetchError("Service Unavailable", 503),
    }));

    await expect(
      supabaseStaffAuthGateway.getAuthenticatedUserId(client, "token"),
    ).rejects.toThrow();
  });

  it("8. throws for an Auth error with no structured status (unclassifiable, treated as infrastructure failure)", async () => {
    const client = fakeClientWithGetUser(async () => ({
      data: { user: null },
      error: new AuthUnknownError("unknown failure with no status", new Error("root cause")),
    }));

    await expect(
      supabaseStaffAuthGateway.getAuthenticatedUserId(client, "token"),
    ).rejects.toThrow();
  });

  it("9. propagates when getUser itself throws", async () => {
    const client = fakeClientWithGetUser(async () => {
      throw new Error("network down");
    });

    await expect(
      supabaseStaffAuthGateway.getAuthenticatedUserId(client, "token"),
    ).rejects.toThrow();
  });

  it("never leaks the raw upstream error message into the thrown error", async () => {
    const secretMarker = "SUPER_SECRET_MARKER_123";
    const client = fakeClientWithGetUser(async () => ({
      data: { user: null },
      error: new AuthRetryableFetchError(secretMarker, 503),
    }));

    const error = await supabaseStaffAuthGateway
      .getAuthenticatedUserId(client, "token")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(secretMarker);
  });

  it("never leaks the raw upstream error message for a 429 rate-limit rejection either", async () => {
    const secretMarker = "SUPER_SECRET_RATE_LIMIT_MARKER";
    const client = fakeClientWithGetUser(async () => ({
      data: { user: null },
      error: new AuthApiError(secretMarker, 429, "over_request_rate_limit"),
    }));

    const error = await supabaseStaffAuthGateway
      .getAuthenticatedUserId(client, "token")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(secretMarker);
  });
});
