-- WeddingClick V2 — Data-only Migration 0050 (VH-V2-RELEASE-READINESS)
-- Register Vietnamese Heritage v2 (`wedding.vietnamese-heritage.v2`) as
-- version 2 of the existing `vietnamese-heritage` catalog template.
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL against DEV or Production. Application happens
-- only after explicit Product Owner approval (docs/DECISIONS.md
-- "VH-V2-RELEASE-READINESS").
--
-- Why: v1 is released and immutable (RF7/RF14), so the Product
-- Owner-accepted gift wording, typography and motion ship as renderer v2
-- (docs/DECISIONS.md "VH-V2-01"). A renderer is selectable by Staff only
-- through a catalog template_versions row (RF9).
--
-- Source of truth: RF9 (catalog seeding is a reproducible data-only
-- migration) and RF-06-0 P14/P16/P41 (the seeded row equals the frozen code
-- identity and design manifest exactly). `manifest` below is exactly the
-- `.design` subset of VIETNAMESE_HERITAGE_V2_MANIFEST
-- (templates/wedding/vietnamese-heritage/v2/manifest.ts); a focused test
-- keeps them equal.
--
-- Preserves every existing row: the `vietnamese-heritage` template row
-- (0048) and its version 1 (`wedding.vietnamese-heritage.v1`) are never
-- inserted, updated or retired here; every Project and published Snapshot
-- pinned to v1 keeps its exact version. v1 stays selectable; retiring it for
-- new selections is a separate Product Owner decision.
--
-- Not a schema migration: no table, column, constraint, index, grant or
-- policy changes. Inserts happen as the migration-running role (`postgres`,
-- BYPASSRLS — see migration 0002's header note).
--
-- Idempotent: ON CONFLICT DO NOTHING on template_versions' unique keys
-- (renderer_key, (template_id, version_number)), so re-running never
-- duplicates rows and never updates an existing one (template_versions rows
-- are immutable after INSERT: guard_template_version_immutability). The
-- verification block then fails the whole migration closed if the template,
-- the new v2 row or the preserved v1 row disagrees with the frozen identity
-- or manifest.

-- Fail closed before inserting anything if the parent template is absent
-- (0048 must have run): 0050 never creates or alters the template row.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.templates WHERE code = 'vietnamese-heritage') <> 1 THEN
    RAISE EXCEPTION 'vietnamese-heritage v2 catalog: expected exactly one vietnamese-heritage template row (run 0048 first)';
  END IF;
END;
$$;

INSERT INTO public.template_versions (template_id, version_number, renderer_key, manifest)
SELECT
  t.id,
  2,
  'wedding.vietnamese-heritage.v2',
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
-- Fail-closed verification: v2 inserted exactly, v1 preserved exactly
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_manifest constant jsonb := '{
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
  }'::jsonb;
  v_template public.templates%ROWTYPE;
  v_v1 public.template_versions%ROWTYPE;
  v_v2 public.template_versions%ROWTYPE;
  v_version_count integer;
BEGIN
  SELECT * INTO v_template FROM public.templates WHERE code = 'vietnamese-heritage';
  IF v_template.event_type IS DISTINCT FROM 'WEDDING' OR v_template.name IS DISTINCT FROM 'Vietnamese Heritage' THEN
    RAISE EXCEPTION 'vietnamese-heritage v2 catalog: template row does not match the frozen identity';
  END IF;

  SELECT * INTO v_v2 FROM public.template_versions WHERE renderer_key = 'wedding.vietnamese-heritage.v2';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vietnamese-heritage v2 catalog: template version row is missing';
  END IF;
  IF v_v2.template_id IS DISTINCT FROM v_template.id THEN
    RAISE EXCEPTION 'vietnamese-heritage v2 catalog: renderer key belongs to another template';
  END IF;
  IF v_v2.version_number IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'vietnamese-heritage v2 catalog: version_number does not match the frozen identity';
  END IF;
  IF v_v2.manifest IS DISTINCT FROM v_manifest THEN
    RAISE EXCEPTION 'vietnamese-heritage v2 catalog: manifest does not match the frozen design manifest';
  END IF;
  IF v_v2.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'vietnamese-heritage v2 catalog: template version is retired';
  END IF;

  -- v1 is preserved: still present, still version 1 of this template, same manifest.
  SELECT * INTO v_v1 FROM public.template_versions WHERE renderer_key = 'wedding.vietnamese-heritage.v1';
  IF NOT FOUND OR v_v1.template_id IS DISTINCT FROM v_template.id OR v_v1.version_number IS DISTINCT FROM 1
    OR v_v1.manifest IS DISTINCT FROM v_manifest THEN
    RAISE EXCEPTION 'vietnamese-heritage v2 catalog: the v1 version row is not preserved as frozen';
  END IF;
  IF v_v1.retired_at IS NOT NULL THEN
    RAISE NOTICE 'vietnamese-heritage v2 catalog: v1 is retired in this database (kept as is)';
  END IF;

  SELECT count(*) INTO v_version_count FROM public.template_versions WHERE template_id = v_template.id;
  IF v_version_count <> 2 THEN
    RAISE EXCEPTION 'vietnamese-heritage v2 catalog: expected exactly versions 1 and 2, found % rows', v_version_count;
  END IF;
END;
$$;
