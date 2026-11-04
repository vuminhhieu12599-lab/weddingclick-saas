-- WeddingClick V2 — Data-only Migration 0058 (HA-CONTENT-01)
-- Register Hồng Ân v2 (`wedding.hong-an.v2`) as version 2 of the existing
-- `hong-an` catalog template.
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL against DEV or Production. Application happens
-- only after explicit Product Owner approval.
--
-- WHY A NEW VERSION ROW RATHER THAN AN AMENDED v1.
-- HA-CONTENT-01 makes the Scripture quote Staff-configurable, which needs
-- the stored design manifest to declare the two optional settings
-- `scriptureVerse` and `scriptureReference`: the design API validates every
-- `project_design.design_settings` write against the EXACT pinned
-- `template_versions.manifest` and rejects an undeclared key (422
-- INVARIANT, docs/API_CONTRACT.md §13.3). That manifest cannot be updated
-- in place:
--   * `guard_template_version_immutability()` (migration 0010) raises on any
--     change to template_id/version_number/renderer_key/manifest/created_at.
--     `retired_at` is the ONLY column a normal UPDATE may ever change
--     (docs/PHYSICAL_DATABASE_PLAN.md §2.11 [F10], which deliberately
--     reversed an earlier "manifest mutable by convention" design); and
--   * CLAUDE.md §9 requires a new version rather than an edited one.
-- So the capability ships as renderer v2, exactly as Se Duyên v2 (0054),
-- Vietnamese Heritage v2 (0050) and Our Wedding Story v2 (0051) did.
--
-- Source of truth: RF9 (catalog seeding is a reproducible data-only
-- migration) and RF-06-0 P14/P16/P41 (the seeded row equals the frozen code
-- identity and design manifest exactly). `manifest` below is exactly the
-- `.design` subset of HONG_AN_V2_MANIFEST
-- (templates/wedding/hong-an/v2/manifest.ts); a focused test keeps them
-- equal. It equals v1's subset except for `designSettingsSchema`: v2 adds
-- the two optional Scripture settings and changes no palette, font preset,
-- effect preset or section setting, so a Project moved from v1 to v2 keeps
-- its design assignment and its media and re-uploads nothing.
--
-- THIS MIGRATION DOES NOT RE-APPLY 0057 AND MUST NOT. It never inserts,
-- updates or retires the `hong-an` template row, and it never touches
-- `is_active` — not to set it, not to clear it, not even to assert it. 0057
-- authored that row as `is_active = false`; whether a database has since
-- been activated by the Product Owner's own decision is not this
-- migration's business, and asserting either value here would fail a
-- legitimate database closed.
--
-- Preserves every existing row: the `hong-an` template row (0057) and its
-- version 1 (`wedding.hong-an.v1`) are never inserted, updated or retired
-- here. Every Project assignment, Review snapshot and published invitation
-- pinned to v1 keeps its exact version and its exact rendered output: v1's
-- own manifest still declares `designSettingsSchema: {}`, which the
-- verification block below asserts, so v1 can never acquire this capability
-- retroactively. v1 stays selectable; retiring it for new selections is a
-- separate Product Owner decision. Moving an existing Project to v2 is a
-- Staff design-assignment action, never a side effect of this migration.
--
-- Not a schema migration: no table, column, constraint, index, grant or
-- policy changes, and no trigger is disabled, dropped or bypassed. Inserts
-- happen as the migration-running role (`postgres`, BYPASSRLS — see
-- migration 0002's header note).
--
-- Idempotent: ON CONFLICT DO NOTHING on template_versions' unique keys
-- (renderer_key, (template_id, version_number)), so re-running never
-- duplicates rows and never updates an existing one (template_versions rows
-- are immutable after INSERT: guard_template_version_immutability). The
-- verification block then fails the whole migration closed if the template,
-- the new v2 row or the preserved v1 row disagrees with the frozen identity
-- or manifest.

-- Fail closed before inserting anything if the parent template is absent
-- (0057 must have run): 0058 never creates or alters the template row.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.templates WHERE code = 'hong-an') <> 1 THEN
    RAISE EXCEPTION 'hong-an v2 catalog: expected exactly one hong-an template row (run 0057 first)';
  END IF;
END;
$$;

INSERT INTO public.template_versions (template_id, version_number, renderer_key, manifest)
SELECT
  t.id,
  2,
  'wedding.hong-an.v2',
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
    "designSettingsSchema": {
      "scriptureVerse": { "type": "string" },
      "scriptureReference": { "type": "string" }
    }
  }'::jsonb
FROM public.templates t
WHERE t.code = 'hong-an'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Fail-closed verification: v2 inserted exactly, v1 preserved exactly
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_manifest_v2 constant jsonb := '{
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
    "designSettingsSchema": {
      "scriptureVerse": { "type": "string" },
      "scriptureReference": { "type": "string" }
    }
  }'::jsonb;
  -- v1's own frozen manifest, as 0057 inserted it. Asserted UNCHANGED here:
  -- `designSettingsSchema` stays empty, so no invitation already reviewed or
  -- published on v1 can be affected by HA-CONTENT-01.
  v_manifest_v1 constant jsonb := '{
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
  v_v2 public.template_versions%ROWTYPE;
  v_version_count integer;
BEGIN
  SELECT * INTO v_template FROM public.templates WHERE code = 'hong-an';
  IF v_template.event_type IS DISTINCT FROM 'WEDDING' OR v_template.name IS DISTINCT FROM 'Hồng Ân' THEN
    RAISE EXCEPTION 'hong-an v2 catalog: template row does not match the frozen identity';
  END IF;

  SELECT * INTO v_v2 FROM public.template_versions WHERE renderer_key = 'wedding.hong-an.v2';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hong-an v2 catalog: template version row is missing';
  END IF;
  IF v_v2.template_id IS DISTINCT FROM v_template.id THEN
    RAISE EXCEPTION 'hong-an v2 catalog: renderer key belongs to another template';
  END IF;
  IF v_v2.version_number IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'hong-an v2 catalog: version_number does not match the frozen identity';
  END IF;
  IF v_v2.manifest IS DISTINCT FROM v_manifest_v2 THEN
    RAISE EXCEPTION 'hong-an v2 catalog: manifest does not match the frozen design manifest';
  END IF;
  IF v_v2.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'hong-an v2 catalog: template version is retired';
  END IF;

  -- v1 is preserved exactly as 0057 froze it, `designSettingsSchema: {}`
  -- included. A DEV Project holds a Review snapshot and a published
  -- invitation on it.
  SELECT * INTO v_v1 FROM public.template_versions WHERE renderer_key = 'wedding.hong-an.v1';
  IF NOT FOUND OR v_v1.template_id IS DISTINCT FROM v_template.id OR v_v1.version_number IS DISTINCT FROM 1
    OR v_v1.manifest IS DISTINCT FROM v_manifest_v1 THEN
    RAISE EXCEPTION 'hong-an v2 catalog: the v1 version row is not preserved as frozen';
  END IF;
  IF v_v1.retired_at IS NOT NULL THEN
    RAISE NOTICE 'hong-an v2 catalog: v1 is retired in this database (kept as is)';
  END IF;

  SELECT count(*) INTO v_version_count FROM public.template_versions WHERE template_id = v_template.id;
  IF v_version_count <> 2 THEN
    RAISE EXCEPTION 'hong-an v2 catalog: expected exactly versions 1 and 2, found % rows', v_version_count;
  END IF;

  -- Says plainly, in the database, that v2 is registered but inherits
  -- whatever offering decision the template row already carries.
  RAISE NOTICE 'hong-an v2 catalog: version 2 seeded; the hong-an template row and its offering flag are untouched by this migration';
END;
$$;
