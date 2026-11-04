import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { listTemplateVersionOptions } from "../../../admin/design-assignment";
import type { StaffContext } from "../../auth/staff-context";
import { validateTemplateDesignManifest } from "../../project-design/validate-template-design-manifest";
import { listTemplates } from "../list-templates";
import type { TemplatesGateway } from "../templates-gateway";
import { lookupTemplateEditorManifest } from "../../../../templates/core/production-editor-manifests";
import { HONG_AN_V1_MANIFEST } from "../../../../templates/wedding/hong-an/v1/manifest";

/**
 * HA-INTEGRATION-01 (RF9/P41): the data-only catalog seed 0057 must register
 * exactly the frozen Hồng Ân v1 identity and design manifest as a NEW
 * template family and — like Se Duyên's 0052 — register it INACTIVE, because
 * offering it to Staff is a separate Product Owner decision.
 */
const MIGRATIONS = join(__dirname, "../../../../supabase/migrations");
const M0056 = "20260911041216_0056_generic_rsvp_response_key.sql";
const M0057 = "20260911041217_0057_seed_hong_an_v1_catalog.sql";
const sql = readFileSync(join(MIGRATIONS, M0057), "utf8");
const code = sql.replace(/--.*$/gm, "");

function jsonLiterals(): unknown[] {
  return [...code.matchAll(/'(\{[\s\S]*?\})'::jsonb/g)].map((match) => JSON.parse(match[1] as string) as unknown);
}

describe("Hồng Ân v1 catalog seed migration 0057", () => {
  it("is the one migration after 0056 and is authored only (never applied by this task)", () => {
    const names = readdirSync(MIGRATIONS).sort();
    // HA-CONTENT-01: 0058 (the Hồng Ân v2 catalog seed) is now the head; 0057
    // keeps its own position directly after 0056 and is otherwise untouched.
    expect(names.at(-1)).toBe("20260911041218_0058_seed_hong_an_v2_catalog.sql");
    expect(names.at(-2)).toBe(M0057);
    expect(names.at(-3)).toBe(M0056);
    expect(names.filter((name) => name.includes("_0057_"))).toStrictEqual([M0057]);
    expect(sql).toContain("AUTHORING ONLY — not applied.");
  });

  it("registers the frozen identity as a new template, deliberately INACTIVE, at the next free sort order", () => {
    const { identity } = HONG_AN_V1_MANIFEST;
    expect(identity).toStrictEqual({ eventType: "WEDDING", templateCode: "hong-an", versionNumber: 1, displayName: "Hồng Ân" });
    expect(code).toContain(
      `VALUES ('${identity.templateCode}', '${identity.eventType}', '${identity.displayName}', false, 5)\nON CONFLICT (code) DO NOTHING;`,
    );
    // The inactive flag is the point of this seed, not a typo: it must never
    // be seeded `true`, and the activation UPDATE must stay out of the SQL.
    expect(code).not.toMatch(/'hong-an'[^)]*,\s*true\s*,/);
    expect(code).not.toMatch(/\bSET\s+is_active\b/);
    // Sort order 5 follows Se Duyên 4 (0052); no other seed claims it.
    expect(readFileSync(join(MIGRATIONS, "20260911041212_0052_seed_se_duyen_v1_catalog.sql"), "utf8")).toContain(
      "VALUES ('se-duyen', 'WEDDING', 'Se Duyên', false, 4)",
    );
    const otherSeeds = readdirSync(MIGRATIONS).filter((name) => name !== M0057).map((name) => readFileSync(join(MIGRATIONS, name), "utf8"));
    for (const other of otherSeeds) expect(other).not.toMatch(/INSERT INTO public\.templates[^;]*, 5\)/);
  });

  it("inserts version 1 bound to this template under the frozen renderer key", () => {
    const { identity, compatibility } = HONG_AN_V1_MANIFEST;
    expect(compatibility.rendererKey).toBe("wedding.hong-an.v1");
    expect(code).toMatch(
      /INSERT INTO public\.template_versions \(template_id, version_number, renderer_key, manifest\)\nSELECT\n  t\.id,\n  1,\n  'wedding\.hong-an\.v1',[^;]*WHERE t\.code = 'hong-an'\nON CONFLICT DO NOTHING;/,
    );
    expect(identity.versionNumber).toBe(1);
  });

  it("inserts and verifies a manifest exactly equal to the code manifest's design subset", () => {
    const literals = jsonLiterals();
    expect(literals).toHaveLength(2);
    for (const literal of literals) {
      expect(literal).toEqual(HONG_AN_V1_MANIFEST.design);
      expect(validateTemplateDesignManifest(literal)).toEqual(HONG_AN_V1_MANIFEST.design);
    }
    // P19 step 6: the seeded section settings schema is exactly the capable sections.
    const capable = Object.entries(HONG_AN_V1_MANIFEST.compatibility.sectionCapabilities)
      .filter(([, value]) => value)
      .map(([key]) => key)
      .sort();
    expect(Object.keys(HONG_AN_V1_MANIFEST.design.sectionSettingsSchema).sort()).toStrictEqual(capable);
  });

  it("is data-only and idempotent: two inserts with ON CONFLICT DO NOTHING, no update, delete or schema change", () => {
    expect(code).not.toMatch(/\b(CREATE|ALTER|DROP|GRANT|REVOKE|DELETE|UPDATE|TRUNCATE|POLICY|MERGE)\b/i);
    expect(code.match(/INSERT INTO/g)).toHaveLength(2);
    expect(code.match(/ON CONFLICT (\(code\) )?DO NOTHING;/g)).toHaveLength(2);
    expect(code).not.toMatch(/retired_at\s*=/);
  });

  it("touches only the Hồng Ân catalog rows", () => {
    expect(code).not.toMatch(/elegant-editorial|romantic-minimal|vietnamese-heritage|our-wedding-story|se-duyen|project|invitation_version|guest|rsvp/i);
  });

  it("fails closed on a missing row or any disagreement with the frozen identity and manifest", () => {
    expect(code).toContain("SELECT * INTO v_template FROM public.templates WHERE code = 'hong-an';");
    expect(code).toContain("IF v_template.event_type IS DISTINCT FROM 'WEDDING' OR v_template.name IS DISTINCT FROM 'Hồng Ân' THEN");
    expect(code).toContain("SELECT * INTO v_v1 FROM public.template_versions WHERE renderer_key = 'wedding.hong-an.v1';");
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

describe("Staff template selection after 0057 (certification)", () => {
  const entry = (isActive: boolean) => ({
    id: "tpl-ha",
    code: "hong-an",
    eventType: "WEDDING" as const,
    name: "Hồng Ân",
    description: null,
    isActive,
    sortOrder: 5,
    previewMediaPath: null,
    versions: [
      {
        id: "ver-ha-1",
        versionNumber: 1,
        rendererKey: "wedding.hong-an.v1",
        manifest: HONG_AN_V1_MANIFEST.design,
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
    const [ha] = await catalogFor(false);
    expect(ha?.versions.map((version) => [version.versionNumber, version.rendererKey])).toStrictEqual([[1, "wedding.hong-an.v1"]]);
    expect(ha?.versions[0]?.editorManifest?.rendererKey).toBe("wedding.hong-an.v1");
    expect(ha?.versions[0]?.designManifest).toEqual(HONG_AN_V1_MANIFEST.design);
    // The Staff editor gets the frozen four slots and the invitation-message item.
    expect(ha?.versions[0]?.editorManifest?.mediaSlots.map((slot) => slot.key)).toStrictEqual([
      "openingPhoto",
      "storyPhoto",
      "gallery",
      "closingPhoto",
    ]);
    expect(ha?.versions[0]?.editorManifest?.contentItems.some((item) => item.key === "INVITATION_MESSAGE")).toBe(true);
  });

  it("the inactive seed is what keeps it out of Staff selection — code registration alone does not offer it", async () => {
    const inactive = await catalogFor(false);
    expect(inactive[0]?.versions[0]?.selectable).toBe(false);
    expect(listTemplateVersionOptions(inactive, "WEDDING", null)).toStrictEqual([]);
    // The one-line Product Owner activation is all that stands between the
    // seeded row and a selectable template: nothing else is missing.
    const active = await catalogFor(true);
    expect(active[0]?.versions[0]?.selectable).toBe(true);
    expect(listTemplateVersionOptions(active, "WEDDING", null).map((option) => option.version.id)).toStrictEqual(["ver-ha-1"]);
  });
});
