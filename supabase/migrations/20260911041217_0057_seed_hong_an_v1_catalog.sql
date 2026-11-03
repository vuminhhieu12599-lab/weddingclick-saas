-- WeddingClick V2 — Data-only Migration 0057 (HA-INTEGRATION-01)
-- Register Hồng Ân (`wedding.hong-an.v1`) as a new catalog template with
-- its version 1.
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL against DEV or Production. Application happens
-- only after explicit Product Owner approval.
--
-- Why: a renderer is selectable by Staff only through a catalog
-- template_versions row (RF9). Hồng Ân v1 is registered in code
-- (templates/core/production-renderer-manifests.ts), which is code
-- compatibility only; without this row it cannot be chosen for a Project.
--
-- Source of truth: RF9 (catalog seeding is a reproducible data-only
-- migration) and RF-06-0 P14/P16/P41 (the seeded row equals the frozen code
-- identity and design manifest exactly). `manifest` below is exactly the
-- `.design` subset of HONG_AN_V1_MANIFEST
-- (templates/wedding/hong-an/v1/manifest.ts); a focused test keeps them
-- equal.
--
-- DELIBERATELY NOT LISTED YET: `is_active = false`, as for Se Duyên (0052).
-- The Product Owner has approved and frozen the design, but offering the
-- template to Staff is a separate decision. Activating it is a one-line
-- follow-up (`UPDATE public.templates SET is_active = true WHERE code =
-- 'hong-an'`) and an explicit Product Owner decision, not a side effect of
-- seeding.
--
-- Preserves every existing row: no other template or version is inserted,
-- updated or retired here, and no Project assignment is touched.
--
-- Not a schema migration: no table, column, constraint, index, grant or
-- policy changes. Inserts happen as the migration-running role (`postgres`,
-- BYPASSRLS — see migration 0002's header note).
--
-- Idempotent: ON CONFLICT DO NOTHING on templates.code and on
-- template_versions' unique keys (renderer_key, (template_id,
-- version_number)), so re-running never duplicates rows and never updates an
-- existing one (template_versions rows are immutable after INSERT:
-- guard_template_version_immutability). The verification block then fails the
-- whole migration closed if anything disagrees with the frozen identity or
-- manifest.

INSERT INTO public.templates (code, event_type, name, is_active, sort_order)
VALUES ('hong-an', 'WEDDING', 'Hồng Ân', false, 5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.template_versions (template_id, version_number, renderer_key, manifest)
SELECT
  t.id,
  1,
  'wedding.hong-an.v1',
  '{
    "schemaVersion": 1,
    "palettes": ["hong-an-ivory"],
    "fontPresets": ["hong-an-cathedral"],
    "effectPresets": ["STANDARD"],
    "sectionSettingsSchema": {
      "invitationMessage": { "type": "boolean" },
      "loveStory": { "type": "boolean" },
      "gallery": { "type": "boolean" },
      "timeline": { "type": "boolean" },
      "music": { "type": "boolean" },
      "gift": { "type": "boolean" }
    },
    "designSettingsSchema": {}
  }'::jsonb
FROM public.templates t
WHERE t.code = 'hong-an'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Fail-closed verification: the template and its v1 match the frozen code
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_manifest constant jsonb := '{
    "schemaVersion": 1,
    "palettes": ["hong-an-ivory"],
    "fontPresets": ["hong-an-cathedral"],
    "effectPresets": ["STANDARD"],
    "sectionSettingsSchema": {
      "invitationMessage": { "type": "boolean" },
      "loveStory": { "type": "boolean" },
      "gallery": { "type": "boolean" },
      "timeline": { "type": "boolean" },
      "music": { "type": "boolean" },
      "gift": { "type": "boolean" }
    },
    "designSettingsSchema": {}
  }'::jsonb;
  v_template public.templates%ROWTYPE;
  v_v1 public.template_versions%ROWTYPE;
  v_version_count integer;
BEGIN
  SELECT * INTO v_template FROM public.templates WHERE code = 'hong-an';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hong-an catalog: template row is missing';
  END IF;
  IF v_template.event_type IS DISTINCT FROM 'WEDDING' OR v_template.name IS DISTINCT FROM 'Hồng Ân' THEN
    RAISE EXCEPTION 'hong-an catalog: template row does not match the frozen identity';
  END IF;

  SELECT * INTO v_v1 FROM public.template_versions WHERE renderer_key = 'wedding.hong-an.v1';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hong-an catalog: template version row is missing';
  END IF;
  IF v_v1.template_id IS DISTINCT FROM v_template.id THEN
    RAISE EXCEPTION 'hong-an catalog: renderer key belongs to another template';
  END IF;
  IF v_v1.version_number IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'hong-an catalog: version_number does not match the frozen identity';
  END IF;
  IF v_v1.manifest IS DISTINCT FROM v_manifest THEN
    RAISE EXCEPTION 'hong-an catalog: manifest does not match the frozen design manifest';
  END IF;
  IF v_v1.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'hong-an catalog: template version is retired';
  END IF;

  SELECT count(*) INTO v_version_count FROM public.template_versions WHERE template_id = v_template.id;
  IF v_version_count <> 1 THEN
    RAISE EXCEPTION 'hong-an catalog: expected exactly version 1, found % rows', v_version_count;
  END IF;

  -- Says plainly, in the database, that this template is registered but not
  -- yet offered: activation is a separate Product Owner decision.
  IF v_template.is_active THEN
    RAISE NOTICE 'hong-an catalog: template is ACTIVE in this database (kept as is)';
  ELSE
    RAISE NOTICE 'hong-an catalog: template is seeded INACTIVE; activate only after Product Owner approval';
  END IF;
END;
$$;
