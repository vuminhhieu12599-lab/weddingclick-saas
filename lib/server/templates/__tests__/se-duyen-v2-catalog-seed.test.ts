import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { listTemplateVersionOptions } from "../../../admin/design-assignment";
import type { StaffContext } from "../../auth/staff-context";
import { validateTemplateDesignManifest } from "../../project-design/validate-template-design-manifest";
import { listTemplates } from "../list-templates";
import type { TemplatesGateway } from "../templates-gateway";
import { lookupTemplateEditorManifest } from "../../../../templates/core/production-editor-manifests";
import { SE_DUYEN_V1_MANIFEST } from "../../../../templates/wedding/se-duyen/v1/manifest";
import { SE_DUYEN_V2_MANIFEST } from "../../../../templates/wedding/se-duyen/v2/manifest";

/**
 * SD-V2-CATALOG-01 (RF9/P41): the data-only catalog seed 0054 must register
 * exactly the frozen Se Duyên v2 identity and design manifest as version 2
 * of the existing `se-duyen` template, and preserve v1 — which, unlike every
 * earlier v2 seed, is APPLIED and ACTIVE in Production and carries a
 * published invitation. So 0054 must also never re-apply 0052 and never
 * touch `is_active`.
 */
const MIGRATIONS = join(__dirname, "../../../../supabase/migrations");
const M0052 = "20260911041212_0052_seed_se_duyen_v1_catalog.sql";
const M0054 = "20260911041214_0054_seed_se_duyen_v2_catalog.sql";
const sql = readFileSync(join(MIGRATIONS, M0054), "utf8");
const code = sql.replace(/--.*$/gm, "");

function jsonLiterals(): unknown[] {
  return [...code.matchAll(/'(\{[\s\S]*?\})'::jsonb/g)].map((match) => JSON.parse(match[1] as string) as unknown);
}

describe("Se Duyên v2 catalog seed migration 0054", () => {
  it("is the head migration and is authored only (never applied by this task)", () => {
    const names = readdirSync(MIGRATIONS).sort();
    expect(names.at(-1)).toBe(M0054);
    expect(names.at(-2)).toBe("20260911041213_0053_staff_approval_on_behalf.sql");
    expect(sql).toContain("AUTHORING ONLY — not applied.");
    // One 0054 and no reuse of a retired number.
    expect(names.filter((name) => /_0054_/.test(name))).toStrictEqual([M0054]);
  });

  it("inserts exactly the frozen v2 identity under the existing se-duyen template", () => {
    const { identity, compatibility } = SE_DUYEN_V2_MANIFEST;
    expect(identity).toStrictEqual({
      eventType: "WEDDING",
      templateCode: "se-duyen",
      versionNumber: 2,
      displayName: "Se Duyên",
    });
    expect(code).toMatch(
      /INSERT INTO public\.template_versions \(template_id, version_number, renderer_key, manifest\)\nSELECT\n  t\.id,\n  2,\n  'wedding\.se-duyen\.v2',[^;]*WHERE t\.code = 'se-duyen'\nON CONFLICT DO NOTHING;/,
    );
    expect(compatibility.rendererKey).toBe("wedding.se-duyen.v2");
    // Same template code and display name as v1 (0052): one family, two versions.
    expect(identity.templateCode).toBe(SE_DUYEN_V1_MANIFEST.identity.templateCode);
    expect(identity.displayName).toBe(SE_DUYEN_V1_MANIFEST.identity.displayName);
  });

  it("inserts and verifies a manifest exactly equal to the v2 code manifest's design subset (v1's design is unchanged)", () => {
    const literals = jsonLiterals();
    expect(literals).toHaveLength(2);
    for (const literal of literals) {
      expect(literal).toEqual(SE_DUYEN_V2_MANIFEST.design);
      expect(validateTemplateDesignManifest(literal)).toEqual(SE_DUYEN_V2_MANIFEST.design);
    }
    // v2 is presentation only, so the design subset is byte-for-byte v1's.
    expect(SE_DUYEN_V2_MANIFEST.design).toStrictEqual(SE_DUYEN_V1_MANIFEST.design);
  });

  it("is data-only and idempotent: one insert with ON CONFLICT DO NOTHING; never inserts, updates or retires the template or v1", () => {
    expect(code).not.toMatch(/\b(CREATE|ALTER|DROP|GRANT|REVOKE|DELETE|UPDATE|TRUNCATE|POLICY|MERGE)\b/i);
    expect(code.match(/INSERT INTO/g)).toHaveLength(1);
    expect(code).not.toMatch(/INSERT INTO public\.templates\b/);
    expect(code.match(/ON CONFLICT DO NOTHING;/g)).toHaveLength(1);
    expect(code).not.toMatch(/retired_at\s*=/);
    expect(code).not.toMatch(/elegant-editorial|romantic-minimal|vietnamese-heritage|our-wedding-story|project|invitation_version|guest|rsvp/i);
  });

  it("never re-applies 0052 and never touches is_active, which Production owns", () => {
    // 0052 created the template row as `is_active = false`; the Product Owner
    // has since activated it in Production. 0054 must neither set nor assert
    // that column — asserting either value would fail a legitimate database.
    expect(code).not.toMatch(/\bis_active\b/);
    expect(code).not.toMatch(/VALUES \('se-duyen'/);
    expect(code).not.toMatch(/sort_order/);
    // 0052 itself is untouched by this task and still says what it said.
    const seed0052 = readFileSync(join(MIGRATIONS, M0052), "utf8");
    expect(seed0052).toContain("AUTHORING ONLY — not applied.");
    expect(seed0052).toContain("VALUES ('se-duyen', 'WEDDING', 'Se Duyên', false, 4)");
  });

  it("fails closed on a missing template, any v2 mismatch, or a v1 row not preserved as frozen", () => {
    expect(code).toContain("IF (SELECT count(*) FROM public.templates WHERE code = 'se-duyen') <> 1 THEN");
    expect(code).toContain("IF v_template.event_type IS DISTINCT FROM 'WEDDING' OR v_template.name IS DISTINCT FROM 'Se Duyên' THEN");
    expect(code).toContain("SELECT * INTO v_v2 FROM public.template_versions WHERE renderer_key = 'wedding.se-duyen.v2';");
    expect(code).toContain("IF v_v2.template_id IS DISTINCT FROM v_template.id THEN");
    expect(code).toContain("IF v_v2.version_number IS DISTINCT FROM 2 THEN");
    expect(code).toContain("IF v_v2.manifest IS DISTINCT FROM v_manifest THEN");
    expect(code).toContain("IF v_v2.retired_at IS NOT NULL THEN");
    expect(code).toContain("SELECT * INTO v_v1 FROM public.template_versions WHERE renderer_key = 'wedding.se-duyen.v1';");
    expect(code).toContain("OR v_v1.manifest IS DISTINCT FROM v_manifest THEN");
    expect(code).toContain("IF v_version_count <> 2 THEN");
    expect(code.match(/RAISE EXCEPTION/g)).toHaveLength(9);
    expect(code.match(/RAISE NOTICE/g)).toHaveLength(1);
  });
});

describe("Staff template selection after 0054 (certification)", () => {
  const CATALOG = [
    {
      id: "tpl-sd",
      code: "se-duyen",
      eventType: "WEDDING" as const,
      name: "Se Duyên",
      description: null,
      // Production state as the Product Owner reported it: applied and active.
      isActive: true,
      sortOrder: 4,
      previewMediaPath: null,
      versions: [
        { id: "ver-sd-1", versionNumber: 1, rendererKey: "wedding.se-duyen.v1", manifest: SE_DUYEN_V1_MANIFEST.design, retiredAt: null },
        { id: "ver-sd-2", versionNumber: 2, rendererKey: "wedding.se-duyen.v2", manifest: SE_DUYEN_V2_MANIFEST.design, retiredAt: null },
      ],
    },
  ];
  const gateway = { listTemplatesWithVersions: async () => CATALOG } as unknown as TemplatesGateway<unknown>;
  const staff = { supabase: {} } as unknown as StaffContext<unknown>;

  it("lists v1 and v2 as separate exact versions, both selectable, each with its own registry editor manifest", async () => {
    const [sd] = await listTemplates(staff, gateway, lookupTemplateEditorManifest);
    expect(sd?.versions.map((version) => [version.versionNumber, version.rendererKey, version.selectable])).toStrictEqual([
      [1, "wedding.se-duyen.v1", true],
      [2, "wedding.se-duyen.v2", true],
    ]);
    expect(sd?.versions[1]?.editorManifest?.rendererKey).toBe("wedding.se-duyen.v2");
    // The same five positional media slots for Staff in both versions, so a
    // Project moved to v2 re-uploads nothing (CLAUDE.md §17).
    expect(sd?.versions[1]?.editorManifest?.mediaSlots.map((slot) => slot.key)).toStrictEqual([
      "openingPhoto",
      "portraitLead",
      "portraitAside",
      "gallery",
      "closingPhoto",
    ]);
    const stripHints = (slots: readonly { key: string; hint: string }[] | undefined) =>
      slots?.map((slot) => ({ ...slot, hint: "" }));
    expect(stripHints(sd?.versions[1]?.editorManifest?.mediaSlots)).toStrictEqual(
      stripHints(sd?.versions[0]?.editorManifest?.mediaSlots),
    );
  });

  it("the Design tab offers both versions; the Project already published on v1 keeps it (never collapsed to latest)", async () => {
    const catalog = await listTemplates(staff, gateway, lookupTemplateEditorManifest);
    const options = listTemplateVersionOptions(catalog, "WEDDING", "ver-sd-1");
    expect(options.map((option) => option.version.id)).toStrictEqual(["ver-sd-1", "ver-sd-2"]);
  });
});
