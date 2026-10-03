import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { requiredInvitationVariantsForPackage, SERVICE_PACKAGE_CODES } from "../../../domain";

/**
 * Task 030B static containment: service_role stays inside the two narrow
 * customer-review modules, the signer is CUSTOMER REVIEW MEDIA SIGNING ONLY,
 * and migration 0037 grants nothing broad and never touches payment or
 * publication state.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const stripSql = (source: string) => source.replace(/--.*$/gm, "");

const SIGNER = "lib/server/supabase/customer-review-media-signer.ts";
const REPOSITORY = "lib/server/supabase/customer-review-repository.ts";
const WIRING = "lib/server/customer-review/customer-review-supabase.ts";
const PAGE = "app/review/[token]/page.tsx";
const FRAME = "app/review/[token]/frame/page.tsx";
const FEEDBACK_CLIENT = "app/review/[token]/customer-review-feedback.tsx";
const ROUTE = "app/api/v2/public/review-feedback/route.ts";
const MIGRATION = "supabase/migrations/20260911041157_0037_customer_review_feedback.sql";

function listSources(dir: string): string[] {
  const absolute = join(ROOT, dir);
  if (!existsSync(absolute)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(absolute)) {
    if (entry === "node_modules" || entry === "__tests__" || entry === ".next") continue;
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) out.push(...listSources(relative(ROOT, path)));
    else if (/\.tsx?$/.test(entry)) out.push(relative(ROOT, path));
  }
  return out;
}
const PRODUCTION = ["app", "lib", "components", "templates"].flatMap(listSources);
const importersOf = (moduleName: string) =>
  PRODUCTION.filter((file) => new RegExp(`from\\s+["'][^"']*/${moduleName}["']`).test(read(file)));

describe("service_role containment (Task 030B)", () => {
  it("the signer and the RPC repository are imported only by the customer-review wiring", () => {
    expect(importersOf("customer-review-media-signer")).toEqual([WIRING]);
    expect(importersOf("customer-review-repository")).toEqual([WIRING]);
  });

  it("the wiring is imported only by the customer REVIEW shell, its invitation frame and the public feedback route", () => {
    expect(importersOf("customer-review-supabase").sort()).toEqual([PAGE, FRAME, ROUTE].sort());
  });

  it("the signer only batch-signs in project-media: no table, RPC, list, upload, move or delete", () => {
    const code = strip(read(SIGNER));
    expect(code).toMatch(/\.storage\s*\.from\(PROJECT_MEDIA_BUCKET\)\s*\.createSignedUrls\(/);
    expect(code).not.toMatch(/\.rpc\(|\.list\(|\.upload\(|\.remove\(|\.move\(|\.copy\(|\.createSignedUploadUrl\(|\.from\(["']/);
    expect(read(SIGNER)).toMatch(/CUSTOMER REVIEW MEDIA SIGNING ONLY/);
  });

  it("the RPC repository calls only the two 0037 RPCs and never touches tables or Storage", () => {
    const code = strip(read(REPOSITORY));
    expect([...code.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)].map((m) => m[1]).sort()).toEqual(["get_customer_review", "submit_review_feedback"]);
    expect(code).not.toMatch(/\.from\(|\.storage\b/);
  });

  it("templates, domain, rendering, staff/admin UI and the browser feedback component never reach customer-review server modules", () => {
    const forbidden = /customer-review-(supabase|repository|media-signer)|load-customer-review|submit-customer-review-feedback|service-role-client/;
    const scoped = PRODUCTION.filter((f) => /^(templates|lib\/domain|lib\/invitation-rendering|lib\/admin|app\/admin)\//.test(f) || f === FEEDBACK_CLIENT);
    for (const file of scoped) {
      expect(read(file), file).not.toMatch(forbidden);
    }
    // The browser component imports server modules for types only.
    expect(read(FEEDBACK_CLIENT)).not.toMatch(/^import (?!type )[^;]*lib\/server/m);
  });

  it("customer review code has no RSVP, guest token, publish or public slug path, and /i/[slug] does not exist", () => {
    const files = [...listSources("lib/server/customer-review"), PAGE, FRAME, FEEDBACK_CLIENT, ROUTE, REPOSITORY, SIGNER];
    const code = files.map((f) => strip(read(f))).join("\n");
    expect(code).not.toMatch(/rsvps|guest_token|publish_invitation|public_slug|published_version_id|payment_status|openGraph/i);
    expect(code).not.toMatch(/RsvpCapabilityV1/);
    expect(existsSync(join(ROOT, "app", "i"))).toBe(false);
  });
});

describe("customer REVIEW viewport isolation + visual-only RSVP (Task 030B)", () => {
  it("the shell renders the invitation only through a same-origin iframe to ./frame, never in its own viewport", () => {
    const shell = strip(read(PAGE));
    expect(shell).toMatch(/<iframe[\s\S]*src=\{frameSrc\}/);
    expect(shell).toMatch(/`\/review\/\$\{encodedToken\}\/frame\?v=\$\{selected\.variant\}&version=/);
    expect(shell).not.toMatch(/InvitationRendererHost|StaffPreviewRenderer|templates\/core/);
  });

  it("the frame renders the persisted REVIEW Snapshot through the UNAVAILABLE-only preview wrapper, with no draft path", () => {
    const frame = strip(read(FRAME));
    expect(frame).toMatch(/loadCustomerReview\(token, createCustomerReviewPageDependencies\(\)\)/);
    expect(frame).toMatch(/<StaffPreviewRenderer rendererKey=\{review\.rendererKey\} viewModel=\{review\.viewModel\} sections=\{review\.sections\} \/>/);
    expect(frame).not.toMatch(/loadStaffDraftSnapshot|buildStaffInvitationPreview|fetch\(|RsvpCapabilityV1|"SUCCESS"/);
    // The reused wrapper is still the approved UNAVAILABLE-only capability.
    const wrapper = strip(read("app/admin/preview-frame/staff-preview-renderer.tsx"));
    expect(wrapper).toMatch(/Object\.freeze\(\{ status: "UNAVAILABLE" \}\)/);
    expect(wrapper).not.toMatch(/"SUCCESS"|fetch\(|supabase|"rsvps"|method:/i);
  });
});

describe("migration 0037 contract", () => {
  const migration = read(MIGRATION);
  const sql = stripSql(migration);
  // Executable SQL only: `--` comments and COMMENT ON documentation strings removed.
  const executable = sql.replace(/COMMENT ON FUNCTION[\s\S]*?';\s*\n/g, "\n");

  it("grants: two customer RPCs to service_role only, create stays authenticated-only, helper private, no table grant", () => {
    const grants = [...sql.matchAll(/GRANT\s+([^;]+);/g)].map((m) => m[1].replace(/\s+/g, " "));
    expect(grants.sort()).toEqual(
      [
        "EXECUTE ON FUNCTION public.create_review_version(uuid, text, uuid, uuid, text, jsonb, uuid[]) TO authenticated",
        "EXECUTE ON FUNCTION public.get_customer_review(uuid, uuid) TO service_role",
        "EXECUTE ON FUNCTION public.submit_review_feedback(uuid, uuid, uuid, text, text) TO service_role",
      ].sort(),
    );
    expect(sql).toMatch(/REVOKE INSERT ON TABLE public\.review_feedback FROM service_role;/);
  });

  it("every SECURITY DEFINER function pins an empty search_path", () => {
    const definers = sql.split(/CREATE (?:OR REPLACE )?FUNCTION/).slice(1);
    expect(definers).toHaveLength(4);
    for (const fn of definers) {
      expect(fn.split("AS $$")[0]).toMatch(/SET search_path = ''/);
    }
  });

  it("never sets payment, READY_TO_PUBLISH or PUBLISHED, and never writes publication state", () => {
    expect(executable).not.toMatch(/payment_status|published_version_id|'READY_TO_PUBLISH'|PUBLISHED'\s*,\s*'invitation|version_type\s*=\s*'PUBLISHED'/);
    expect(executable).not.toMatch(/status\s*=\s*'(PUBLISHED|READY_TO_PUBLISH|PAID|AWAITING_PAYMENT)'/);
    expect(executable).not.toMatch(/UPDATE public\.invitation_versions|DELETE FROM|INSERT INTO public\.invitation_versions[\s\S]*'PUBLISHED'/);
    // Status is only ever written from the recomputed aggregate outcome (review creation + feedback), never a literal.
    expect([...executable.matchAll(/status\s*=\s*'([A-Z_]+)'/g)]).toEqual([]);
    expect([...executable.matchAll(/^\s*status = v_outcome$/gm)]).toHaveLength(2);
    expect(executable.match(/review_outcome_for_project\(p_project_id\)/g)).toHaveLength(2);
  });

  it("the three SQL variant-policy copies equal the TypeScript policy", () => {
    for (const code of SERVICE_PACKAGE_CODES) {
      const list = requiredInvitationVariantsForPackage(code)!.map((v) => `'${v}'`).join(", ");
      expect(executable.split(`WHEN '${code}' THEN ARRAY[${list}]::text[]`).length - 1).toBe(4);
    }
  });

  it("feedback binds to the CURRENT review under lock and the token context is re-validated first", () => {
    const submit = executable.slice(executable.indexOf("CREATE FUNCTION public.submit_review_feedback"));
    const order = ["FROM public.project_access_links", "FOR NO KEY UPDATE", "FROM public.project_invitations", "RV016", "INSERT INTO public.review_feedback"];
    const positions = order.map((needle) => submit.indexOf(needle));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(submit).toMatch(/v_current_id IS DISTINCT FROM p_invitation_version_id/);
    expect(submit).toMatch(/IF p_feedback_type <> 'COMMENT' THEN/);
    // Approval is final: a REVISION_REQUEST after an APPROVAL on the same version is RV018.
    expect(submit).toMatch(/p_feedback_type = 'REVISION_REQUEST' AND EXISTS[\s\S]*?feedback_type = 'APPROVAL'[\s\S]*?RV018/);
  });
});
