import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateTemplateDesignManifest } from "../../project-design/validate-template-design-manifest";
import { OUR_WEDDING_STORY_V1_MANIFEST } from "../../../../templates/wedding/our-wedding-story/v1/manifest";

/** OWS-04 (RF9/P41): the data-only catalog seed 0047 must equal the frozen OWS v1 code identity and design manifest. */
const sql = readFileSync(
  join(__dirname, "../../../../supabase/migrations/20260911041207_0047_seed_our_wedding_story_v1_catalog.sql"),
  "utf8",
);
const code = sql.replace(/--.*$/gm, "");

describe("Our Wedding Story v1 catalog seed migration 0047", () => {
  const { identity, compatibility, design } = OUR_WEDDING_STORY_V1_MANIFEST;

  it("seeds the frozen identity, renderer key and catalog settings (active, sort order 3)", () => {
    expect(code).toContain(
      `VALUES ('${identity.templateCode}', '${identity.eventType}', '${identity.displayName}', true, 3)`,
    );
    expect(code).toContain(`  ${identity.versionNumber},\n  '${compatibility.rendererKey}',`);
    expect(code).toContain(`WHERE t.code = '${identity.templateCode}'`);
  });

  it("seeds and verifies a manifest exactly equal to the code manifest's design subset", () => {
    const manifests = [...code.matchAll(/'(\{[\s\S]*?\})'::jsonb/g)].map((match) => match[1] as string);
    expect(manifests).toHaveLength(2);
    for (const raw of manifests) {
      const seeded: unknown = JSON.parse(raw);
      expect(seeded).toEqual(design);
      expect(validateTemplateDesignManifest(seeded)).toEqual(design);
    }
    expect(manifests[1]).toBe(manifests[0]);
    expect(code).toMatch(/v_expected_manifest constant jsonb := '\{/);
    expect(code).toContain("IF v_version.manifest IS DISTINCT FROM v_expected_manifest THEN");
  });

  it("fails closed on every identity, manifest or retirement conflict", () => {
    expect(code).toContain(`WHERE code = '${identity.templateCode}'`);
    expect(code).toContain("IF v_template_count <> 1 THEN");
    expect(code).toContain(`IF v_template.event_type IS DISTINCT FROM '${identity.eventType}' THEN`);
    expect(code).toContain(`IF v_template.name IS DISTINCT FROM '${identity.displayName}' THEN`);
    expect(code).toContain(`WHERE renderer_key = '${compatibility.rendererKey}'`);
    expect(code).toContain("IF NOT FOUND THEN");
    expect(code).toContain("IF v_version.template_id IS DISTINCT FROM v_template.id THEN");
    expect(code).toContain(`IF v_version.version_number IS DISTINCT FROM ${identity.versionNumber} THEN`);
    expect(code).toContain("IF v_version.retired_at IS NOT NULL THEN");
    expect(code.match(/RAISE EXCEPTION/g)).toHaveLength(8);
  });

  it("is data-only and idempotent: two inserts with ON CONFLICT DO NOTHING, no update, delete or schema change", () => {
    expect(code).not.toMatch(/\b(CREATE|ALTER|DROP|GRANT|REVOKE|DELETE|UPDATE|TRUNCATE|POLICY|MERGE)\b/i);
    expect(code.match(/INSERT INTO/g)).toHaveLength(2);
    expect(code.match(/ON CONFLICT (\(code\) )?DO NOTHING;/g)).toHaveLength(2);
  });

  it("touches only the Our Wedding Story catalog rows", () => {
    expect(code).not.toMatch(/elegant-editorial|vietnamese-heritage|romantic-minimal|project|invitation_version|guest|rsvp/i);
  });
});
