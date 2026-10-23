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

/**
 * SD-V1-CATALOG-01 (RF9/P41): the data-only catalog seed 0052 must register
 * exactly the frozen Se Duyên v1 identity and design manifest as a NEW
 * template family, and — unlike every earlier seed — register it INACTIVE,
 * because activation is a separate Product Owner decision (the
 * `red-thread.webp` rights confirmation and the one-genuine-photo publishing
 * rule are still open).
 */
const MIGRATIONS = join(__dirname, "../../../../supabase/migrations");
const M0051 = "20260911041211_0051_seed_our_wedding_story_v2_catalog.sql";
const M0052 = "20260911041212_0052_seed_se_duyen_v1_catalog.sql";
const sql = readFileSync(join(MIGRATIONS, M0052), "utf8");
const code = sql.replace(/--.*$/gm, "");

function jsonLiterals(): unknown[] {
  return [...code.matchAll(/'(\{[\s\S]*?\})'::jsonb/g)].map((match) => JSON.parse(match[1] as string) as unknown);
}

describe("Se Duyên v1 catalog seed migration 0052", () => {
  it("is the one migration after 0051 and is authored only (never applied by this task)", () => {
    const names = readdirSync(MIGRATIONS).sort();
    expect(names.at(-1)).toBe(M0052);
    expect(names.at(-2)).toBe(M0051);
    expect(sql).toContain("AUTHORING ONLY — not applied.");
  });

  it("registers the frozen identity as a new template, deliberately INACTIVE, at the next free sort order", () => {
    const { identity } = SE_DUYEN_V1_MANIFEST;
    expect(identity).toStrictEqual({ eventType: "WEDDING", templateCode: "se-duyen", versionNumber: 1, displayName: "Se Duyên" });
    expect(code).toContain(
      `VALUES ('${identity.templateCode}', '${identity.eventType}', '${identity.displayName}', false, 4)\nON CONFLICT (code) DO NOTHING;`,
    );
    // The inactive flag is the point of this seed, not a typo: it must never
    // be seeded `true`, and the activation UPDATE must stay out of the SQL.
    expect(code).not.toMatch(/'se-duyen'[^)]*,\s*true\s*,/);
    expect(code).not.toMatch(/\bSET\s+is_active\b/);
    // Sort order 4 follows VH 1 / RM 2 (0048) and OWS 3 (0047); EE keeps the 0033 default.
    expect(readFileSync(join(MIGRATIONS, "20260911041207_0047_seed_our_wedding_story_v1_catalog.sql"), "utf8")).toContain(
      "VALUES ('our-wedding-story', 'WEDDING', 'Our Wedding Story', true, 3)",
    );
  });

  it("inserts version 1 bound to this template under the frozen renderer key", () => {
    const { identity, compatibility } = SE_DUYEN_V1_MANIFEST;
    expect(compatibility.rendererKey).toBe("wedding.se-duyen.v1");
    expect(code).toMatch(
      /INSERT INTO public\.template_versions \(template_id, version_number, renderer_key, manifest\)\nSELECT\n  t\.id,\n  1,\n  'wedding\.se-duyen\.v1',[^;]*WHERE t\.code = 'se-duyen'\nON CONFLICT DO NOTHING;/,
    );
    expect(identity.versionNumber).toBe(1);
  });

  it("inserts and verifies a manifest exactly equal to the code manifest's design subset", () => {
    const literals = jsonLiterals();
    expect(literals).toHaveLength(2);
    for (const literal of literals) {
      expect(literal).toEqual(SE_DUYEN_V1_MANIFEST.design);
      expect(validateTemplateDesignManifest(literal)).toEqual(SE_DUYEN_V1_MANIFEST.design);
    }
    // P19 step 6: the seeded section settings schema is exactly the capable sections.
    const capable = Object.entries(SE_DUYEN_V1_MANIFEST.compatibility.sectionCapabilities)
      .filter(([, value]) => value)
      .map(([key]) => key)
      .sort();
    expect(Object.keys(SE_DUYEN_V1_MANIFEST.design.sectionSettingsSchema).sort()).toStrictEqual(capable);
  });

  it("is data-only and idempotent: two inserts with ON CONFLICT DO NOTHING, no update, delete or schema change", () => {
    expect(code).not.toMatch(/\b(CREATE|ALTER|DROP|GRANT|REVOKE|DELETE|UPDATE|TRUNCATE|POLICY|MERGE)\b/i);
    expect(code.match(/INSERT INTO/g)).toHaveLength(2);
    expect(code.match(/ON CONFLICT (\(code\) )?DO NOTHING;/g)).toHaveLength(2);
    expect(code).not.toMatch(/retired_at\s*=/);
  });

  it("touches only the Se Duyên catalog rows", () => {
    expect(code).not.toMatch(/elegant-editorial|romantic-minimal|vietnamese-heritage|our-wedding-story|project|invitation_version|guest|rsvp/i);
  });

  it("fails closed on a missing row or any disagreement with the frozen identity and manifest", () => {
    expect(code).toContain("SELECT * INTO v_template FROM public.templates WHERE code = 'se-duyen';");
    expect(code).toContain("IF v_template.event_type IS DISTINCT FROM 'WEDDING' OR v_template.name IS DISTINCT FROM 'Se Duyên' THEN");
    expect(code).toContain("SELECT * INTO v_v1 FROM public.template_versions WHERE renderer_key = 'wedding.se-duyen.v1';");
    expect(code).toContain("IF v_v1.template_id IS DISTINCT FROM v_template.id THEN");
    expect(code).toContain("IF v_v1.version_number IS DISTINCT FROM 1 THEN");
    expect(code).toContain("IF v_v1.manifest IS DISTINCT FROM v_manifest THEN");
    expect(code).toContain("IF v_v1.retired_at IS NOT NULL THEN");
    expect(code).toContain("IF v_version_count <> 1 THEN");
    expect(code.match(/RAISE EXCEPTION/g)).toHaveLength(8);
    // Says plainly in the database whether the template is offered; never fails on it.
    expect(code.match(/RAISE NOTICE/g)).toHaveLength(2);
  });
});

describe("Staff template selection after 0052 (certification)", () => {
  const entry = (isActive: boolean) => ({
    id: "tpl-sd",
    code: "se-duyen",
    eventType: "WEDDING" as const,
    name: "Se Duyên",
    description: null,
    isActive,
    sortOrder: 4,
    previewMediaPath: null,
    versions: [
      {
        id: "ver-sd-1",
        versionNumber: 1,
        rendererKey: "wedding.se-duyen.v1",
        manifest: SE_DUYEN_V1_MANIFEST.design,
        retiredAt: null,
      },
    ],
  });
  const catalogFor = async (isActive: boolean) => {
    const gateway = { listTemplatesWithVersions: async () => [entry(isActive)] } as unknown as TemplatesGateway<unknown>;
    const staff = { supabase: {} } as unknown as StaffContext<unknown>;
    return listTemplates(staff, gateway, lookupTemplateEditorManifest);
  };

  it("the renderer is registered, so the version lists with its own registry editor manifest", async () => {
    const [sd] = await catalogFor(false);
    expect(sd?.versions.map((version) => [version.versionNumber, version.rendererKey])).toStrictEqual([[1, "wedding.se-duyen.v1"]]);
    expect(sd?.versions[0]?.editorManifest?.rendererKey).toBe("wedding.se-duyen.v1");
    expect(sd?.versions[0]?.designManifest).toEqual(SE_DUYEN_V1_MANIFEST.design);
  });

  it("the inactive seed is what keeps it out of Staff selection — code registration alone does not offer it", async () => {
    const inactive = await catalogFor(false);
    expect(inactive[0]?.versions[0]?.selectable).toBe(false);
    expect(listTemplateVersionOptions(inactive, "WEDDING", null)).toStrictEqual([]);
    // The one-line Product Owner activation is all that stands between the
    // seeded row and a selectable template: nothing else is missing.
    const active = await catalogFor(true);
    expect(active[0]?.versions[0]?.selectable).toBe(true);
    expect(listTemplateVersionOptions(active, "WEDDING", null).map((option) => option.version.id)).toStrictEqual(["ver-sd-1"]);
  });
});
