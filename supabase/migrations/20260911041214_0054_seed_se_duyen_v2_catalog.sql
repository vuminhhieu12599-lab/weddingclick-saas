-- WeddingClick V2 — Data-only Migration 0054 (SD-V2-CATALOG-01)
-- Register Se Duyên v2 (`wedding.se-duyen.v2`) as version 2 of the existing
-- `se-duyen` catalog template.
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL against DEV or Production. Application happens
-- only after explicit Product Owner approval (docs/DECISIONS.md
-- "SD-V2-CATALOG-01").
--
-- Why: migration 0052 is APPLIED in Production, the `se-duyen` template is
-- ACTIVE there, and a Production Project already holds a published Se Duyên
-- v1 invitation. v1 is therefore released and immutable (RF7/RF14, P22,
-- CLAUDE.md §9), so the two Product-Owner-rejected compositions — a music
-- control that never started with the invitation, and the four-frame
-- asymmetric album that showed at most four photographs — ship as renderer
-- v2 (docs/DECISIONS.md "SD-V2-01"). A renderer is selectable by Staff only
-- through a catalog template_versions row (RF9).
--
-- Source of truth: RF9 (catalog seeding is a reproducible data-only
-- migration) and RF-06-0 P14/P16/P41 (the seeded row equals the frozen code
-- identity and design manifest exactly). `manifest` below is exactly the
-- `.design` subset of SE_DUYEN_V2_MANIFEST
-- (templates/wedding/se-duyen/v2/manifest.ts); a focused test keeps them
-- equal. It is identical to v1's subset on purpose: v2 changes presentation
-- only, so no palette, font preset, effect preset or section setting is
-- added, removed or renamed, and a Project moved from v1 to v2 keeps its
-- design assignment and its media.
--
-- THIS MIGRATION DOES NOT RE-APPLY 0052 AND MUST NOT. It never inserts,
-- updates or retires the `se-duyen` template row, and it never touches
-- `is_active` — not to set it, not to clear it, not even to assert it. 0052
-- authored that row as `is_active = false` and Production has since been
-- activated by the Product Owner's own decision; asserting either value
-- here would fail a legitimate database closed.
--
-- Preserves every existing row: the `se-duyen` template row (0052) and its
-- version 1 (`wedding.se-duyen.v1`) are never inserted, updated or retired
-- here; the Project and the published Snapshot pinned to v1 keep their exact
-- version. v1 stays selectable; retiring it for new selections is a separate
-- Product Owner decision.
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
-- (0052 must have run): 0054 never creates or alters the template row.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.templates WHERE code = 'se-duyen') <> 1 THEN
    RAISE EXCEPTION 'se-duyen v2 catalog: expected exactly one se-duyen template row (run 0052 first)';
  END IF;
END;
$$;

INSERT INTO public.template_versions (template_id, version_number, renderer_key, manifest)
SELECT
  t.id,
  2,
  'wedding.se-duyen.v2',
  '{
    "schemaVersion": 1,
    "palettes": ["son-mai-lacquer"],
    "fontPresets": ["lacquer-garamond"],
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
WHERE t.code = 'se-duyen'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Fail-closed verification: v2 inserted exactly, v1 preserved exactly
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_manifest constant jsonb := '{
    "schemaVersion": 1,
    "palettes": ["son-mai-lacquer"],
    "fontPresets": ["lacquer-garamond"],
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
  v_v2 public.template_versions%ROWTYPE;
  v_version_count integer;
BEGIN
  SELECT * INTO v_template FROM public.templates WHERE code = 'se-duyen';
  IF v_template.event_type IS DISTINCT FROM 'WEDDING' OR v_template.name IS DISTINCT FROM 'Se Duyên' THEN
    RAISE EXCEPTION 'se-duyen v2 catalog: template row does not match the frozen identity';
  END IF;

  SELECT * INTO v_v2 FROM public.template_versions WHERE renderer_key = 'wedding.se-duyen.v2';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'se-duyen v2 catalog: template version row is missing';
  END IF;
  IF v_v2.template_id IS DISTINCT FROM v_template.id THEN
    RAISE EXCEPTION 'se-duyen v2 catalog: renderer key belongs to another template';
  END IF;
  IF v_v2.version_number IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'se-duyen v2 catalog: version_number does not match the frozen identity';
  END IF;
  IF v_v2.manifest IS DISTINCT FROM v_manifest THEN
    RAISE EXCEPTION 'se-duyen v2 catalog: manifest does not match the frozen design manifest';
  END IF;
  IF v_v2.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'se-duyen v2 catalog: template version is retired';
  END IF;

  -- v1 is preserved: still present, still version 1 of this template, same
  -- manifest. A Production Project holds a published invitation on it.
  SELECT * INTO v_v1 FROM public.template_versions WHERE renderer_key = 'wedding.se-duyen.v1';
  IF NOT FOUND OR v_v1.template_id IS DISTINCT FROM v_template.id OR v_v1.version_number IS DISTINCT FROM 1
    OR v_v1.manifest IS DISTINCT FROM v_manifest THEN
    RAISE EXCEPTION 'se-duyen v2 catalog: the v1 version row is not preserved as frozen';
  END IF;
  IF v_v1.retired_at IS NOT NULL THEN
    RAISE NOTICE 'se-duyen v2 catalog: v1 is retired in this database (kept as is)';
  END IF;

  SELECT count(*) INTO v_version_count FROM public.template_versions WHERE template_id = v_template.id;
  IF v_version_count <> 2 THEN
    RAISE EXCEPTION 'se-duyen v2 catalog: expected exactly versions 1 and 2, found % rows', v_version_count;
  END IF;
END;
$$;
