-- WeddingClick V2 — Data-only Migration 0059
-- Register Khăn Voan v1 (`wedding.khan-voan.v1`) in the template catalog.
--
-- Data only: one `templates` row (code `khan-voan`) and its version 1. No
-- table, column, constraint, index, grant, policy or trigger changes; nothing
-- existing is updated or removed. Seeded ACTIVE (Product Owner, 2026-11-27):
-- the template is approved for sale, so Staff can pick it as soon as this
-- runs.
--
-- `manifest` is exactly the `.design` subset of KHAN_VOAN_V1_MANIFEST
-- (templates/wedding/khan-voan/v1/manifest.ts); a focused test keeps them equal.
--
-- Idempotent: ON CONFLICT DO NOTHING on every unique key, then a fail-closed
-- check that the rows match the code identity exactly.

INSERT INTO public.templates (code, event_type, name, is_active, sort_order)
VALUES ('khan-voan', 'WEDDING', 'Khăn Voan', true, 6)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.template_versions (template_id, version_number, renderer_key, manifest)
SELECT
  t.id,
  1,
  'wedding.khan-voan.v1',
  '{
    "schemaVersion": 1,
    "palettes": ["ivory-satin"],
    "fontPresets": ["khan-voan-classic"],
    "effectPresets": ["STANDARD"],
    "sectionSettingsSchema": {
      "invitationMessage": { "type": "boolean" },
      "loveStory": { "type": "boolean" },
      "gallery": { "type": "boolean" },
      "music": { "type": "boolean" },
      "gift": { "type": "boolean" }
    },
    "designSettingsSchema": {}
  }'::jsonb
FROM public.templates t
WHERE t.code = 'khan-voan'
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_manifest constant jsonb := '{
    "schemaVersion": 1,
    "palettes": ["ivory-satin"],
    "fontPresets": ["khan-voan-classic"],
    "effectPresets": ["STANDARD"],
    "sectionSettingsSchema": {
      "invitationMessage": { "type": "boolean" },
      "loveStory": { "type": "boolean" },
      "gallery": { "type": "boolean" },
      "music": { "type": "boolean" },
      "gift": { "type": "boolean" }
    },
    "designSettingsSchema": {}
  }'::jsonb;
  v_template public.templates%ROWTYPE;
  v_version public.template_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_template FROM public.templates WHERE code = 'khan-voan';
  IF NOT FOUND OR v_template.event_type IS DISTINCT FROM 'WEDDING' OR v_template.name IS DISTINCT FROM 'Khăn Voan' THEN
    RAISE EXCEPTION 'khan-voan catalog: template row missing or not the expected identity';
  END IF;

  SELECT * INTO v_version FROM public.template_versions WHERE renderer_key = 'wedding.khan-voan.v1';
  IF NOT FOUND
    OR v_version.template_id IS DISTINCT FROM v_template.id
    OR v_version.version_number IS DISTINCT FROM 1
    OR v_version.manifest IS DISTINCT FROM v_manifest THEN
    RAISE EXCEPTION 'khan-voan catalog: version 1 row missing or not equal to the code manifest';
  END IF;
END;
$$;
