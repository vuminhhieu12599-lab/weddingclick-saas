import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateTemplateDesignManifest } from "../../project-design/validate-template-design-manifest";
import { ELEGANT_EDITORIAL_V1_MANIFEST } from "../../../../templates/wedding/elegant-editorial/v1/manifest";

/** RF9/P41: the data-only catalog seed must equal the frozen P14/P16 code manifest exactly. */
const sql = readFileSync(
  join(__dirname, "../../../../supabase/migrations/20260911041153_0033_seed_elegant_editorial_v1_catalog.sql"),
  "utf8",
);

describe("Elegant Editorial v1 catalog seed migration", () => {
  it("seeds the frozen identity and renderer key", () => {
    const { identity, compatibility } = ELEGANT_EDITORIAL_V1_MANIFEST;
    expect(sql).toContain(`VALUES ('${identity.templateCode}', '${identity.eventType}', '${identity.displayName}')`);
    expect(sql).toContain(`  ${identity.versionNumber},\n  '${compatibility.rendererKey}',`);
  });

  it("seeds a manifest equal to the code manifest's design subset", () => {
    const match = /'(\{[\s\S]*?\})'::jsonb/.exec(sql);
    expect(match).not.toBeNull();
    const seeded: unknown = JSON.parse(match![1]);
    expect(seeded).toEqual(ELEGANT_EDITORIAL_V1_MANIFEST.design);
    expect(validateTemplateDesignManifest(seeded)).toEqual(ELEGANT_EDITORIAL_V1_MANIFEST.design);
  });

  it("is data-only and idempotent", () => {
    expect(sql).not.toMatch(/\b(CREATE|ALTER|DROP|GRANT|REVOKE|DELETE|UPDATE|TRUNCATE)\b/);
    expect(sql.match(/INSERT INTO/g)).toHaveLength(2);
    expect(sql.match(/ON CONFLICT (\(code\) )?DO NOTHING;/g)).toHaveLength(2);
  });
});

/** 0034: read-only verification closing 0033's unchecked-manifest gap (0033 itself is applied and unchanged). */
const verifySql = readFileSync(
  join(__dirname, "../../../../supabase/migrations/20260911041154_0034_verify_elegant_editorial_v1_catalog.sql"),
  "utf8",
);

describe("Elegant Editorial v1 catalog verification migration", () => {
  it("verifies the manifest by exact jsonb equality against the frozen design manifest", () => {
    const match = /v_expected_manifest constant jsonb := '(\{[\s\S]*?\})'::jsonb;/.exec(verifySql);
    expect(match).not.toBeNull();
    expect(JSON.parse(match![1])).toEqual(ELEGANT_EDITORIAL_V1_MANIFEST.design);
    expect(match![1]).toBe(/'(\{[\s\S]*?\})'::jsonb/.exec(sql)![1]);
    expect(verifySql).toContain("IF v_version.manifest IS DISTINCT FROM v_expected_manifest THEN");
  });

  it("checks every frozen identity value and raises on each mismatch", () => {
    const { identity, compatibility } = ELEGANT_EDITORIAL_V1_MANIFEST;
    expect(verifySql).toContain(`WHERE code = '${identity.templateCode}'`);
    expect(verifySql).toContain("IF v_template_count <> 1 THEN");
    expect(verifySql).toContain(`IF v_template.event_type IS DISTINCT FROM '${identity.eventType}' THEN`);
    expect(verifySql).toContain(`IF v_template.name IS DISTINCT FROM '${identity.displayName}' THEN`);
    expect(verifySql).toContain(`WHERE renderer_key = '${compatibility.rendererKey}'`);
    expect(verifySql).toContain("IF NOT FOUND THEN");
    expect(verifySql).toContain("IF v_version.template_id IS DISTINCT FROM v_template.id THEN");
    expect(verifySql).toContain(`IF v_version.version_number IS DISTINCT FROM ${identity.versionNumber} THEN`);
    expect(verifySql.match(/RAISE EXCEPTION/g)).toHaveLength(7);
  });

  it("performs no data, schema, grant or policy change", () => {
    const code = verifySql.replace(/--.*$/gm, "");
    expect(code).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|UPSERT|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|POLICY|ON CONFLICT)\b/i,
    );
    expect(code).toMatch(/^DO \$\$/m);
  });
});
