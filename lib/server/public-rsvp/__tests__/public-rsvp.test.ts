import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { RsvpSubmitInputV1 } from "../../../invitation-rendering/rsvp-capability";
import { ApiError } from "../../errors/api-error";
import { handleSubmitPublicRsvpRequest } from "../../routes/public-rsvp";
import { toPublicRsvpId } from "../../supabase/public-rsvp-repository";
import type { PublicRsvpGateway } from "../public-rsvp-types";

/**
 * Task 033A — public RSVP foundation: canonical validation, server-derived
 * PUBLISHED binding, typed name never identity, no fake success.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const strip = (source: string) =>
  source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line))
    .join("\n");

const ROW_ID = "f0000000-0000-4000-8000-0000000000a1";
const SLUG = "an-va-binh-k3x9";

function gateway(outcome: string | null | Error = ROW_ID) {
  const calls: { slug: string; input: RsvpSubmitInputV1 }[] = [];
  const rsvps: PublicRsvpGateway = {
    async submitPublicRsvp(slug, input) {
      calls.push({ slug, input });
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
  return { calls, deps: { rsvps } };
}

function body(overrides: Record<string, unknown> = {}) {
  return { publicSlug: SLUG, attendance: "ATTENDING", partySize: 2, message: null, guestName: "Anh Hiếu và gia đình", ...overrides };
}

const submit = (payload: unknown, deps: ReturnType<typeof gateway>["deps"]) =>
  handleSubmitPublicRsvpRequest(async () => payload, deps);

describe("B–D: valid submissions persist through the gateway and only then succeed", () => {
  it.each([
    ["ATTENDING", 2],
    ["MAYBE", 1],
    ["NOT_ATTENDING", 0],
  ] as const)("%s / partySize %i → 201 recorded, exact canonical input forwarded", async (attendance, partySize) => {
    const g = gateway();
    const res = await submit(body({ attendance, partySize, message: "Chúc mừng!" }), g.deps);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { recorded: true } });
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(g.calls).toEqual([
      { slug: SLUG, input: { attendance, partySize, message: "Chúc mừng!", guestName: "Anh Hiếu và gia đình" } },
    ]);
  });
});

describe("E–G: canonical validation fails closed before any write", () => {
  it.each([
    ["blank name", { guestName: "   " }],
    ["empty name", { guestName: "" }],
    ["untrimmed name", { guestName: " Anh Hiếu" }],
    ["null name", { guestName: null }],
    ["name over 200 code points", { guestName: "ệ".repeat(201) }],
    ["ATTENDING party 0", { partySize: 0 }],
    ["ATTENDING party 21", { partySize: 21 }],
    ["MAYBE party 0", { attendance: "MAYBE", partySize: 0 }],
    ["NOT_ATTENDING party 1", { attendance: "NOT_ATTENDING", partySize: 1 }],
    ["fractional party", { partySize: 1.5 }],
    ["string party", { partySize: "2" }],
    ["unknown status", { attendance: "YES" }],
    ["lowercase status", { attendance: "attending" }],
    ["message over 500", { message: "a".repeat(501) }],
  ])("%s → 400, nothing written", async (_label, overrides) => {
    const g = gateway();
    const res = await submit(body(overrides), g.deps);
    expect(res.status).toBe(400);
    expect(g.calls).toHaveLength(0);
  });

  it("a 200-code-point Vietnamese name is accepted", async () => {
    const g = gateway();
    expect((await submit(body({ guestName: "ệ".repeat(200) }), g.deps)).status).toBe(201);
  });

  it("non-object / unparseable bodies → 400", async () => {
    const g = gateway();
    expect((await submit(null, g.deps)).status).toBe(400);
    expect((await submit([body()], g.deps)).status).toBe(400);
    const res = await handleSubmitPublicRsvpRequest(async () => {
      throw new SyntaxError("bad json");
    }, g.deps);
    expect(res.status).toBe(400);
    expect(g.calls).toHaveLength(0);
  });
});

describe("H/I/J/K: binding is derived server-side from the slug only", () => {
  it.each(["projectId", "invitationId", "invitationVersionId", "rendererKey", "guestId", "token", "guest"])(
    "an extra authoritative key %s is rejected (400)",
    async (key) => {
      const g = gateway();
      const res = await submit({ ...body(), [key]: "x" }, g.deps);
      expect(res.status).toBe(400);
      expect(g.calls).toHaveLength(0);
    },
  );

  it("a missing slug key → 400; a malformed slug → 404 with no gateway call", async () => {
    const g = gateway();
    const withoutSlug: Record<string, unknown> = body();
    delete withoutSlug.publicSlug;
    expect((await submit(withoutSlug, g.deps)).status).toBe(400);
    for (const bad of ["", "UPPER", "../x", "a b", 42, "x".repeat(101)]) {
      expect((await submit(body({ publicSlug: bad }), g.deps)).status).toBe(404);
    }
    expect(g.calls).toHaveLength(0);
  });

  it("unknown / unpublished slug (RPC → NULL) → 404, never success", async () => {
    const g = gateway(null);
    const res = await submit(body(), g.deps);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Invitation not found" });
  });

  it("the typed name is forwarded only as response data; the same name twice is two independent submissions", async () => {
    const g = gateway();
    await submit(body(), g.deps);
    await submit(body({ attendance: "NOT_ATTENDING", partySize: 0 }), g.deps);
    expect(g.calls).toHaveLength(2);
    expect(g.calls.every((c) => c.slug === SLUG && Object.keys(c.input).sort().join() === "attendance,guestName,message,partySize")).toBe(true);
  });
});

describe("M: persistence failure never returns success", () => {
  it("a generic gateway failure → 500 with a fixed message, no detail", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await submit(body(), gateway(new Error("duplicate key value violates constraint rsvps_pkey")).deps);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/Anh Hiếu|an-va-binh|rsvps_pkey/);
    spy.mockRestore();
  });

  it("an RS001 (DB re-validation) failure → 400", async () => {
    const res = await submit(body(), gateway(new ApiError("BAD_REQUEST", "Invalid RSVP request")).deps);
    expect(res.status).toBe(400);
  });

  it("the repository accepts only a UUID row id or NULL", () => {
    expect(toPublicRsvpId(ROW_ID)).toBe(ROW_ID);
    expect(toPublicRsvpId(null)).toBeNull();
    expect(() => toPublicRsvpId(true)).toThrow();
    expect(() => toPublicRsvpId({ id: ROW_ID })).toThrow();
  });
});

describe("migration 0040 + service_role containment (P, security)", () => {
  const dir = join(ROOT, "supabase/migrations");
  const file = readdirSync(dir).find((f) => f.includes("_0040_"));
  const sql = file ? readFileSync(join(dir, file), "utf8") : "";

  it("is the only 0040 migration: SECURITY DEFINER, empty search_path, service_role-only EXECUTE", () => {
    expect(readdirSync(dir).filter((f) => f.includes("_0040_"))).toHaveLength(1);
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.submit_public_rsvp(text, text, integer, text, text) FROM ${role};`);
    }
    expect(sql.match(/GRANT [A-Z]+ ON/g)).toEqual(["GRANT EXECUTE ON"]);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.submit_public_rsvp\(text, text, integer, text, text\) TO service_role;/);
    expect(sql).not.toMatch(/CREATE POLICY|ALTER TABLE|DROP |current_review_version_id|USING \(true\)/i);
  });

  it("binds only to the CURRENT PUBLISHED version and writes guest_id NULL with the typed name as snapshot", () => {
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).toMatch(/pi\.public_slug = p_public_slug/);
    expect(code).toMatch(/v_published_id IS NULL THEN\s+RETURN NULL/);
    expect(code).toMatch(/version_type IS DISTINCT FROM 'PUBLISHED'/);
    expect(code).toMatch(/VALUES \(\s+v_project_id,\s+NULL,\s+p_guest_name,/);
    expect(code).not.toMatch(/public\.guests|ON CONFLICT|UPDATE public\.rsvps|SELECT[^;]*FROM public\.rsvps/);
    expect(code).toMatch(/'ATTENDING', 'MAYBE', 'NOT_ATTENDING'/);
  });

  it("the repository calls only submit_public_rsvp and touches no table or storage; route/wiring never import service-role-client", () => {
    const repo = strip(read("lib/server/supabase/public-rsvp-repository.ts"));
    expect([...repo.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)].map((m) => m[1])).toEqual(["submit_public_rsvp"]);
    expect(repo).not.toMatch(/\.from\(|\.storage\b|console\./);
    for (const f of [
      "app/api/v2/public/rsvp/route.ts",
      "lib/server/routes/public-rsvp.ts",
      "lib/server/public-rsvp/submit-public-rsvp.ts",
      "app/i/[slug]/public-invitation-renderer.tsx",
      "app/i/[slug]/page.tsx",
    ]) {
      expect(read(f), f).not.toMatch(/service-role-client|SUPABASE_SERVICE_ROLE_KEY|createServiceRole/);
    }
  });
});
