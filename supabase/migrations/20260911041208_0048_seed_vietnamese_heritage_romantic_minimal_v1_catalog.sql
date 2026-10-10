-- WeddingClick V2 — Data-only Migration 0048 (DB-CONSISTENCY-01)
-- Make the Vietnamese Heritage v1 and Romantic Minimal v1 template catalog
-- rows reproducible from repository migrations.
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL against DEV or Production. Application happens
-- only after review, by the Product Owner (docs/DECISIONS.md
-- "DB-CONSISTENCY-01").
--
-- Why: both catalog rows already exist on DEV and Production, created
-- outside repository migrations (catalog drift reported at OWS-04), so a
-- database rebuilt from migrations lacked them. After this migration a clean
-- replay yields all four released WEDDING templates in catalog order:
-- elegant-editorial (0033, sort_order 0), vietnamese-heritage (1),
-- romantic-minimal (2), our-wedding-story (0047, 3).
--
-- Source of truth: docs/DECISIONS.md RF9 (catalog seeding is a reproducible
-- data-only migration, never one-off ADMIN insertion) and RF-06-0
-- P14/P16/P41 (seeded rows equal the frozen code identity and design
-- manifest exactly). Each `manifest` below is exactly the `.design` subset
-- of VIETNAMESE_HERITAGE_V1_MANIFEST
-- (templates/wedding/vietnamese-heritage/v1/manifest.ts) and
-- ROMANTIC_MINIMAL_V1_MANIFEST
-- (templates/wedding/romantic-minimal/v1/manifest.ts); a focused test keeps
-- them equal.
--
-- Not a schema migration: no table, column, constraint, index, grant or
-- policy changes. Inserts happen as the migration-running role (`postgres`,
-- BYPASSRLS — see migration 0002's header note).
--
-- Idempotent: ON CONFLICT DO NOTHING on templates.code and on
-- template_versions' unique keys (renderer_key, (template_id,
-- version_number)), so re-running never duplicates rows, and the existing
-- DEV/Production rows are never updated. template_versions rows are
-- immutable after INSERT (guard_template_version_immutability). The
-- verification block then fails the whole migration closed if any existing
-- or inserted row disagrees with the frozen identity or manifest, instead of
-- silently accepting it. `is_active` and `sort_order` are operational
-- catalog settings, seeded as true / 1 and true / 2 for a new row; on a
-- pre-existing row they are reported, not changed.

-- ---------------------------------------------------------------------
-- Vietnamese Heritage v1
-- ---------------------------------------------------------------------
INSERT INTO public.templates (code, event_type, name, is_active, sort_order)
VALUES ('vietnamese-heritage', 'WEDDING', 'Vietnamese Heritage', true, 1)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.template_versions (template_id, version_number, renderer_key, manifest)
SELECT
  t.id,
  1,
  'wedding.vietnamese-heritage.v1',
  '{
    "schemaVersion": 1,
    "palettes": ["heritage-vermilion"],
    "fontPresets": ["heritage-classic"],
    "effectPresets": ["STANDARD"],
    "sectionSettingsSchema": {
      "loveStory": { "type": "boolean" },
      "gallery": { "type": "boolean" },
      "music": { "type": "boolean" },
      "gift": { "type": "boolean" },
      "timeline": { "type": "boolean" },
      "dressCode": { "type": "boolean" }
    },
    "designSettingsSchema": {}
  }'::jsonb
FROM public.templates t
WHERE t.code = 'vietnamese-heritage'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Romantic Minimal v1
-- ---------------------------------------------------------------------
INSERT INTO public.templates (code, event_type, name, is_active, sort_order)
VALUES ('romantic-minimal', 'WEDDING', 'Romantic Minimal', true, 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.template_versions (template_id, version_number, renderer_key, manifest)
SELECT
  t.id,
  1,
  'wedding.romantic-minimal.v1',
  '{
    "schemaVersion": 1,
    "palettes": ["romantic-blush"],
    "fontPresets": ["romantic-classic"],
    "effectPresets": ["STANDARD"],
    "sectionSettingsSchema": {
      "loveStory": { "type": "boolean" },
      "gallery": { "type": "boolean" },
      "music": { "type": "boolean" },
      "gift": { "type": "boolean" },
      "timeline": { "type": "boolean" }
    },
    "designSettingsSchema": {}
  }'::jsonb
FROM public.templates t
WHERE t.code = 'romantic-minimal'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Fail-closed verification of both catalog entries
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_expected constant jsonb := '[
    {
      "code": "vietnamese-heritage",
      "name": "Vietnamese Heritage",
      "sortOrder": 1,
      "rendererKey": "wedding.vietnamese-heritage.v1",
      "manifest": {
        "schemaVersion": 1,
        "palettes": ["heritage-vermilion"],
        "fontPresets": ["heritage-classic"],
        "effectPresets": ["STANDARD"],
        "sectionSettingsSchema": {
          "loveStory": { "type": "boolean" },
          "gallery": { "type": "boolean" },
          "music": { "type": "boolean" },
          "gift": { "type": "boolean" },
          "timeline": { "type": "boolean" },
          "dressCode": { "type": "boolean" }
        },
        "designSettingsSchema": {}
      }
    },
    {
      "code": "romantic-minimal",
      "name": "Romantic Minimal",
      "sortOrder": 2,
      "rendererKey": "wedding.romantic-minimal.v1",
      "manifest": {
        "schemaVersion": 1,
        "palettes": ["romantic-blush"],
        "fontPresets": ["romantic-classic"],
        "effectPresets": ["STANDARD"],
        "sectionSettingsSchema": {
          "loveStory": { "type": "boolean" },
          "gallery": { "type": "boolean" },
          "music": { "type": "boolean" },
          "gift": { "type": "boolean" },
          "timeline": { "type": "boolean" }
        },
        "designSettingsSchema": {}
      }
    }
  ]'::jsonb;
  v_entry jsonb;
  v_code text;
  v_template_count integer;
  v_template public.templates%ROWTYPE;
  v_version public.template_versions%ROWTYPE;
BEGIN
  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_expected) LOOP
    v_code := v_entry ->> 'code';

    SELECT count(*) INTO v_template_count FROM public.templates WHERE code = v_code;
    IF v_template_count <> 1 THEN
      RAISE EXCEPTION '% v1 catalog: expected exactly one template row', v_code;
    END IF;
    SELECT * INTO v_template FROM public.templates WHERE code = v_code;
    IF v_template.event_type IS DISTINCT FROM 'WEDDING' THEN
      RAISE EXCEPTION '% v1 catalog: template event_type does not match the frozen identity', v_code;
    END IF;
    IF v_template.name IS DISTINCT FROM v_entry ->> 'name' THEN
      RAISE EXCEPTION '% v1 catalog: template name does not match the frozen identity', v_code;
    END IF;

    SELECT * INTO v_version FROM public.template_versions WHERE renderer_key = v_entry ->> 'rendererKey';
    IF NOT FOUND THEN
      RAISE EXCEPTION '% v1 catalog: template version row is missing', v_code;
    END IF;
    IF v_version.template_id IS DISTINCT FROM v_template.id THEN
      RAISE EXCEPTION '% v1 catalog: renderer key belongs to another template', v_code;
    END IF;
    IF v_version.version_number IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION '% v1 catalog: version_number does not match the frozen identity', v_code;
    END IF;
    IF v_version.manifest IS DISTINCT FROM v_entry -> 'manifest' THEN
      RAISE EXCEPTION '% v1 catalog: manifest does not match the frozen design manifest', v_code;
    END IF;
    IF v_version.retired_at IS NOT NULL THEN
      RAISE EXCEPTION '% v1 catalog: template version is retired', v_code;
    END IF;

    IF v_template.is_active IS DISTINCT FROM true
      OR v_template.sort_order IS DISTINCT FROM (v_entry ->> 'sortOrder')::integer THEN
      RAISE NOTICE '% v1 catalog: pre-existing template row kept as is (is_active=%, sort_order=%)',
        v_code, v_template.is_active, v_template.sort_order;
    END IF;
  END LOOP;
END;
$$;
