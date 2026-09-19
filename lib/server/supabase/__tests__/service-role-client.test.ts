import { afterEach, describe, expect, it, vi } from "vitest";

import { createServiceRoleSupabaseClient } from "../service-role-client";

/**
 * Task 026 Phase 2 §23: importing/calling this factory must never require a
 * real SUPABASE_SERVICE_ROLE_KEY to run this test suite in CI/dev — every
 * env value used below is a harmless local fixture string, never a real
 * secret.
 */
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllEnvs();
});

describe("createServiceRoleSupabaseClient", () => {
  it("throws a generic configuration error when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => createServiceRoleSupabaseClient()).toThrow(
      "Supabase server-role environment configuration is missing",
    );
  });

  it("throws a generic configuration error when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role-key-value";

    expect(() => createServiceRoleSupabaseClient()).toThrow(
      "Supabase server-role environment configuration is missing",
    );
  });

  it("never includes the raw key value in the thrown error message", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role-key-value";

    try {
      createServiceRoleSupabaseClient();
      expect.unreachable("expected createServiceRoleSupabaseClient to throw");
    } catch (error) {
      expect((error as Error).message).not.toContain("fixture-service-role-key-value");
    }
  });

  it("succeeds and returns a client when both env values are present", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role-key-value";

    const client = createServiceRoleSupabaseClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
  });

  it("never falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY when the service-role key is missing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key-value";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => createServiceRoleSupabaseClient()).toThrow();
  });
});
