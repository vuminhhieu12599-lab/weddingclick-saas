-- WeddingClick V2 — Verification-only Migration 0034
-- Verify the Elegant Editorial v1 template catalog rows exactly.
--
-- Source of truth: docs/DECISIONS.md RF9, RF-06-0 P14 (frozen identity),
-- P16 (frozen manifest values) and P41 (seeded rows must equal P14/P16
-- exactly). The manifest literal below is copied verbatim from migration
-- 0033 and equals ELEGANT_EDITORIAL_V1_MANIFEST.design in
-- templates/wedding/elegant-editorial/v1/manifest.ts; a focused test keeps
-- all three equal.
--
-- Why: 0033 seeds with conflict-skipping inserts, and its own final check
-- does not compare the manifest. A pre-existing conflicting row could
-- therefore survive 0033 silently. 0033 is already applied and is left
-- unchanged; this migration closes that gap.
--
-- Read-only with respect to all data: it only selects and raises. No
-- table, column, constraint, index, grant, policy or row is changed. The
-- intended sequence on every environment is 0033 (seed if absent) then
-- 0034 (pass on the exact canonical rows, otherwise fail loudly).

DO $$
DECLARE
  v_template_count integer;
  v_template public.templates%ROWTYPE;
  v_version public.template_versions%ROWTYPE;
  v_expected_manifest constant jsonb := '{
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
  }'::jsonb;
BEGIN
  SELECT count(*) INTO v_template_count
  FROM public.templates
  WHERE code = 'elegant-editorial';

  IF v_template_count <> 1 THEN
    RAISE EXCEPTION 'Elegant Editorial catalog check: expected exactly 1 template with code elegant-editorial, found %',
      v_template_count;
  END IF;

  SELECT * INTO v_template
  FROM public.templates
  WHERE code = 'elegant-editorial';

  IF v_template.event_type IS DISTINCT FROM 'WEDDING' THEN
    RAISE EXCEPTION 'Elegant Editorial catalog check: template event_type is %, expected WEDDING',
      v_template.event_type;
  END IF;

  IF v_template.name IS DISTINCT FROM 'Elegant Editorial' THEN
    RAISE EXCEPTION 'Elegant Editorial catalog check: template name does not equal Elegant Editorial';
  END IF;

  SELECT * INTO v_version
  FROM public.template_versions
  WHERE renderer_key = 'wedding.elegant-editorial.v1';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Elegant Editorial catalog check: no template version with renderer_key wedding.elegant-editorial.v1';
  END IF;

  IF v_version.template_id IS DISTINCT FROM v_template.id THEN
    RAISE EXCEPTION 'Elegant Editorial catalog check: renderer_key wedding.elegant-editorial.v1 belongs to a different template';
  END IF;

  IF v_version.version_number IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Elegant Editorial catalog check: version_number is %, expected 1',
      v_version.version_number;
  END IF;

  IF v_version.manifest IS DISTINCT FROM v_expected_manifest THEN
    RAISE EXCEPTION 'Elegant Editorial catalog check: template_versions.manifest differs from the frozen v1 design manifest';
  END IF;
END;
$$;
