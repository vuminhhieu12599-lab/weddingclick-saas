import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import nextConfig, { LEGACY_V1_STAFF_REDIRECTS } from "../../next.config";
import { LEGACY_V1_UNAVAILABLE_MESSAGE } from "../legacy-v1-retired";

/**
 * Task 035B — Legacy V1 exposure containment. Static + render checks only:
 * migration 0043 is authored, NOT applied (the owner applies it), so nothing
 * here touches Supabase.
 */

const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const MIGRATION = "supabase/migrations/20260911041203_0043_legacy_v1_lockdown.sql";
const sql = read(MIGRATION);
const executable = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const PUBLIC_V1_PAGES = ["app/[id]/page.tsx", "app/[id]/rsvp/page.tsx", "app/[id]/vip/page.tsx", "app/guest-list/[id]/page.tsx"];
const STAFF_V1_PAGES = ["app/dashboard/page.tsx", "app/thong-ke/page.tsx"];
const THEMES = ["components/ThemeLuxury.tsx", "components/ThemeModern.tsx", "components/ThemeTraditional.tsx"];
/** The only browser file allowed to keep V1 writes: the owner's untouched V1 editor, quarantined below. */
const QUARANTINED = "app/admin/page.tsx";

/**
 * V2 Task 024 browser half of the trusted media workflow: uploads only to a
 * server-issued path with a server-issued one-time token (`uploadToSignedUrl`),
 * authorized by that token — never by an anon policy. Asserted narrowly below.
 */
const V2_SIGNED_UPLOAD = "lib/admin/signed-media-upload.ts";
/** Direct Supabase mutation / storage-write call shapes through a browser client. */
const BROWSER_WRITE = /\.(insert|update|upsert|delete|rpc|upload|remove|move|copy)\s*\(|\.storage\b/;

const listSource = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (["node_modules", ".next", "__tests__"].includes(name)) return [];
    if (statSync(join(ROOT, rel)).isDirectory()) return listSource(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
const browserSupabaseImporters = () =>
  [...listSource("app"), ...listSource("components"), ...listSource("templates"), ...listSource("lib")]
    .filter((f) => !f.startsWith("lib/server/"))
    .filter((f) => /from\s+["'][./]*lib\/supabase["']/.test(read(f)) || /from\s+["']\.\.?\/supabase["']/.test(read(f)));

describe("migration 0043 — database lockdown (A–E, I, S)", () => {
  it("revokes ALL from anon, authenticated and PUBLIC on exactly the three V1 tables and their sequences", () => {
    expect(executable).toMatch(/ARRAY\['invitations', 'weddings', 'wishes'\]/);
    expect(executable).toMatch(/REVOKE ALL ON TABLE public\.%I FROM anon, authenticated, PUBLIC/);
    expect(executable).toMatch(/REVOKE ALL ON SEQUENCE %s FROM anon, authenticated, PUBLIC/);
    expect(executable).not.toMatch(/\bservice_role\b|\bpostgres\b.*(REVOKE|GRANT)|GRANT\s/);
  });

  it("enables and forces RLS, drops the two known permissive policies, and fails closed if any policy or grant remains", () => {
    expect(executable).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(executable).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(executable).toContain('DROP POLICY IF EXISTS "Cho phép admin sửa thiệp" ON public.invitations;');
    expect(executable).toContain('DROP POLICY IF EXISTS "Cho phép tất cả mọi người đọc thiệp" ON public.invitations;');
    for (const assertion of ["legacy table privileges remain", "legacy table policies remain", "legacy tables without forced RLS", "wedding-photos storage policies remain", "wedding-photos bucket is still public"]) {
      expect(executable).toContain(`RAISE EXCEPTION '0043: ${assertion}`);
    }
  });

  it("is non-destructive: no row/object deletion, truncation, table drop or V1 data update", () => {
    expect(executable).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+(TABLE|SCHEMA|BUCKET|FUNCTION)\b|\bALTER\s+TABLE\s+\S+\s+DROP\b/i);
    expect([...executable.matchAll(/\bUPDATE\s+([\w.]+)/gi)].map((m) => m[1])).toEqual(["storage.buckets"]);
  });

  it("touches no V2 resource and is guarded for fresh environments; authored, not applied", () => {
    expect(executable).not.toMatch(/project-media|project_|guests|rsvps|profiles|activity_logs|invitation_versions/);
    expect(executable.match(/to_regclass\(/g)?.length).toBeGreaterThanOrEqual(6);
    expect(sql).toContain("AUTHORING ONLY — not applied.");
    const migrations = readdirSync(join(ROOT, "supabase/migrations")).sort();
    // Launch Hardening 04 (owner-approved checkpoint maintenance): exactly the approved 0044 may follow 0043.
    // TE-03B (checkpoint maintenance): exactly 0046 may follow 0044; 0045 is retired and must stay absent.
    expect(migrations.slice(-4)).toEqual(["20260911041202_0042_personalized_guest_link.sql", "20260911041203_0043_legacy_v1_lockdown.sql", "20260911041204_0044_republish_after_published.sql", "20260911041206_0046_project_template_media_slots.sql"]);
  });
});

describe("migration 0043 — wedding-photos storage lockdown (F, G, H, J)", () => {
  it("drops only the anonymous upload policy, makes the bucket private, keeps every object and leaves project-media alone", () => {
    expect(executable).toContain('DROP POLICY IF EXISTS "Cho phép mọi người tải ảnh lên" ON storage.objects;');
    expect(executable).toMatch(/UPDATE storage\.buckets\s+SET public = false\s+WHERE id = 'wedding-photos'/);
    expect(executable.match(/DROP POLICY/g)).toHaveLength(3);
    expect(executable).not.toMatch(/storage\.objects\s+(SET|WHERE)|FROM storage\.objects\b(?![\s\S]*pg_policies)/);
  });
});

describe("public V1 routes — fixed unavailable state (K, L)", () => {
  it.each(PUBLIC_V1_PAGES)("%s renders only the fixed message and reads/writes no V1 table", async (file) => {
    const page = (await import(`../../${file}`)) as { default: () => React.ReactElement; metadata: { robots: unknown } };
    const html = renderToStaticMarkup(page.default());
    expect(html).toContain(LEGACY_V1_UNAVAILABLE_MESSAGE);
    expect(html).not.toMatch(/supabase|invitation_id|wedding_id|Không tìm thấy|error/i);
    expect(page.metadata.robots).toEqual({ index: false, follow: false });
    const source = read(file);
    expect(source).not.toMatch(/lib\/supabase|Theme(Luxury|Modern|Traditional)|"use client"/);
  });

  it("the three V1 themes no longer write RSVP and never show success after submit", () => {
    for (const theme of THEMES) {
      const source = read(theme);
      expect(source, theme).not.toMatch(/lib\/supabase|from\('wishes'\)|\.insert\(/);
      expect(source, theme).toMatch(/const handleRsvpSubmit = \(e: React\.FormEvent\) => \{\n\s+e\.preventDefault\(\);\n\s+alert\(LEGACY_V1_UNAVAILABLE_MESSAGE\);\n\s+\};/);
    }
  });
});

describe("staff V1 routes — redirect to /admin/v2 (M, N, O, P)", () => {
  it.each(STAFF_V1_PAGES)("%s redirects to /admin/v2 at page level and contains no V1 data access", async (file) => {
    const page = (await import(`../../${file}`)) as { default: () => never };
    let digest = "";
    try {
      page.default();
    } catch (error) {
      digest = String((error as { digest?: string }).digest);
    }
    expect(digest).toMatch(/^NEXT_REDIRECT;replace;\/admin\/v2;307;/);
    expect(read(file)).not.toMatch(/lib\/supabase|"use client"/);
  });

  it("next.config redirects exactly /admin, /dashboard, /thong-ke (literal, temporary) and never /admin/v2", async () => {
    const rules = await nextConfig.redirects!();
    expect(rules).toEqual(LEGACY_V1_STAFF_REDIRECTS.map((rule) => ({ ...rule })));
    expect(rules.map((r) => [r.source, r.destination, r.permanent])).toEqual([
      ["/admin", "/admin/v2", false],
      ["/dashboard", "/admin/v2", false],
      ["/thong-ke", "/admin/v2", false],
    ]);
    for (const rule of rules) expect(rule.source).toMatch(/^\/[a-z-]+$/);
    for (const v2 of ["/admin/v2", "/admin/v2/projects", "/i/slug", "/portal/x", "/review/x", "/login"]) {
      expect(rules.some((r) => r.source === v2)).toBe(false);
    }
  });
});

describe("static browser-write boundary (R, H, Q, I)", () => {
  it("no browser file writes through the public Supabase client except the quarantined V1 editor", () => {
    const writers = browserSupabaseImporters().filter((f) => BROWSER_WRITE.test(read(f)));
    expect(writers.sort()).toEqual([QUARANTINED, V2_SIGNED_UPLOAD]);
    expect(browserSupabaseImporters().sort()).toEqual([
      "app/admin/page.tsx",
      "app/admin/v2/_hooks/use-staff-session.ts",
      "app/login/page.tsx",
      "lib/admin/signed-media-upload.ts",
      "lib/admin/staff-session-client.ts",
    ]);
    // The V2 exception may only perform the token-authorized signed upload — no table write, rpc or other storage call.
    const signed = read(V2_SIGNED_UPLOAD);
    expect([...signed.matchAll(/\.(insert|update|upsert|delete|rpc|upload|uploadToSignedUrl|remove|move|copy|from)\s*\(/g)].map((m) => m[1])).toEqual(["from", "uploadToSignedUrl"]);
  });

  it("the quarantine holds only while /admin is redirected AND 0043 denies its table and storage operations", () => {
    const admin = read(QUARANTINED);
    const tables = [...admin.matchAll(/\.from\(['"](\w+)['"]\)/g)].map((m) => m[1]);
    const buckets = [...admin.matchAll(/storage\.from\(['"]([\w-]+)['"]\)/g)].map((m) => m[1]);
    expect(LEGACY_V1_STAFF_REDIRECTS.some((r) => r.source === "/admin" && r.destination === "/admin/v2")).toBe(true);
    for (const table of tables.filter((t) => !buckets.includes(t))) expect(["invitations", "weddings", "wishes"]).toContain(table);
    for (const bucket of buckets) expect(bucket).toBe("wedding-photos");
    expect(executable).toContain("WHERE id = 'wedding-photos'");
  });

  it("the boundary detector catches every mutation shape (self-test)", () => {
    for (const snippet of ["supabase.from('wishes').insert([x])", "x.update({a:1})", "x.upsert(p)", "x.delete()", "supabase.rpc('f')", "supabase.storage.from('b').upload(n, f)"]) {
      expect(BROWSER_WRITE.test(snippet), snippet).toBe(true);
    }
    expect(BROWSER_WRITE.test("supabase.auth.getSession()")).toBe(false);
  });

  it("no service-role credential or client creation reaches browser code", () => {
    for (const f of [...listSource("app"), ...listSource("components"), ...listSource("templates")]) {
      expect(read(f), f).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service-role-client|NEXT_PUBLIC_[A-Z_]*SERVICE/);
    }
    const clientCreators = [...listSource("app"), ...listSource("components"), ...listSource("templates"), ...listSource("lib")]
      .filter((f) => !f.startsWith("lib/server/"))
      .filter((f) => /\bcreateClient\(/.test(read(f)));
    expect(clientCreators).toEqual(["lib/supabase.ts"]);
  });
});

describe("frozen work protected (G, T, U, V)", () => {
  it("035A runtime, V2 routes/services/templates and the public V2 RSVP are byte-identical to HEAD", () => {
    const paths = ["proxy.ts", "package.json", "package-lock.json", "lib/server", "app/api", "app/admin/v2", "app/i", "app/portal", "app/review", "templates", ":!**/__tests__/**"];
    expect(execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...paths], { cwd: ROOT, encoding: "utf8" })).toBe("");
    expect(execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", ...paths], { cwd: ROOT, encoding: "utf8" })).toBe("");
  });
});
