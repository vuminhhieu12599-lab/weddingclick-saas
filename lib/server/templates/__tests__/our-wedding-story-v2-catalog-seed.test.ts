import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { listTemplateVersionOptions } from "../../../admin/design-assignment";
import type { StaffContext } from "../../auth/staff-context";
import { validateTemplateDesignManifest } from "../../project-design/validate-template-design-manifest";
import { listTemplates } from "../list-templates";
import type { TemplatesGateway } from "../templates-gateway";
import { lookupTemplateEditorManifest } from "../../../../templates/core/production-editor-manifests";
import { OUR_WEDDING_STORY_V1_MANIFEST } from "../../../../templates/wedding/our-wedding-story/v1/manifest";
import { OUR_WEDDING_STORY_V2_MANIFEST } from "../../../../templates/wedding/our-wedding-story/v2/manifest";

/**
 * OWS-V2-CATALOG-01 (RF9/P41): the data-only catalog seed 0051 must register
 * exactly the frozen Our Wedding Story v2 identity and design manifest as
 * version 2 of the existing template, and preserve v1.
 */
const MIGRATIONS = join(__dirname, "../../../../supabase/migrations");
const M0047 = "20260911041207_0047_seed_our_wedding_story_v1_catalog.sql";
const M0051 = "20260911041211_0051_seed_our_wedding_story_v2_catalog.sql";
const sql = readFileSync(join(MIGRATIONS, M0051), "utf8");
const code = sql.replace(/--.*$/gm, "");

function jsonLiterals(): unknown[] {
  return [...code.matchAll(/'(\{[\s\S]*?\})'::jsonb/g)].map((match) => JSON.parse(match[1] as string) as unknown);
}

describe("Our Wedding Story v2 catalog seed migration 0051", () => {
  it("is the one migration after 0050 and is authored only (never applied by this task)", () => {
    const names = readdirSync(MIGRATIONS).sort();
    // SD-V2-CATALOG-01's 0054 is the new head, then TE-06's 0053 and 0052
    // (the Se Duyên v1 catalog seed); 0051 still follows 0050 directly.
    expect(names.at(-1)).toBe("20260911041214_0054_seed_se_duyen_v2_catalog.sql");
    expect(names.at(-2)).toBe("20260911041213_0053_staff_approval_on_behalf.sql");
    expect(names.at(-3)).toBe("20260911041212_0052_seed_se_duyen_v1_catalog.sql");
    expect(names.at(-4)).toBe(M0051);
    expect(names.at(-5)).toBe("20260911041210_0050_seed_vietnamese_heritage_v2_catalog.sql");
    expect(sql).toContain("AUTHORING ONLY — not applied.");
  });

  it("inserts exactly the frozen v2 identity under the existing our-wedding-story template", () => {
    const { identity, compatibility } = OUR_WEDDING_STORY_V2_MANIFEST;
    expect(identity).toStrictEqual({ eventType: "WEDDING", templateCode: "our-wedding-story", versionNumber: 2, displayName: "Our Wedding Story" });
    expect(code).toMatch(
      /INSERT INTO public\.template_versions \(template_id, version_number, renderer_key, manifest\)\nSELECT\n  t\.id,\n  2,\n  'wedding\.our-wedding-story\.v2',[^;]*WHERE t\.code = 'our-wedding-story'\nON CONFLICT DO NOTHING;/,
    );
    expect(compatibility.rendererKey).toBe("wedding.our-wedding-story.v2");
    // Same template code and display name as v1 (0047): one family, two versions.
    expect(identity.templateCode).toBe(OUR_WEDDING_STORY_V1_MANIFEST.identity.templateCode);
    expect(identity.displayName).toBe(OUR_WEDDING_STORY_V1_MANIFEST.identity.displayName);
    expect(readFileSync(join(MIGRATIONS, M0047), "utf8")).toContain("VALUES ('our-wedding-story', 'WEDDING', 'Our Wedding Story', true, 3)");
  });

  it("inserts and verifies a manifest exactly equal to the v2 code manifest's design subset (v1's design is unchanged)", () => {
    const literals = jsonLiterals();
    expect(literals).toHaveLength(2);
    for (const literal of literals) {
      expect(literal).toEqual(OUR_WEDDING_STORY_V2_MANIFEST.design);
      expect(validateTemplateDesignManifest(literal)).toEqual(OUR_WEDDING_STORY_V2_MANIFEST.design);
    }
    expect(OUR_WEDDING_STORY_V2_MANIFEST.design).toStrictEqual(OUR_WEDDING_STORY_V1_MANIFEST.design);
  });

  it("is data-only and idempotent: one insert with ON CONFLICT DO NOTHING; never inserts, updates or retires the template or v1", () => {
    expect(code).not.toMatch(/\b(CREATE|ALTER|DROP|GRANT|REVOKE|DELETE|UPDATE|TRUNCATE|POLICY|MERGE)\b/i);
    expect(code.match(/INSERT INTO/g)).toHaveLength(1);
    expect(code).not.toMatch(/INSERT INTO public\.templates\b/);
    expect(code.match(/ON CONFLICT DO NOTHING;/g)).toHaveLength(1);
    expect(code).not.toMatch(/retired_at\s*=/);
    expect(code).not.toMatch(/elegant-editorial|romantic-minimal|vietnamese-heritage|project|invitation_version|guest|rsvp/i);
  });

  it("fails closed on a missing template, any v2 mismatch, or a v1 row not preserved as frozen", () => {
    expect(code).toContain("IF (SELECT count(*) FROM public.templates WHERE code = 'our-wedding-story') <> 1 THEN");
    expect(code).toContain("IF v_template.event_type IS DISTINCT FROM 'WEDDING' OR v_template.name IS DISTINCT FROM 'Our Wedding Story' THEN");
    expect(code).toContain("SELECT * INTO v_v2 FROM public.template_versions WHERE renderer_key = 'wedding.our-wedding-story.v2';");
    expect(code).toContain("IF v_v2.template_id IS DISTINCT FROM v_template.id THEN");
    expect(code).toContain("IF v_v2.version_number IS DISTINCT FROM 2 THEN");
    expect(code).toContain("IF v_v2.manifest IS DISTINCT FROM v_manifest THEN");
    expect(code).toContain("IF v_v2.retired_at IS NOT NULL THEN");
    expect(code).toContain("SELECT * INTO v_v1 FROM public.template_versions WHERE renderer_key = 'wedding.our-wedding-story.v1';");
    expect(code).toContain("OR v_v1.manifest IS DISTINCT FROM v_manifest THEN");
    expect(code).toContain("IF v_version_count <> 2 THEN");
    expect(code.match(/RAISE EXCEPTION/g)).toHaveLength(9);
    expect(code.match(/RAISE NOTICE/g)).toHaveLength(1);
  });
});

describe("Staff template selection after 0051 (certification)", () => {
  const CATALOG = [
    {
      id: "tpl-ows",
      code: "our-wedding-story",
      eventType: "WEDDING" as const,
      name: "Our Wedding Story",
      description: null,
      isActive: true,
      sortOrder: 3,
      previewMediaPath: null,
      versions: [
        { id: "ver-ows-1", versionNumber: 1, rendererKey: "wedding.our-wedding-story.v1", manifest: OUR_WEDDING_STORY_V1_MANIFEST.design, retiredAt: null },
        { id: "ver-ows-2", versionNumber: 2, rendererKey: "wedding.our-wedding-story.v2", manifest: OUR_WEDDING_STORY_V2_MANIFEST.design, retiredAt: null },
      ],
    },
  ];
  const gateway = { listTemplatesWithVersions: async () => CATALOG } as unknown as TemplatesGateway<unknown>;
  const staff = { supabase: {} } as unknown as StaffContext<unknown>;

  it("lists v1 and v2 as separate exact versions, both selectable, each with its own registry editor manifest", async () => {
    const [ows] = await listTemplates(staff, gateway, lookupTemplateEditorManifest);
    expect(ows?.versions.map((version) => [version.versionNumber, version.rendererKey, version.selectable])).toStrictEqual([
      [1, "wedding.our-wedding-story.v1", true],
      [2, "wedding.our-wedding-story.v2", true],
    ]);
    expect(ows?.versions[1]?.editorManifest?.rendererKey).toBe("wedding.our-wedding-story.v2");
    // Same six positional media slots for Staff in both versions.
    expect(ows?.versions[1]?.editorManifest?.mediaSlots.map((slot) => slot.key)).toStrictEqual([
      "coverPhoto",
      "groomPortrait",
      "bridePortrait",
      "storyPhoto",
      "gallery",
      "thankYouPhoto",
    ]);
    expect(ows?.versions[1]?.editorManifest?.mediaSlots).toStrictEqual(ows?.versions[0]?.editorManifest?.mediaSlots);
  });

  it("the Design tab offers both versions; a Project already on v1 keeps it (never collapsed to latest)", async () => {
    const catalog = await listTemplates(staff, gateway, lookupTemplateEditorManifest);
    const options = listTemplateVersionOptions(catalog, "WEDDING", "ver-ows-1");
    expect(options.map((option) => option.version.id)).toStrictEqual(["ver-ows-1", "ver-ows-2"]);
  });
});
