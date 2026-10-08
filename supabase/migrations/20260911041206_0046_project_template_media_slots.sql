-- WeddingClick V2 — Feature Migration 0046 (TE-03B)
-- Project PHOTO library type + template media slot persistence.
--
-- docs/DECISIONS.md "TE-01" (T2–T5) and "TE-03B". Migration number 0045 is
-- RETIRED (never applied anywhere, removed by TE-03A) and is intentionally
-- absent; this is the next real migration after 0044.
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL against DEV or Production. Application happens
-- only after review, by the Product Owner.
--
-- This migration does exactly three things:
--
--   1. project_media.media_type: recreate the CHECK with every 0035 value
--      plus PHOTO (appended last). PHOTO is an ordinary customer photograph
--      in the Project media library, available for template media slot
--      assignment; it has no layout meaning. It uses the existing image
--      MIME/size policy, so no Storage bucket/policy change is needed.
--   2. public.project_template_media_slot_items: one row per occupied,
--      ordered position of one template media slot, for one Project and one
--      exact template version. Staff-readable; never directly writable.
--   3. public.set_project_template_media_slot(): the one trusted write
--      action, atomically replacing one slot's ordered items.
--
-- Nothing else: no existing row, Snapshot, invitation version, media pin,
-- project_design row or Storage object is touched. No Snapshot/ViewModel
-- integration exists yet (TE-04).
--
-- ---------------------------------------------------------------------
-- MODEL
-- ---------------------------------------------------------------------
-- Assignments are shared by COMMON, GROOM and BRIDE (Product Owner,
-- TE-03A): there is no variant column. They are kept per exact
-- template_version_id: switching the Project design to another version
-- never deletes, copies or edits the previous version's rows, and they are
-- effective again if Staff switch back.
--
-- The database knows no template: slot keys are validated here only
-- structurally (the TE-02 key pattern). Whether a slot key exists for the
-- pinned renderer, its cardinality and maxCount are validated by the
-- server use case against the code-owned TemplateEditorManifestV1 before
-- this RPC is called (docs/DECISIONS.md "TE-03B"). This function re-checks
-- ownership, media type and the current template version as defense in
-- depth.
--
-- ---------------------------------------------------------------------
-- DELETE SEMANTICS
-- ---------------------------------------------------------------------
-- project_id -> projects ON DELETE CASCADE.
-- template_version_id -> template_versions ON DELETE RESTRICT (versions are
--   never deleted; 0010 has no DELETE policy).
-- (project_media_id, project_id) -> project_media (id, project_id)
--   ON DELETE NO ACTION: a direct DELETE of an assigned media row fails, so
--   an assigned photo never silently disappears from a draft slot. NO
--   ACTION (checked at statement end), not RESTRICT (checked immediately),
--   so a Project hard-delete that cascades both project_media and these
--   rows in one statement still succeeds. A composite SET NULL is rejected
--   (it would null project_id, docs/PHYSICAL_DATABASE_PLAN.md §2.9).
-- created_by -> profiles ON DELETE SET NULL.
--
-- ---------------------------------------------------------------------
-- ERROR CONTRACT — TMxxx custom SQLSTATE range (new, unused elsewhere)
-- ---------------------------------------------------------------------
-- TM001  CALLER_FORBIDDEN — not an active WeddingClick STAFF/ADMIN -> 403
-- TM002  PROJECT_NOT_FOUND -> 404
-- TM003  PROJECT_DESIGN_MISSING — the Project has no design row -> 409
-- TM004  TEMPLATE_VERSION_MISMATCH — p_template_version_id is not the
--        Project design's CURRENT template_version_id (compare-and-set)
--        -> 409
-- TM005  INVALID_SLOT_INPUT — slot key fails the structural pattern, or the
--        media id array is NULL, multi-dimensional, contains a NULL element
--        or has more than 500 items -> 400
-- TM006  DUPLICATE_MEDIA — the same media id appears twice -> 400 (never
--        silently deduplicated)
-- TM007  MEDIA_NOT_ASSIGNABLE — an id does not exist, belongs to another
--        Project, or is not a slot-assignable photo type -> 422. Missing and
--        foreign ids collapse to this one code; no other Project's data is
--        ever revealed.
-- Messages are fixed, safe strings. Every other failure propagates with its
-- native SQLSTATE and is mapped to a generic 500 by the application.

-- ===========================================================================
-- 1. project_media.media_type: + PHOTO
-- ===========================================================================
ALTER TABLE public.project_media
  DROP CONSTRAINT project_media_media_type_check;

ALTER TABLE public.project_media
  ADD CONSTRAINT project_media_media_type_check CHECK (
    media_type IN (
      'COVER',
      'GALLERY',
      'AUDIO',
      'QR_GROOM',
      'QR_BRIDE',
      'QR_COMMON',
      'PORTRAIT_GROOM',
      'PORTRAIT_BRIDE',
      'PHOTO_STORY',
      'LOVE_STORY_PHOTO',
      'SOCIAL_SHARE_COVER',
      'PHOTO'
    )
  );

COMMENT ON CONSTRAINT project_media_media_type_check ON public.project_media IS
  'Media roles (docs/PHYSICAL_DATABASE_PLAN.md §2.9). PORTRAIT_* (0028), PHOTO_STORY / LOVE_STORY_PHOTO (0031), SOCIAL_SHARE_COVER (0035), PHOTO (0046: neutral library photograph for template media slots, no layout meaning). No per-template layout role is ever added.';

-- ===========================================================================
-- 2. project_template_media_slot_items
-- ===========================================================================
CREATE TABLE public.project_template_media_slot_items (
  project_id           UUID NOT NULL
                         REFERENCES public.projects (id) ON DELETE CASCADE,
  template_version_id  UUID NOT NULL
                         REFERENCES public.template_versions (id) ON DELETE RESTRICT,
  slot_key             TEXT NOT NULL,
  position             INTEGER NOT NULL,
  project_media_id     UUID NOT NULL,
  created_by           UUID
                         REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_template_media_slot_items_pkey
    PRIMARY KEY (project_id, template_version_id, slot_key, position),
  CONSTRAINT project_template_media_slot_items_media_once_per_slot_key
    UNIQUE (project_id, template_version_id, slot_key, project_media_id),
  CONSTRAINT project_template_media_slot_items_slot_key_check
    CHECK (slot_key ~ '^[a-z][A-Za-z0-9]{0,47}$'),
  CONSTRAINT project_template_media_slot_items_position_check
    CHECK (position >= 0),
  CONSTRAINT project_template_media_slot_items_media_project_fkey
    FOREIGN KEY (project_media_id, project_id)
    REFERENCES public.project_media (id, project_id)
    ON DELETE NO ACTION
);

COMMENT ON TABLE public.project_template_media_slot_items IS
  'TE-03B draft template media slot assignments: one row per occupied 0-based position of one slot, for one Project and one exact template version. Shared by COMMON/GROOM/BRIDE (no variant column). Kept per template version across template switches. Written only by set_project_template_media_slot(); never read by renderers (REVIEW/PUBLISHED Snapshots freeze their own copy, TE-04).';
COMMENT ON COLUMN public.project_template_media_slot_items.slot_key IS
  'Structural pattern only (TE-02 slot key pattern). Whether the key exists for the pinned renderer is validated by the server against the code-owned TemplateEditorManifestV1.';
COMMENT ON COLUMN public.project_template_media_slot_items.position IS
  '0-based; the write RPC always writes 0..N-1 in caller order. Staff UI shows 1..N.';
COMMENT ON CONSTRAINT project_template_media_slot_items_media_project_fkey ON public.project_template_media_slot_items IS
  'Same-Project media (0007 project_media_id_project_id_unique target). NO ACTION: a direct delete of an assigned photo fails; a Project cascade deleting both sides in one statement succeeds.';

CREATE INDEX project_template_media_slot_items_media_project_idx
  ON public.project_template_media_slot_items (project_media_id, project_id);

REVOKE ALL ON TABLE public.project_template_media_slot_items FROM PUBLIC;
REVOKE ALL ON TABLE public.project_template_media_slot_items FROM anon;
REVOKE ALL ON TABLE public.project_template_media_slot_items FROM authenticated;
REVOKE ALL ON TABLE public.project_template_media_slot_items FROM service_role;

GRANT SELECT ON TABLE public.project_template_media_slot_items TO authenticated;

ALTER TABLE public.project_template_media_slot_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_template_media_slot_items FORCE ROW LEVEL SECURITY;

-- Staff read only. No INSERT/UPDATE/DELETE policy for any role: every
-- mutation goes through set_project_template_media_slot().
CREATE POLICY project_template_media_slot_items_select_staff
  ON public.project_template_media_slot_items
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- ===========================================================================
-- 3. set_project_template_media_slot
-- ===========================================================================
CREATE FUNCTION public.set_project_template_media_slot(
  p_project_id uuid,
  p_template_version_id uuid,
  p_slot_key text,
  p_project_media_ids uuid[]
)
RETURNS TABLE (
  slot_key text,
  "position" integer,
  project_media_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_template_version_id uuid;
  v_count integer;
  v_valid integer;
BEGIN
  -- A. Caller: active WeddingClick STAFF/ADMIN, right now (mirrors 0025).
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'TM001';
  END IF;

  PERFORM 1
  FROM public.profiles AS pr
  WHERE pr.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'TM001';
  END IF;

  IF public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'TM001';
  END IF;

  -- B. Structural input, before any Project data is read.
  IF p_slot_key IS NULL OR p_slot_key !~ '^[a-z][A-Za-z0-9]{0,47}$' THEN
    RAISE EXCEPTION 'Invalid template media slot input'
      USING ERRCODE = 'TM005';
  END IF;

  IF p_project_media_ids IS NULL
     OR coalesce(array_ndims(p_project_media_ids), 1) <> 1
     OR array_position(p_project_media_ids, NULL) IS NOT NULL
     OR cardinality(p_project_media_ids) > 500 THEN
    RAISE EXCEPTION 'Invalid template media slot input'
      USING ERRCODE = 'TM005';
  END IF;

  v_count := cardinality(p_project_media_ids);

  IF (SELECT count(DISTINCT m.id) FROM unnest(p_project_media_ids) AS m(id)) <> v_count THEN
    RAISE EXCEPTION 'Duplicate media in template media slot'
      USING ERRCODE = 'TM006';
  END IF;

  -- C. Project must exist (FOR KEY SHARE blocks a concurrent delete
  -- without serializing unrelated lifecycle writers; mirrors 0025).
  PERFORM 1
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'TM002';
  END IF;

  -- D. Lock the Project's design row and compare-and-set the CURRENT exact
  -- template version. FOR UPDATE serializes concurrent slot writes of the
  -- same Project and any concurrent design change.
  SELECT d.template_version_id
  INTO v_current_template_version_id
  FROM public.project_design AS d
  WHERE d.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project design is not configured'
      USING ERRCODE = 'TM003';
  END IF;

  IF p_template_version_id IS NULL
     OR v_current_template_version_id IS DISTINCT FROM p_template_version_id THEN
    RAISE EXCEPTION 'Project template version changed'
      USING ERRCODE = 'TM004';
  END IF;

  -- E. Every id: existing, same Project, slot-assignable photo type. The
  -- rows are locked FOR KEY SHARE so they cannot be deleted before the
  -- insert below. The accepted set equals TEMPLATE_SLOT_ASSIGNABLE_MEDIA_TYPES
  -- (lib/domain/media-type.ts).
  SELECT count(*)
  INTO v_valid
  FROM (
    SELECT pm.id
    FROM public.project_media AS pm
    WHERE pm.id = ANY (p_project_media_ids)
      AND pm.project_id = p_project_id
      AND pm.media_type IN (
        'PHOTO',
        'COVER',
        'GALLERY',
        'PORTRAIT_GROOM',
        'PORTRAIT_BRIDE',
        'PHOTO_STORY',
        'LOVE_STORY_PHOTO'
      )
    FOR KEY SHARE
  ) AS valid_media;

  IF v_valid <> v_count THEN
    RAISE EXCEPTION 'Media cannot be assigned to a template media slot'
      USING ERRCODE = 'TM007';
  END IF;

  -- F. Atomic full replace of exactly this Project + version + slot.
  DELETE FROM public.project_template_media_slot_items AS i
  WHERE i.project_id = p_project_id
    AND i.template_version_id = p_template_version_id
    AND i.slot_key = p_slot_key;

  INSERT INTO public.project_template_media_slot_items (
    project_id, template_version_id, slot_key, "position", project_media_id, created_by
  )
  SELECT p_project_id, p_template_version_id, p_slot_key, (m.ord - 1)::integer, m.id, auth.uid()
  FROM unnest(p_project_media_ids) WITH ORDINALITY AS m(id, ord)
  ORDER BY m.ord;

  RETURN QUERY
  SELECT i.slot_key, i."position", i.project_media_id
  FROM public.project_template_media_slot_items AS i
  WHERE i.project_id = p_project_id
    AND i.template_version_id = p_template_version_id
    AND i.slot_key = p_slot_key
  ORDER BY i."position";
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_template_media_slot(uuid, uuid, text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_project_template_media_slot(uuid, uuid, text, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.set_project_template_media_slot(uuid, uuid, text, uuid[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.set_project_template_media_slot(uuid, uuid, text, uuid[]) FROM service_role;

GRANT EXECUTE ON FUNCTION public.set_project_template_media_slot(uuid, uuid, text, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.set_project_template_media_slot(uuid, uuid, text, uuid[]) IS
  'TE-03B trusted business action: atomically replaces one template media slot (Project + CURRENT exact template version + slot key) with the given ordered project_media ids (positions 0..N-1; [] clears). Self-authorizes (profiles FOR UPDATE + is_staff()); locks the Project FOR KEY SHARE and project_design FOR UPDATE; compare-and-sets the current template version; validates same-Project, slot-assignable photo media. Touches no other slot, version, media, design, invitation version or pin. TMxxx error contract in the migration header.';
