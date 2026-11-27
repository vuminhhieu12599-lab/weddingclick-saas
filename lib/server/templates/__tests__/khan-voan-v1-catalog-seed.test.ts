import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateTemplateDesignManifest } from "../../project-design/validate-template-design-manifest";
import { KHAN_VOAN_V1_MANIFEST } from "../../../../templates/wedding/khan-voan/v1/manifest";

const MIGRATIONS = join(__dirname, "../../../../supabase/migrations");
const M0059 = "20260911041219_0059_seed_khan_voan_v1_catalog.sql";
const sql = readFileSync(join(MIGRATIONS, M0059), "utf8");
const code = sql.replace(/--.*$/gm, "");

function jsonLiterals(): unknown[] {
  return [...code.matchAll(/'(\{[\s\S]*?\})'::jsonb/g)].map((match) => JSON.parse(match[1] as string) as unknown);
}

describe("Khăn Voan v1 catalog seed migration 0059", () => {
  it("is the head migration", () => {
    expect(readdirSync(MIGRATIONS).sort().at(-1)).toBe(M0059);
  });

  it("seeds the code identity: template code, display name and renderer key", () => {
    const { identity, compatibility } = KHAN_VOAN_V1_MANIFEST;
    expect(code).toContain(`('${identity.templateCode}', 'WEDDING', '${identity.displayName}', true, 6)`);
    expect(code).toContain(`'${compatibility.rendererKey}'`);
  });

  it("inserts and verifies a manifest exactly equal to the code manifest's design subset", () => {
    const literals = jsonLiterals();
    expect(literals).toHaveLength(2);
    for (const literal of literals) {
      expect(literal).toEqual(KHAN_VOAN_V1_MANIFEST.design);
      expect(validateTemplateDesignManifest(literal)).toEqual(KHAN_VOAN_V1_MANIFEST.design);
    }
    const capable = Object.entries(KHAN_VOAN_V1_MANIFEST.compatibility.sectionCapabilities)
      .filter(([, value]) => value)
      .map(([key]) => key)
      .sort();
    expect(Object.keys(KHAN_VOAN_V1_MANIFEST.design.sectionSettingsSchema).sort()).toStrictEqual(capable);
  });

  it("is data only and idempotent", () => {
    expect(/\b(CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|DELETE)\b/i.test(code)).toBe(false);
    expect(code.match(/ON CONFLICT (\(code\) )?DO NOTHING;/g)).toHaveLength(2);
  });
});
