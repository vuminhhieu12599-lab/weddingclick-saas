-- WeddingClick V2 — Data-only Migration 0033
-- Seed the Elegant Editorial v1 template catalog rows.
--
-- Source of truth: docs/DECISIONS.md RF9 (catalog seeding is a reproducible
-- data-only migration, never one-off ADMIN insertion), RF-06-0 P14 (frozen
-- identity), P16 (frozen manifest values) and P41 (seeded rows must equal
-- P14/P16 exactly). The `manifest` below is exactly
-- ELEGANT_EDITORIAL_V1_MANIFEST.design from
-- templates/wedding/elegant-editorial/v1/manifest.ts (the Task 028
-- TemplateDesignManifestV1 subset); a focused test keeps the two equal.
--
-- Not a schema migration: no table, column, constraint, index, grant or
-- policy changes. Inserts happen as the migration-running role (`postgres`,
-- BYPASSRLS — see migration 0002's header note).
--
-- Idempotent: ON CONFLICT DO NOTHING on templates.code and on
-- template_versions' unique keys (renderer_key, (template_id,
-- version_number)), so re-running never duplicates rows. The final check
-- fails the migration if a pre-existing row disagrees with the frozen
-- values instead of silently accepting it. template_versions rows are
-- immutable after INSERT (guard_template_version_immutability), so this
-- migration never updates an existing version.

INSERT INTO public.templates (code, event_type, name)
VALUES ('elegant-editorial', 'WEDDING', 'Elegant Editorial')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.template_versions (template_id, version_number, renderer_key, manifest)
SELECT
  t.id,
  1,
  'wedding.elegant-editorial.v1',
  '{
    "schemaVersion": 1,
    "palettes": ["green-ivory"],
    "fontPresets": ["editorial-classic"],
    "effectPresets": ["STANDARD"],
    "sectionSettingsSchema": {
      "loveStory": { "type": "boolean" },
      "gallery": { "type": "boolean" },
      "music": { "type": "boolean" },
      "gift": { "type": "boolean" },
      "timeline": { "type": "boolean" },
      "dressCode": { "type": "boolean" },
      "photoStory": { "type": "boolean" }
    },
    "designSettingsSchema": {}
  }'::jsonb
FROM public.templates t
WHERE t.code = 'elegant-editorial'
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.templates t
    JOIN public.template_versions v ON v.template_id = t.id
    WHERE t.code = 'elegant-editorial'
      AND t.event_type = 'WEDDING'
      AND t.name = 'Elegant Editorial'
      AND v.version_number = 1
      AND v.renderer_key = 'wedding.elegant-editorial.v1'
  ) THEN
    RAISE EXCEPTION 'Elegant Editorial v1 catalog rows do not match the frozen P14/P16 identity';
  END IF;
END;
$$;
