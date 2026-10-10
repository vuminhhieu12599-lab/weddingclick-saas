import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateTemplateDesignManifest } from "../../project-design/validate-template-design-manifest";
import { ROMANTIC_MINIMAL_V1_MANIFEST } from "../../../../templates/wedding/romantic-minimal/v1/manifest";
import { VIETNAMESE_HERITAGE_V1_MANIFEST } from "../../../../templates/wedding/vietnamese-heritage/v1/manifest";

/** DB-CONSISTENCY-01 (RF9/P41): the data-only catalog seed 0048 must equal the frozen VH v1 and RM v1 code identities and design manifests. */
const MIGRATIONS = join(__dirname, "../../../../supabase/migrations");
const M0048 = "20260911041208_0048_seed_vietnamese_heritage_romantic_minimal_v1_catalog.sql";
const code = readFileSync(join(MIGRATIONS, M0048), "utf8").replace(/--.*$/gm, "");

const SEEDS = [
  { manifest: VIETNAMESE_HERITAGE_V1_MANIFEST, sortOrder: 1 },
  { manifest: ROMANTIC_MINIMAL_V1_MANIFEST, sortOrder: 2 },
] as const;

interface ExpectedEntry {
  code: string;
  name: string;
  sortOrder: number;
  rendererKey: string;
  manifest: unknown;
}

function insertedManifests(): unknown[] {
  return [...code.matchAll(/'(\{[\s\S]*?\})'::jsonb/g)].map((match) => JSON.parse(match[1] as string) as unknown);
}

function verifiedEntries(): ExpectedEntry[] {
  const match = /v_expected constant jsonb := '(\[[\s\S]*?\])'::jsonb;/.exec(code);
  expect(match).not.toBeNull();
  return JSON.parse((match as RegExpExecArray)[1] as string) as ExpectedEntry[];
}

describe("Vietnamese Heritage v1 + Romantic Minimal v1 catalog seed migration 0048", () => {
  it("seeds each frozen identity, renderer key and catalog settings (active, sort order 1 / 2)", () => {
    for (const { manifest, sortOrder } of SEEDS) {
      const { identity, compatibility } = manifest;
      expect(code).toContain(
        `VALUES ('${identity.templateCode}', '${identity.eventType}', '${identity.displayName}', true, ${sortOrder})\nON CONFLICT (code) DO NOTHING;`,
      );
      expect(code).toContain(
        `  ${identity.versionNumber},\n  '${compatibility.rendererKey}',`,
      );
      expect(code).toContain(`WHERE t.code = '${identity.templateCode}'`);
    }
  });

  it("binds each version insert to its own template (renderer key and manifest under the matching WHERE)", () => {
    for (const { manifest } of SEEDS) {
      const { identity, compatibility } = manifest;
      const block = new RegExp(
        `INSERT INTO public\\.template_versions[^;]*'${compatibility.rendererKey.replace(/\./g, "\\.")}'[^;]*WHERE t\\.code = '${identity.templateCode}'\\s*ON CONFLICT DO NOTHING;`,
      );
      expect(code).toMatch(block);
    }
  });

  it("inserts manifests exactly equal to each code manifest's design subset", () => {
    const seeded = insertedManifests();
    expect(seeded).toHaveLength(2);
    SEEDS.forEach(({ manifest }, index) => {
      expect(seeded[index]).toEqual(manifest.design);
      expect(validateTemplateDesignManifest(seeded[index])).toEqual(manifest.design);
    });
  });

  it("verifies exactly the frozen identity, order and manifest of both templates", () => {
    const entries = verifiedEntries();
    expect(entries).toEqual(
      SEEDS.map(({ manifest, sortOrder }) => ({
        code: manifest.identity.templateCode,
        name: manifest.identity.displayName,
        sortOrder,
        rendererKey: manifest.compatibility.rendererKey,
        manifest: manifest.design,
      })),
    );
    for (const { manifest } of SEEDS) {
      expect(manifest.identity.eventType).toBe("WEDDING");
      expect(manifest.identity.versionNumber).toBe(1);
    }
  });

  it("fails closed on every identity, manifest or retirement conflict, and never on catalog settings", () => {
    expect(code).toContain("FOR v_entry IN SELECT value FROM jsonb_array_elements(v_expected) LOOP");
    expect(code).toContain("SELECT count(*) INTO v_template_count FROM public.templates WHERE code = v_code;");
    expect(code).toContain("IF v_template_count <> 1 THEN");
    expect(code).toContain("IF v_template.event_type IS DISTINCT FROM 'WEDDING' THEN");
    expect(code).toContain("IF v_template.name IS DISTINCT FROM v_entry ->> 'name' THEN");
    expect(code).toContain("WHERE renderer_key = v_entry ->> 'rendererKey';");
    expect(code).toContain("IF NOT FOUND THEN");
    expect(code).toContain("IF v_version.template_id IS DISTINCT FROM v_template.id THEN");
    expect(code).toContain("IF v_version.version_number IS DISTINCT FROM 1 THEN");
    expect(code).toContain("IF v_version.manifest IS DISTINCT FROM v_entry -> 'manifest' THEN");
    expect(code).toContain("IF v_version.retired_at IS NOT NULL THEN");
    expect(code.match(/RAISE EXCEPTION/g)).toHaveLength(8);
    expect(code.match(/RAISE NOTICE/g)).toHaveLength(1);
  });

  it("is data-only and idempotent: four inserts with ON CONFLICT DO NOTHING, no update, delete or schema change", () => {
    expect(code).not.toMatch(/\b(CREATE|ALTER|DROP|GRANT|REVOKE|DELETE|UPDATE|TRUNCATE|POLICY|MERGE)\b/i);
    expect(code.match(/INSERT INTO/g)).toHaveLength(4);
    expect(code.match(/ON CONFLICT (\(code\) )?DO NOTHING;/g)).toHaveLength(4);
  });

  it("touches only the Vietnamese Heritage and Romantic Minimal catalog rows", () => {
    expect(code).not.toMatch(/elegant-editorial|our-wedding-story|project|invitation_version|guest|rsvp/i);
  });

  it("completes the released catalog on replay: EE 0 (0033 default), VH 1, RM 2 (0048), OWS 3 (0047)", () => {
    const names = readdirSync(MIGRATIONS).sort();
    const ee = readFileSync(join(MIGRATIONS, "20260911041153_0033_seed_elegant_editorial_v1_catalog.sql"), "utf8");
    const ows = readFileSync(join(MIGRATIONS, "20260911041207_0047_seed_our_wedding_story_v1_catalog.sql"), "utf8");
    expect(ee).toContain("VALUES ('elegant-editorial', 'WEDDING', 'Elegant Editorial')");
    expect(ows).toContain("VALUES ('our-wedding-story', 'WEDDING', 'Our Wedding Story', true, 3)");
    expect(names.indexOf(M0048)).toBeGreaterThan(names.indexOf("20260911041207_0047_seed_our_wedding_story_v1_catalog.sql"));
  });
});
