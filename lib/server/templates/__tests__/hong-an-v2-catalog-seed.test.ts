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
import { HONG_AN_V2_MANIFEST } from "../../../../templates/wedding/hong-an/v2/manifest";

/**
 * HA-CONTENT-01 (RF9/P41): the data-only catalog seed 0058 must register
 * exactly the frozen Hồng Ân v2 identity and design manifest as version 2 of
 * the existing `hong-an` template, and preserve v1 EXACTLY — including its
 * empty `designSettingsSchema`, which is the whole reason v2 exists.
 *
 * WHY v2 AND NOT AN AMENDED v1: `template_versions.manifest` is frozen at
 * creation by `guard_template_version_immutability()` (migration 0010;
 * docs/PHYSICAL_DATABASE_PLAN.md §2.11 [F10] — `retired_at` is the only
 * column a normal UPDATE may change), and CLAUDE.md §9 requires a new
 * version rather than an edited one. 0057 is already applied in DEV with a
 * Review snapshot and a published invitation on v1.
 */
const MIGRATIONS = join(__dirname, "../../../../supabase/migrations");
const M0057 = "20260911041217_0057_seed_hong_an_v1_catalog.sql";
const M0058 = "20260911041218_0058_seed_hong_an_v2_catalog.sql";
const sql = readFileSync(join(MIGRATIONS, M0058), "utf8");
const code = sql.replace(/--.*$/gm, "");

function jsonLiterals(): unknown[] {
  return [...code.matchAll(/'(\{[\s\S]*?\})'::jsonb/g)].map((match) => JSON.parse(match[1] as string) as unknown);
}

describe("Hồng Ân v2 catalog seed migration 0058", () => {
  it("is the head migration, one number after 0057, and is authored only (never applied by this task)", () => {
    const names = readdirSync(MIGRATIONS).sort();
    expect(names.at(-1)).toBe(M0058);
    expect(names.at(-2)).toBe(M0057);
    expect(names.filter((name) => name.includes("_0058_"))).toStrictEqual([M0058]);
    expect(sql).toContain("AUTHORING ONLY — not applied.");
  });

  it("inserts exactly the frozen v2 identity under the existing hong-an template", () => {
    const { identity, compatibility } = HONG_AN_V2_MANIFEST;
    expect(identity).toStrictEqual({
      eventType: "WEDDING",
      templateCode: "hong-an",
      versionNumber: 2,
      displayName: "Hồng Ân",
    });
    expect(compatibility.rendererKey).toBe("wedding.hong-an.v2");
    expect(code).toMatch(
      /INSERT INTO public\.template_versions \(template_id, version_number, renderer_key, manifest\)\nSELECT\n  t\.id,\n  2,\n  'wedding\.hong-an\.v2',[^;]*WHERE t\.code = 'hong-an'\nON CONFLICT DO NOTHING;/,
    );
    // One family, two versions: same template code and display name as v1.
    expect(identity.templateCode).toBe(HONG_AN_V1_MANIFEST.identity.templateCode);
    expect(identity.displayName).toBe(HONG_AN_V1_MANIFEST.identity.displayName);
  });

  it("inserts and verifies a manifest exactly equal to the v2 code manifest's design subset", () => {
    const literals = jsonLiterals();
    // Two v2 literals (the INSERT and the verification constant) plus the
    // v1 constant the verification block asserts is preserved.
    expect(literals).toHaveLength(3);
    for (const literal of literals.slice(0, 2)) {
      expect(literal).toEqual(HONG_AN_V2_MANIFEST.design);
      expect(validateTemplateDesignManifest(literal)).toEqual(HONG_AN_V2_MANIFEST.design);
    }
    expect(literals[2]).toEqual(HONG_AN_V1_MANIFEST.design);
    // P19 step 6: the seeded section settings schema is exactly the capable sections.
    const capable = Object.entries(HONG_AN_V2_MANIFEST.compatibility.sectionCapabilities)
      .filter(([, value]) => value)
      .map(([key]) => key)
      .sort();
    expect(Object.keys(HONG_AN_V2_MANIFEST.design.sectionSettingsSchema).sort()).toStrictEqual(capable);
  });

  it("differs from v1's design subset in exactly one way: the two optional Scripture settings", () => {
    const { design: v1 } = HONG_AN_V1_MANIFEST;
    const { design: v2 } = HONG_AN_V2_MANIFEST;
    // Nothing else moves: a Project moved from v1 to v2 keeps its design
    // assignment and its media and re-uploads nothing (CLAUDE.md §17).
    expect({ ...v2, designSettingsSchema: {} }).toStrictEqual({ ...v1, designSettingsSchema: {} });
    expect(v1.designSettingsSchema).toStrictEqual({});
    expect(v2.designSettingsSchema).toStrictEqual({
      scriptureVerse: { type: "string" },
      scriptureReference: { type: "string" },
    });
    // Both are OPTIONAL: `designSettingsSchema` is an allow-list, so neither
    // key is required and a Project that configures nothing stays valid.
    expect(validateTemplateDesignManifest(v2)).toEqual(v2);
  });

  it("is data-only and idempotent: one insert with ON CONFLICT DO NOTHING; never inserts, updates or retires the template or v1", () => {
    expect(code).not.toMatch(/\b(CREATE|ALTER|DROP|GRANT|REVOKE|DELETE|UPDATE|TRUNCATE|POLICY|MERGE)\b/i);
    expect(code.match(/INSERT INTO/g)).toHaveLength(1);
    expect(code).not.toMatch(/INSERT INTO public\.templates\b/);
    expect(code.match(/ON CONFLICT DO NOTHING;/g)).toHaveLength(1);
    expect(code).not.toMatch(/retired_at\s*=/);
    expect(code).not.toMatch(/elegant-editorial|romantic-minimal|vietnamese-heritage|our-wedding-story|se-duyen|project|invitation_version|guest|rsvp/i);
  });

  it("never defeats the manifest immutability guard — no trigger is disabled, dropped or bypassed", () => {
    // The whole reason this is a v2 seed and not a v1 amendment. A migration
    // that reached the frozen manifest by turning the guard off would be the
    // silent capability change [F10] and CLAUDE.md §9 forbid.
    expect(code).not.toMatch(/session_replication_role/i);
    expect(code).not.toMatch(/DISABLE\s+TRIGGER|ENABLE\s+TRIGGER/i);
    expect(code).not.toMatch(/guard_template_version_immutability\s*\(/);
    expect(code).not.toMatch(/\bSET\s+(LOCAL\s+)?session/i);
  });

  it("never re-applies 0057 and never touches is_active, which each database owns", () => {
    expect(code).not.toMatch(/\bis_active\b/);
    expect(code).not.toMatch(/VALUES \('hong-an'/);
    expect(code).not.toMatch(/sort_order/);
    // 0057 itself is untouched by this task and still says what it said.
    const seed0057 = readFileSync(join(MIGRATIONS, M0057), "utf8");
    expect(seed0057).toContain("VALUES ('hong-an', 'WEDDING', 'Hồng Ân', false, 5)");
    expect(seed0057).toContain('"designSettingsSchema": {}');
    expect(seed0057).not.toMatch(/scriptureVerse|scriptureReference/);
  });

  it("fails closed on a missing template, any v2 mismatch, or a v1 row not preserved as frozen", () => {
    expect(code).toContain("IF (SELECT count(*) FROM public.templates WHERE code = 'hong-an') <> 1 THEN");
    expect(code).toContain("IF v_template.event_type IS DISTINCT FROM 'WEDDING' OR v_template.name IS DISTINCT FROM 'Hồng Ân' THEN");
    expect(code).toContain("SELECT * INTO v_v2 FROM public.template_versions WHERE renderer_key = 'wedding.hong-an.v2';");
    expect(code).toContain("IF v_v2.template_id IS DISTINCT FROM v_template.id THEN");
    expect(code).toContain("IF v_v2.version_number IS DISTINCT FROM 2 THEN");
    expect(code).toContain("IF v_v2.manifest IS DISTINCT FROM v_manifest_v2 THEN");
    expect(code).toContain("IF v_v2.retired_at IS NOT NULL THEN");
    // v1 is checked against its OWN frozen manifest, not v2's, so an
    // accidentally amended v1 fails the migration closed.
    expect(code).toContain("SELECT * INTO v_v1 FROM public.template_versions WHERE renderer_key = 'wedding.hong-an.v1';");
    expect(code).toContain("OR v_v1.manifest IS DISTINCT FROM v_manifest_v1 THEN");
    expect(code).toContain("IF v_version_count <> 2 THEN");
    expect(code.match(/RAISE EXCEPTION/g)).toHaveLength(9);
    expect(code.match(/RAISE NOTICE/g)).toHaveLength(2);
  });
});

describe("Staff template selection after 0058 (certification)", () => {
  const catalogRows = (isActive: boolean) => [
    {
      id: "tpl-ha",
      code: "hong-an",
      eventType: "WEDDING" as const,
      name: "Hồng Ân",
      description: null,
      isActive,
      sortOrder: 5,
      previewMediaPath: null,
      versions: [
        { id: "ver-ha-1", versionNumber: 1, rendererKey: "wedding.hong-an.v1", manifest: HONG_AN_V1_MANIFEST.design, retiredAt: null },
        { id: "ver-ha-2", versionNumber: 2, rendererKey: "wedding.hong-an.v2", manifest: HONG_AN_V2_MANIFEST.design, retiredAt: null },
      ],
    },
  ];
  const catalogFor = async (isActive: boolean) => {
    const gateway = { listTemplatesWithVersions: async () => catalogRows(isActive) } as unknown as TemplatesGateway<unknown>;
    const staff = { supabase: {} } as unknown as StaffContext<unknown>;
    return listTemplates(staff, gateway, lookupTemplateEditorManifest);
  };

  it("lists v1 and v2 as separate exact versions, each with its own registry editor manifest", async () => {
    const [ha] = await catalogFor(true);
    expect(ha?.versions.map((version) => [version.versionNumber, version.rendererKey, version.selectable])).toStrictEqual([
      [1, "wedding.hong-an.v1", true],
      [2, "wedding.hong-an.v2", true],
    ]);
    expect(ha?.versions[1]?.editorManifest?.rendererKey).toBe("wedding.hong-an.v2");
    expect(ha?.versions[1]?.designManifest).toEqual(HONG_AN_V2_MANIFEST.design);
    // Only v2's design manifest declares the Scripture settings.
    // The validator builds settings schemas with a null prototype, so compare by value.
    expect(ha?.versions[0]?.designManifest.designSettingsSchema).toEqual({});
    expect(Object.keys(ha?.versions[1]?.designManifest.designSettingsSchema ?? {}).sort()).toStrictEqual([
      "scriptureReference",
      "scriptureVerse",
    ]);
  });

  it("the same four positional media slots in both versions, so a Project moved to v2 re-uploads nothing", async () => {
    const [ha] = await catalogFor(true);
    expect(ha?.versions[1]?.editorManifest?.mediaSlots.map((slot) => slot.key)).toStrictEqual([
      "openingPhoto",
      "storyPhoto",
      "gallery",
      "closingPhoto",
    ]);
    const stripHints = (slots: readonly { key: string; hint: string }[] | undefined) =>
      slots?.map((slot) => ({ ...slot, hint: "" }));
    expect(stripHints(ha?.versions[1]?.editorManifest?.mediaSlots)).toStrictEqual(
      stripHints(ha?.versions[0]?.editorManifest?.mediaSlots),
    );
  });

  it("the inactive seed still keeps both versions out of Staff selection", async () => {
    const inactive = await catalogFor(false);
    expect(inactive[0]?.versions.map((version) => version.selectable)).toStrictEqual([false, false]);
    expect(listTemplateVersionOptions(inactive, "WEDDING", null)).toStrictEqual([]);
  });

  it("the Design tab offers both versions; a Project already on v1 keeps it (never collapsed to latest)", async () => {
    const catalog = await catalogFor(true);
    const options = listTemplateVersionOptions(catalog, "WEDDING", "ver-ha-1");
    expect(options.map((option) => option.version.id)).toStrictEqual(["ver-ha-1", "ver-ha-2"]);
  });
});
