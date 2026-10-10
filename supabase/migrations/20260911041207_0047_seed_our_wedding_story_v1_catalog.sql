-- WeddingClick V2 — Data-only Migration 0047 (OWS-04)
-- Seed the Our Wedding Story v1 template catalog rows.
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL against DEV or Production. Application happens
-- only after review, by the Product Owner (docs/DECISIONS.md "OWS-04").
--
-- Source of truth: docs/DECISIONS.md RF9 (catalog seeding is a reproducible
-- data-only migration, never one-off ADMIN insertion), RF-06-0 P14/P16/P41
-- (seeded rows equal the frozen code identity and design manifest exactly)
-- and "OWS-01". The `manifest` below is exactly
-- OUR_WEDDING_STORY_V1_MANIFEST.design from
-- templates/wedding/our-wedding-story/v1/manifest.ts (the Task 028
-- TemplateDesignManifestV1 subset); a focused test keeps the two equal.
--
-- Not a schema migration: no table, column, constraint, index, grant or
-- policy changes. Inserts happen as the migration-running role (`postgres`,
-- BYPASSRLS — see migration 0002's header note).
--
-- Idempotent: ON CONFLICT DO NOTHING on templates.code and on
-- template_versions' unique keys (renderer_key, (template_id,
-- version_number)), so re-running never duplicates rows, and a row that
-- already exists (for example the DEV catalog row created during OWS-02) is
-- never updated. template_versions rows are immutable after INSERT
-- (guard_template_version_immutability). The verification block then fails
-- the whole migration closed if any existing or inserted row disagrees with
-- the frozen identity or manifest, instead of silently accepting it.
-- `is_active` and `sort_order` are operational catalog settings, seeded as
-- true / 3 for a new row; on a pre-existing row they are reported, not
-- changed.

INSERT INTO public.templates (code, event_type, name, is_active, sort_order)
VALUES ('our-wedding-story', 'WEDDING', 'Our Wedding Story', true, 3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.template_versions (template_id, version_number, renderer_key, manifest)
SELECT
  t.id,
  1,
  'wedding.our-wedding-story.v1',
  '{
    "schemaVersion": 1,
    "palettes": ["warm-champagne"],
    "fontPresets": ["champagne-editorial"],
    "effectPresets": ["STANDARD"],
    "sectionSettingsSchema": {
      "loveStory": { "type": "boolean" },
      "gallery": { "type": "boolean" },
      "music": { "type": "boolean" },
      "gift": { "type": "boolean" }
    },
    "designSettingsSchema": {}
  }'::jsonb
FROM public.templates t
WHERE t.code = 'our-wedding-story'
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_expected_manifest constant jsonb := '{
    "schemaVersion": 1,
    "palettes": ["warm-champagne"],
    "fontPresets": ["champagne-editorial"],
    "effectPresets": ["STANDARD"],
    "sectionSettingsSchema": {
      "loveStory": { "type": "boolean" },
      "gallery": { "type": "boolean" },
      "music": { "type": "boolean" },
      "gift": { "type": "boolean" }
    },
    "designSettingsSchema": {}
  }'::jsonb;
  v_template_count integer;
  v_template public.templates%ROWTYPE;
  v_version public.template_versions%ROWTYPE;
BEGIN
  SELECT count(*) INTO v_template_count FROM public.templates WHERE code = 'our-wedding-story';
  IF v_template_count <> 1 THEN
    RAISE EXCEPTION 'Our Wedding Story v1 catalog: expected exactly one template row';
  END IF;
  SELECT * INTO v_template FROM public.templates WHERE code = 'our-wedding-story';
  IF v_template.event_type IS DISTINCT FROM 'WEDDING' THEN
    RAISE EXCEPTION 'Our Wedding Story v1 catalog: template event_type does not match the frozen identity';
  END IF;
  IF v_template.name IS DISTINCT FROM 'Our Wedding Story' THEN
    RAISE EXCEPTION 'Our Wedding Story v1 catalog: template name does not match the frozen identity';
  END IF;

  SELECT * INTO v_version FROM public.template_versions WHERE renderer_key = 'wedding.our-wedding-story.v1';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Our Wedding Story v1 catalog: template version row is missing';
  END IF;
  IF v_version.template_id IS DISTINCT FROM v_template.id THEN
    RAISE EXCEPTION 'Our Wedding Story v1 catalog: renderer key belongs to another template';
  END IF;
  IF v_version.version_number IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Our Wedding Story v1 catalog: version_number does not match the frozen identity';
  END IF;
  IF v_version.manifest IS DISTINCT FROM v_expected_manifest THEN
    RAISE EXCEPTION 'Our Wedding Story v1 catalog: manifest does not match the frozen design manifest';
  END IF;
  IF v_version.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'Our Wedding Story v1 catalog: template version is retired';
  END IF;

  IF v_template.is_active IS DISTINCT FROM true OR v_template.sort_order IS DISTINCT FROM 3 THEN
    RAISE NOTICE 'Our Wedding Story v1 catalog: pre-existing template row kept as is (is_active=%, sort_order=%)',
      v_template.is_active, v_template.sort_order;
  END IF;
END;
$$;
