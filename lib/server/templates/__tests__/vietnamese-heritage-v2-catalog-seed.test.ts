import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { listTemplateVersionOptions } from "../../../admin/design-assignment";
import type { StaffContext } from "../../auth/staff-context";
import { validateTemplateDesignManifest } from "../../project-design/validate-template-design-manifest";
import { listTemplates } from "../list-templates";
import type { TemplatesGateway } from "../templates-gateway";
import { lookupTemplateEditorManifest } from "../../../../templates/core/production-editor-manifests";
import { VIETNAMESE_HERITAGE_V1_MANIFEST } from "../../../../templates/wedding/vietnamese-heritage/v1/manifest";
import { VIETNAMESE_HERITAGE_V2_MANIFEST } from "../../../../templates/wedding/vietnamese-heritage/v2/manifest";

/**
 * VH-V2-RELEASE-READINESS (RF9/P41): the data-only catalog seed 0050 must
 * register exactly the frozen Vietnamese Heritage v2 identity and design
 * manifest as version 2 of the existing template, and preserve v1.
 */
const MIGRATIONS = join(__dirname, "../../../../supabase/migrations");
const M0048 = "20260911041208_0048_seed_vietnamese_heritage_romantic_minimal_v1_catalog.sql";
const M0050 = "20260911041210_0050_seed_vietnamese_heritage_v2_catalog.sql";
const sql = readFileSync(join(MIGRATIONS, M0050), "utf8");
const code = sql.replace(/--.*$/gm, "");

function jsonLiterals(): unknown[] {
  return [...code.matchAll(/'(\{[\s\S]*?\})'::jsonb/g)].map((match) => JSON.parse(match[1] as string) as unknown);
}

describe("Vietnamese Heritage v2 catalog seed migration 0050", () => {
  it("is the one migration after 0049 and is authored only (never applied by this task)", () => {
    const names = readdirSync(MIGRATIONS).sort();
    // SD-V2-CATALOG-01's 0054 is the new head, then TE-06's 0053,
    // SD-V1-CATALOG-01's 0052 and OWS-V2-CATALOG-01's 0051; 0050 still
    // follows 0049 directly.
    expect(names.at(-1)).toBe("20260911041216_0056_generic_rsvp_response_key.sql");
    expect(names.at(-2)).toBe("20260911041215_0055_rsvp_invitation_source.sql");
    expect(names.at(-4)).toBe("20260911041213_0053_staff_approval_on_behalf.sql");
    expect(names.at(-5)).toBe("20260911041212_0052_seed_se_duyen_v1_catalog.sql");
    expect(names.at(-6)).toBe("20260911041211_0051_seed_our_wedding_story_v2_catalog.sql");
    expect(names.at(-7)).toBe(M0050);
    expect(names.at(-8)).toBe("20260911041209_0049_invitation_public_aliases.sql");
    expect(sql).toContain("AUTHORING ONLY — not applied.");
  });

  it("inserts exactly the frozen v2 identity under the existing vietnamese-heritage template", () => {
    const { identity, compatibility } = VIETNAMESE_HERITAGE_V2_MANIFEST;
    expect(identity).toStrictEqual({ eventType: "WEDDING", templateCode: "vietnamese-heritage", versionNumber: 2, displayName: "Vietnamese Heritage" });
    expect(code).toMatch(
      /INSERT INTO public\.template_versions \(template_id, version_number, renderer_key, manifest\)\nSELECT\n  t\.id,\n  2,\n  'wedding\.vietnamese-heritage\.v2',[^;]*WHERE t\.code = 'vietnamese-heritage'\nON CONFLICT DO NOTHING;/,
    );
    expect(compatibility.rendererKey).toBe("wedding.vietnamese-heritage.v2");
    // Same template code and display name as v1 (0048): one family, two versions.
    expect(identity.templateCode).toBe(VIETNAMESE_HERITAGE_V1_MANIFEST.identity.templateCode);
    expect(identity.displayName).toBe(VIETNAMESE_HERITAGE_V1_MANIFEST.identity.displayName);
    expect(readFileSync(join(MIGRATIONS, M0048), "utf8")).toContain("VALUES ('vietnamese-heritage', 'WEDDING', 'Vietnamese Heritage', true, 1)");
  });

  it("inserts and verifies a manifest exactly equal to the v2 code manifest's design subset (v1's design is unchanged)", () => {
    const literals = jsonLiterals();
    expect(literals).toHaveLength(2);
    for (const literal of literals) {
      expect(literal).toEqual(VIETNAMESE_HERITAGE_V2_MANIFEST.design);
      expect(validateTemplateDesignManifest(literal)).toEqual(VIETNAMESE_HERITAGE_V2_MANIFEST.design);
    }
    expect(VIETNAMESE_HERITAGE_V2_MANIFEST.design).toStrictEqual(VIETNAMESE_HERITAGE_V1_MANIFEST.design);
  });

  it("is data-only and idempotent: one insert with ON CONFLICT DO NOTHING; never inserts, updates or retires the template or v1", () => {
    expect(code).not.toMatch(/\b(CREATE|ALTER|DROP|GRANT|REVOKE|DELETE|UPDATE|TRUNCATE|POLICY|MERGE)\b/i);
    expect(code.match(/INSERT INTO/g)).toHaveLength(1);
    expect(code).not.toMatch(/INSERT INTO public\.templates\b/);
    expect(code.match(/ON CONFLICT DO NOTHING;/g)).toHaveLength(1);
    expect(code).not.toMatch(/retired_at\s*=/);
    expect(code).not.toMatch(/elegant-editorial|romantic-minimal|our-wedding-story|project|invitation_version|guest|rsvp/i);
  });

  it("fails closed on a missing template, any v2 mismatch, or a v1 row not preserved as frozen", () => {
    expect(code).toContain("IF (SELECT count(*) FROM public.templates WHERE code = 'vietnamese-heritage') <> 1 THEN");
    expect(code).toContain("IF v_template.event_type IS DISTINCT FROM 'WEDDING' OR v_template.name IS DISTINCT FROM 'Vietnamese Heritage' THEN");
    expect(code).toContain("SELECT * INTO v_v2 FROM public.template_versions WHERE renderer_key = 'wedding.vietnamese-heritage.v2';");
    expect(code).toContain("IF v_v2.template_id IS DISTINCT FROM v_template.id THEN");
    expect(code).toContain("IF v_v2.version_number IS DISTINCT FROM 2 THEN");
    expect(code).toContain("IF v_v2.manifest IS DISTINCT FROM v_manifest THEN");
    expect(code).toContain("IF v_v2.retired_at IS NOT NULL THEN");
    expect(code).toContain("SELECT * INTO v_v1 FROM public.template_versions WHERE renderer_key = 'wedding.vietnamese-heritage.v1';");
    expect(code).toContain("OR v_v1.manifest IS DISTINCT FROM v_manifest THEN");
    expect(code).toContain("IF v_version_count <> 2 THEN");
    expect(code.match(/RAISE EXCEPTION/g)).toHaveLength(9);
    expect(code.match(/RAISE NOTICE/g)).toHaveLength(1);
  });
});

describe("Staff template selection after 0050 (certification)", () => {
  const CATALOG = [
    {
      id: "tpl-vh",
      code: "vietnamese-heritage",
      eventType: "WEDDING" as const,
      name: "Vietnamese Heritage",
      description: null,
      isActive: true,
      sortOrder: 1,
      previewMediaPath: null,
      versions: [
        { id: "ver-vh-1", versionNumber: 1, rendererKey: "wedding.vietnamese-heritage.v1", manifest: VIETNAMESE_HERITAGE_V1_MANIFEST.design, retiredAt: null },
        { id: "ver-vh-2", versionNumber: 2, rendererKey: "wedding.vietnamese-heritage.v2", manifest: VIETNAMESE_HERITAGE_V2_MANIFEST.design, retiredAt: null },
      ],
    },
  ];
  const gateway = { listTemplatesWithVersions: async () => CATALOG } as unknown as TemplatesGateway<unknown>;
  const staff = { supabase: {} } as unknown as StaffContext<unknown>;

  it("lists v1 and v2 as separate exact versions, both selectable, each with its own registry editor manifest", async () => {
    const [vh] = await listTemplates(staff, gateway, lookupTemplateEditorManifest);
    expect(vh?.versions.map((version) => [version.versionNumber, version.rendererKey, version.selectable])).toStrictEqual([
      [1, "wedding.vietnamese-heritage.v1", true],
      [2, "wedding.vietnamese-heritage.v2", true],
    ]);
    expect(vh?.versions[1]?.editorManifest?.rendererKey).toBe("wedding.vietnamese-heritage.v2");
    // Same four positional media slots for Staff in both versions.
    expect(vh?.versions[1]?.editorManifest?.mediaSlots.map((slot) => slot.key)).toStrictEqual(["heroPhoto", "portraitCluster", "loveStoryPhoto", "gallery"]);
    expect(vh?.versions[1]?.editorManifest?.mediaSlots).toStrictEqual(vh?.versions[0]?.editorManifest?.mediaSlots);
  });

  it("the Design tab offers both versions; a Project already on v1 keeps it (never collapsed to latest)", async () => {
    const catalog = await listTemplates(staff, gateway, lookupTemplateEditorManifest);
    const options = listTemplateVersionOptions(catalog, "WEDDING", "ver-vh-1");
    expect(options.map((option) => option.version.id)).toStrictEqual(["ver-vh-1", "ver-vh-2"]);
  });
});
