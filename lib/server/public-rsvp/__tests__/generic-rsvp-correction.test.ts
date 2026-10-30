import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { RsvpSubmitInputV1 } from "../../../invitation-rendering/rsvp-capability";
import { ApiError } from "../../errors/api-error";
import { handleSubmitPublicRsvpRequest } from "../../routes/public-rsvp";
import type { KeyedPublicRsvpGateway, PublicRsvpGateway } from "../public-rsvp-types";
import {
  GENERIC_RSVP_RESPONSE_KEY_LENGTH,
  hashGenericRsvpResponseKey,
  isValidGenericRsvpResponseKeyShape,
} from "../generic-rsvp-response-key";
import type { PublicGuestRsvpGateway } from "../../public-guest/public-guest-types";

const { createPublicRsvpCapability, createGenericRsvpResponseKey } = await import(
  "../../../../app/i/[slug]/public-invitation-renderer"
);

/**
 * RSVP-P0-03 — a generic RSVP corrected through "Sửa lại hồi âm" must UPDATE
 * the response that page already submitted, never insert a second row. The
 * page-instance key is opaque, in-memory only, and never identity: it is not
 * a guest name, an IP or a browser-wide cookie, and it authorizes nothing.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const strip = (source: string) =>
  source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line))
    .join("\n");

const SLUG = "an-va-binh-groom";
const BRIDE_SLUG = "an-va-binh-bride";
const ROW_ID = "f0000000-0000-4000-8000-0000000000a1";
const TOKEN = "a".repeat(43);
const KEY = "Zm9vYmFyMTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3A";

type Outcome = string | null | Error;

function deps(options: { keyed?: Outcome; legacy?: Outcome; guest?: Outcome; withKeyedGateway?: boolean } = {}) {
  const outcome = (name: "keyed" | "legacy" | "guest"): Outcome => (name in options ? (options[name] as Outcome) : ROW_ID);
  const legacyCalls: { slug: string; input: RsvpSubmitInputV1 }[] = [];
  const keyedCalls: { slug: string; hash: Uint8Array; input: RsvpSubmitInputV1 }[] = [];
  const guestCalls: { slug: string; hash: Uint8Array }[] = [];
  const settle = (outcome: Outcome) => {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  const rsvps: PublicRsvpGateway = {
    async submitPublicRsvp(slug, input) {
      legacyCalls.push({ slug, input });
      return settle(outcome("legacy"));
    },
  };
  const keyedRsvps: KeyedPublicRsvpGateway = {
    async submitKeyedPublicRsvp(slug, hash, input) {
      keyedCalls.push({ slug, hash, input });
      return settle(outcome("keyed"));
    },
  };
  const guestRsvps: PublicGuestRsvpGateway = {
    async submitPublicGuestRsvp(slug, hash) {
      guestCalls.push({ slug, hash });
      return settle(outcome("guest"));
    },
  };
  return {
    legacyCalls,
    keyedCalls,
    guestCalls,
    deps: { rsvps, guestRsvps, ...(options.withKeyedGateway === false ? {} : { keyedRsvps }) },
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    publicSlug: SLUG,
    attendance: "ATTENDING",
    partySize: 2,
    message: null,
    guestName: "Anh Hiếu và gia đình",
    ...overrides,
  };
}

type Deps = ReturnType<typeof deps>["deps"];
const submit = (payload: unknown, d: Deps) => handleSubmitPublicRsvpRequest(async () => payload, d);

// ---------------------------------------------------------------------------
// A. The response key itself
// ---------------------------------------------------------------------------

describe("A: the response key is opaque, random and only ever stored as a digest", () => {
  it("is 43 base64url characters, unguessable and different on every mint", () => {
    const keys = Array.from({ length: 200 }, () => createGenericRsvpResponseKey());
    for (const key of keys) {
      expect(key).not.toBeNull();
      expect(key).toHaveLength(GENERIC_RSVP_RESPONSE_KEY_LENGTH);
      expect(isValidGenericRsvpResponseKeyShape(key as string)).toBe(true);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is never derived from a name, a time or Math.random", () => {
    const source = strip(read("app/i/[slug]/public-invitation-renderer.tsx"));
    expect(source).toMatch(/getRandomValues/);
    expect(source).not.toMatch(/Math\.random|Date\.now|new Date|guestName\s*\+|navigator|userAgent/);
  });

  it("rejects every malformed shape the server could be handed", () => {
    for (const bad of ["", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}+`, `${"a".repeat(42)}/`, `${"a".repeat(42)}=`, "a".repeat(43).replace("a", " ")]) {
      expect(isValidGenericRsvpResponseKeyShape(bad), bad).toBe(false);
    }
    expect(isValidGenericRsvpResponseKeyShape(KEY)).toBe(true);
  });

  it("hashes to a deterministic 32-byte digest that is not the raw key", () => {
    const hash = hashGenericRsvpResponseKey(KEY);
    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash).toHaveLength(32);
    expect(hashGenericRsvpResponseKey(KEY)).toStrictEqual(hash);
    expect(hashGenericRsvpResponseKey(`${KEY.slice(0, 42)}X`)).not.toStrictEqual(hash);
    expect(Buffer.from(hash).toString("utf8")).not.toContain(KEY);
  });
});

// ---------------------------------------------------------------------------
// B. The client capability sends ONE stable key per page instance
// ---------------------------------------------------------------------------

describe("B: one key per mounted page, reused by every submit and retry", () => {
  function fetchReturning(...statuses: number[]) {
    const bodies: Record<string, unknown>[] = [];
    let call = 0;
    const impl = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      const status = statuses[Math.min(call++, statuses.length - 1)];
      return new Response(JSON.stringify(status === 201 ? { data: { recorded: true } } : { error: "x" }), { status });
    }) as unknown as typeof fetch;
    return { bodies, impl };
  }

  const input: RsvpSubmitInputV1 = { attendance: "ATTENDING", partySize: 2, message: null, guestName: "Anh Hiếu" };
  const correction: RsvpSubmitInputV1 = { attendance: "NOT_ATTENDING", partySize: 0, message: null, guestName: "Anh Hiếu" };

  it("the generic request carries the slug, the four fields and the key — nothing else", async () => {
    const f = fetchReturning(201);
    expect(await createPublicRsvpCapability(SLUG, f.impl, undefined, KEY).submit(input)).toEqual({ status: "SUCCESS" });
    expect(f.bodies[0]).toStrictEqual({ publicSlug: SLUG, responseKey: KEY, ...input });
  });

  it('"Sửa lại hồi âm" resubmits the SAME key, so the server corrects one row', async () => {
    const f = fetchReturning(201);
    const capability = createPublicRsvpCapability(SLUG, f.impl, undefined, KEY);
    await capability.submit(input);
    await capability.submit(correction);
    expect(f.bodies).toHaveLength(2);
    expect(f.bodies[0].responseKey).toBe(KEY);
    expect(f.bodies[1].responseKey).toBe(KEY);
    expect(f.bodies[1].attendance).toBe("NOT_ATTENDING");
  });

  it("a retry after a failed attempt reuses the key instead of minting a new response", async () => {
    const f = fetchReturning(500, 201);
    const capability = createPublicRsvpCapability(SLUG, f.impl, undefined, KEY);
    expect(await capability.submit(input)).toEqual({ status: "FAILED" });
    expect(await capability.submit(input)).toEqual({ status: "SUCCESS" });
    expect(new Set(f.bodies.map((b) => b.responseKey))).toStrictEqual(new Set([KEY]));
  });

  it("two page instances are independent even with an identical typed name", async () => {
    const a = createGenericRsvpResponseKey();
    const b = createGenericRsvpResponseKey();
    expect(a).not.toBe(b);
    const f = fetchReturning(201);
    await createPublicRsvpCapability(SLUG, f.impl, undefined, a).submit(input);
    await createPublicRsvpCapability(SLUG, f.impl, undefined, b).submit(input);
    expect(f.bodies[0].responseKey).not.toBe(f.bodies[1].responseKey);
    expect(f.bodies[0].guestName).toBe(f.bodies[1].guestName);
  });

  it("the personalized route never sends a key, and an absent key keeps the pre-RSVP-P0-03 body", async () => {
    const f = fetchReturning(201);
    await createPublicRsvpCapability(SLUG, f.impl, TOKEN, KEY).submit(input);
    await createPublicRsvpCapability(SLUG, f.impl, undefined, null).submit(input);
    await createPublicRsvpCapability(SLUG, f.impl).submit(input);
    expect(f.bodies[0]).toStrictEqual({ publicSlug: SLUG, guestToken: TOKEN, ...input });
    expect(f.bodies[1]).toStrictEqual({ publicSlug: SLUG, ...input });
    expect(f.bodies[2]).toStrictEqual({ publicSlug: SLUG, ...input });
  });

  it("the key never reaches a cookie, web storage, the URL or a log, and the page mints it exactly once per mount", () => {
    const source = strip(read("app/i/[slug]/public-invitation-renderer.tsx"));
    expect(source).not.toMatch(/document\.cookie|localStorage|sessionStorage|indexedDB|history\.|location\.|console\.|searchParams/);
    // Lazy useState initializer: a re-render or a discarded memo must not mint a second key.
    expect(strip(source)).toMatch(/useState<string \| null>\(\(\) => \(guestToken === undefined \? createGenericRsvpResponseKey\(\) : null\)\)/);
  });
});

// ---------------------------------------------------------------------------
// C. The server use case: keyed, unkeyed and personalized stay separate
// ---------------------------------------------------------------------------

describe("C: the keyed generic request is routed to the 0056 writer only", () => {
  it("forwards the slug, the key's digest and the exact canonical input; the 0040 writer is untouched", async () => {
    const g = deps();
    const res = await submit(body({ responseKey: KEY }), g.deps);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { recorded: true } });
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(g.legacyCalls).toHaveLength(0);
    expect(g.guestCalls).toHaveLength(0);
    expect(g.keyedCalls).toHaveLength(1);
    expect(g.keyedCalls[0].slug).toBe(SLUG);
    expect(g.keyedCalls[0].hash).toStrictEqual(hashGenericRsvpResponseKey(KEY));
    expect(g.keyedCalls[0].input).toStrictEqual({ attendance: "ATTENDING", partySize: 2, message: null, guestName: "Anh Hiếu và gia đình" });
  });

  it("the raw key is never forwarded past the hash boundary", async () => {
    const g = deps();
    await submit(body({ responseKey: KEY }), g.deps);
    expect(JSON.stringify(g.keyedCalls)).not.toContain(KEY);
  });

  it("a correction and a repeat of the same key resolve to the same digest, submission after submission", async () => {
    const g = deps();
    await submit(body({ responseKey: KEY }), g.deps);
    await submit(body({ responseKey: KEY, attendance: "MAYBE", partySize: 4 }), g.deps);
    await submit(body({ responseKey: KEY, attendance: "MAYBE", partySize: 4 }), g.deps);
    expect(g.keyedCalls).toHaveLength(3);
    expect(new Set(g.keyedCalls.map((c) => Buffer.from(c.hash).toString("hex"))).size).toBe(1);
  });

  it("an unkeyed generic body still goes to the 0040 writer, unchanged", async () => {
    const g = deps();
    expect((await submit(body(), g.deps)).status).toBe(201);
    expect(g.keyedCalls).toHaveLength(0);
    expect(g.legacyCalls).toEqual([
      { slug: SLUG, input: { attendance: "ATTENDING", partySize: 2, message: null, guestName: "Anh Hiếu và gia đình" } },
    ]);
  });

  it("a personalized body is unchanged and never keyed", async () => {
    const g = deps();
    expect((await submit(body({ guestToken: TOKEN }), g.deps)).status).toBe(201);
    expect(g.keyedCalls).toHaveLength(0);
    expect(g.legacyCalls).toHaveLength(0);
    expect(g.guestCalls).toHaveLength(1);
  });

  it.each([
    ["a key together with a guest token", { responseKey: KEY, guestToken: TOKEN }],
    ["a non-string key", { responseKey: 42 }],
    ["a null key", { responseKey: null }],
    ["a short key", { responseKey: "a".repeat(42) }],
    ["a long key", { responseKey: "a".repeat(44) }],
    ["a non-base64url key", { responseKey: `${"a".repeat(42)}+` }],
    ["an extra authoritative key beside a valid one", { responseKey: KEY, projectId: ROW_ID }],
  ])("%s → 400 with nothing written", async (_label, overrides) => {
    const g = deps();
    const res = await submit(body(overrides), g.deps);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid RSVP request" });
    expect([...g.keyedCalls, ...g.legacyCalls, ...g.guestCalls]).toHaveLength(0);
  });

  it("invalid response fields still fail before the key is used", async () => {
    const g = deps();
    for (const overrides of [{ partySize: 0 }, { guestName: " x" }, { attendance: "YES" }, { message: "a".repeat(501) }]) {
      expect((await submit(body({ responseKey: KEY, ...overrides }), g.deps)).status).toBe(400);
    }
    expect(g.keyedCalls).toHaveLength(0);
  });

  it("a malformed slug is 404 before any keyed write", async () => {
    const g = deps();
    expect((await submit(body({ responseKey: KEY, publicSlug: "UPPER" }), g.deps)).status).toBe(404);
    expect(g.keyedCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// D. Failure never looks like success
// ---------------------------------------------------------------------------

describe("D: every keyed failure fails closed", () => {
  it("an unknown or unpublished slug (RPC → NULL) is 404, not a success", async () => {
    const g = deps({ keyed: null });
    const res = await submit(body({ responseKey: KEY }), g.deps);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Invitation not found" });
  });

  it("a key bound to another invitation or Project (RK001 → NOT_FOUND) is 404, never a duplicate", async () => {
    const g = deps({ keyed: new ApiError("NOT_FOUND", "Invitation not found") });
    const res = await submit(body({ responseKey: KEY, publicSlug: BRIDE_SLUG }), g.deps);
    expect(res.status).toBe(404);
    expect(g.legacyCalls).toHaveLength(0);
  });

  it("RS001 from the RPC is 400", async () => {
    const g = deps({ keyed: new ApiError("BAD_REQUEST", "Invalid RSVP request") });
    expect((await submit(body({ responseKey: KEY }), g.deps)).status).toBe(400);
  });

  it("a database fault is 500 with no detail and no fallback to an unkeyed insert", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const g = deps({ keyed: new Error("duplicate key value violates unique constraint rsvps_response_key_hash_key") });
    const res = await submit(body({ responseKey: KEY }), g.deps);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
    expect(g.legacyCalls).toHaveLength(0);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(new RegExp(`${KEY}|rsvps_response_key_hash_key|Anh Hiếu`));
    spy.mockRestore();
  });

  it("an unconfigured keyed gateway is 500 — never a silent unkeyed duplicate", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const g = deps({ withKeyedGateway: false });
    const res = await submit(body({ responseKey: KEY }), g.deps);
    expect(res.status).toBe(500);
    expect(g.legacyCalls).toHaveLength(0);
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// E. Migration 0056 and service_role containment
// ---------------------------------------------------------------------------

describe("E: migration 0056 is additive, atomic and service_role-only", () => {
  const dir = join(ROOT, "supabase/migrations");
  const names = readdirSync(dir).sort();
  const file = "20260911041216_0056_generic_rsvp_response_key.sql";
  const sql = readFileSync(join(dir, file), "utf8");
  const code = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
  const signature = "public.submit_public_rsvp_keyed(text, bytea, text, integer, text, text)";

  it("is the one 0056 and the head migration, authored only", () => {
    expect(names.at(-1)).toBe(file);
    expect(names.at(-2)).toBe("20260911041215_0055_rsvp_invitation_source.sql");
    expect(names.filter((name) => /_0056_/.test(name))).toStrictEqual([file]);
    expect(sql).toMatch(/AUTHORING ONLY — not applied/);
  });

  it("adds a nullable, generic-only, uniquely-owned key column and nothing destructive", () => {
    const addColumn = code.slice(code.indexOf("ALTER TABLE"), code.indexOf("CREATE UNIQUE INDEX"));
    expect(addColumn).toMatch(/ADD COLUMN response_key_hash BYTEA NULL;/);
    expect(addColumn).not.toMatch(/DEFAULT|NOT NULL;|SET NOT NULL/);
    expect(code).toMatch(/CHECK \(response_key_hash IS NULL OR octet_length\(response_key_hash\) = 32\)/);
    expect(code).toMatch(/CHECK \(response_key_hash IS NULL OR guest_id IS NULL\)/);
    expect(code).toMatch(/CREATE UNIQUE INDEX rsvps_response_key_hash_key\s+ON public\.rsvps \(response_key_hash\)\s+WHERE response_key_hash IS NOT NULL;/);
    expect(code).not.toMatch(/DROP |TRUNCATE|DELETE FROM|UPDATE public\.rsvps SET|CREATE POLICY|USING \(true\)|ALTER POLICY/i);
  });

  it("creates ONE new function and replaces neither legacy writer", () => {
    expect(code.match(/CREATE (OR REPLACE )?FUNCTION/g)).toStrictEqual(["CREATE FUNCTION"]);
    expect(code).toMatch(/CREATE FUNCTION public\.submit_public_rsvp_keyed\(/);
    expect(code).not.toMatch(/CREATE OR REPLACE FUNCTION public\.submit_public_rsvp\b|CREATE OR REPLACE FUNCTION public\.submit_public_guest_rsvp\b/);
    expect(code).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(code).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM ${role};`);
    }
    expect(code.match(/GRANT [A-Z]+ ON/g)).toStrictEqual(["GRANT EXECUTE ON"]);
    expect(code).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role;`);
  });

  it("binds only to the CURRENT PUBLISHED version and requires a 32-byte key", () => {
    expect(code).toMatch(/pi\.public_slug = p_public_slug/);
    expect(code).toMatch(/v_published_id IS NULL THEN\s+RETURN NULL/);
    expect(code).toMatch(/version_type IS DISTINCT FROM 'PUBLISHED'/);
    expect(code).toMatch(/p_response_key_hash IS NULL\s+OR octet_length\(p_response_key_hash\) <> 32/);
    expect(code).toMatch(/ERRCODE = 'RS001'/);
    expect(code).toMatch(/ERRCODE = 'PI001'/);
    // No client-supplied binding and no read of existing responses, inside the function itself.
    const fn = code.slice(code.indexOf("CREATE FUNCTION public.submit_public_rsvp_keyed"), code.indexOf("REVOKE ALL ON FUNCTION"));
    expect(fn).not.toMatch(/p_project_id|p_invitation_id|p_variant|p_guest_id|SELECT[^;]*FROM public\.rsvps|public\.guests/);
  });

  it("submits-or-corrects in ONE atomic statement, pinned to the same invitation and Project", () => {
    expect(code).toMatch(/ON CONFLICT \(response_key_hash\) WHERE response_key_hash IS NOT NULL\s+DO UPDATE SET/);
    expect(code).toMatch(/WHERE r\.project_id\s+= v_project_id\s+AND r\.invitation_id = v_invitation_id\s+AND r\.guest_id IS NULL/);
    // The recorded 0055 source is never rewritten, and guest identity is never touched.
    const setClause = code.slice(code.indexOf("DO UPDATE SET"), code.indexOf("WHERE r.project_id"));
    expect(setClause).not.toMatch(/invitation_id|guest_id|project_id|response_key_hash/);
    expect(setClause).toMatch(/guest_display_name_snapshot|attendance|party_size|message/);
    // A key that belongs elsewhere updates nothing and raises, rather than inserting.
    expect(code).toMatch(/IF v_rsvp_id IS NULL THEN\s+RAISE EXCEPTION 'Response key does not belong to this published invitation'\s+USING ERRCODE = 'RK001';/);
    expect(code).toMatch(/invitation_id,\s+guest_id,\s+guest_display_name_snapshot/);
  });

  it("verifies its own post-conditions, including that nothing historical was keyed", () => {
    expect(code).toMatch(/no existing rsvps row may be given a response_key_hash/);
    expect(code).toMatch(/rsvps_guest_id_key must still exist/);
    expect(code).toMatch(/0055 composite invitation FK must still exist/);
    expect(code).toMatch(/rsvps must keep forced RLS/);
  });

  it("the keyed repository calls only submit_public_rsvp_keyed and touches no table, storage or log", () => {
    const repo = strip(read("lib/server/supabase/keyed-public-rsvp-repository.ts"));
    expect([...repo.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)].map((m) => m[1])).toStrictEqual(["submit_public_rsvp_keyed"]);
    expect(repo).not.toMatch(/\.from\(|\.storage\b|console\./);
    expect(repo).toMatch(/toPostgresByteaHexLiteral\(responseKeyHash\)/);
    // The 0040-only writer stays exactly that.
    const legacy = strip(read("lib/server/supabase/public-rsvp-repository.ts"));
    expect([...legacy.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)].map((m) => m[1])).toStrictEqual(["submit_public_rsvp"]);
  });

  it("no service-role key or client reaches the public boundary", () => {
    for (const f of [
      "app/api/v2/public/rsvp/route.ts",
      "lib/server/routes/public-rsvp.ts",
      "lib/server/public-rsvp/submit-public-rsvp.ts",
      "lib/server/public-rsvp/generic-rsvp-response-key.ts",
      "app/i/[slug]/public-invitation-renderer.tsx",
    ]) {
      expect(read(f), f).not.toMatch(/service-role-client|SUPABASE_SERVICE_ROLE_KEY|createServiceRole/);
    }
    // The key module is deliberately independent of the access-link/guest-token contract (D7).
    const keyModule = strip(read("lib/server/public-rsvp/generic-rsvp-response-key.ts"));
    expect(keyModule).not.toMatch(/access-token-crypto|access_links|guests|token_hash/);
  });
});
