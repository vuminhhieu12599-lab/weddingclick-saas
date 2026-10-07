-- WeddingClick V2 — Feature Migration 0044 (Launch Hardening 04 / P0-2)
-- Republish after PUBLISHED: allow a new REVIEW version from PUBLISHED.
--
-- Source of truth: docs/DECISIONS.md "Launch Hardening 01" owner decisions
-- D2/D3 and "Launch Hardening 04"; docs/API_CONTRACT.md §35.
--
-- AUTHORING ONLY — not applied. The Product Owner applies it manually.
--
-- PURPOSE (one): CREATE OR REPLACE public.create_review_version (same
-- signature as 0036/0037, neither of which is edited) so that its RV010
-- guard rejects only COMPLETED and ARCHIVED. PUBLISHED becomes an allowed
-- source status. The body is otherwise copied verbatim from 0037:
--   - SECURITY DEFINER, SET search_path = '', same lock order, same
--     RV001..RV010 error contract, same CAS on current_review_version_id;
--   - appends one immutable REVIEW row and advances current_review_version_id
--     only; published_version_id, payment_status, public_slug, guests,
--     access links and rsvps are never written;
--   - persists the recomputed aggregate review outcome (PUBLISHED ->
--     CUSTOMER_REVIEW for a post-publish correction), logging
--     PROJECT_STATUS_CHANGED + INVITATION_REVIEW_CREATED exactly as 0037;
--   - same REVOKE/GRANT (EXECUTE to authenticated only) and COMMENT style.
--
-- Why this is enough (audited, nothing else changes):
--   - publish_invitation (0038) already appends a new PUBLISHED row with
--     CAS on both pointers and logs INVITATION_REPUBLISHED when a previous
--     publication exists;
--   - the existing manual graph APPROVED -> AWAITING_PAYMENT ->
--     READY_TO_PUBLISH (only if PAID) (0024) is reused; PAID stays PAID;
--   - public read, RSVP, share cover and personalized guest reads
--     (0039-0042) resolve published_version_id, never projects.status, so
--     the old publication stays live until the explicit republish;
--   - public_slug is frozen after first publish (0013b).
--
-- Forward-only. No table, column, policy, trigger, data or other function
-- changes. A post-condition block verifies the replaced function.

-- ===========================================================================
-- 1. create_review_version (replacement; 0036 and 0037 left untouched)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.create_review_version(
  p_project_id uuid,
  p_variant text,
  p_expected_current_review_version_id uuid,
  p_template_version_id uuid,
  p_renderer_key text,
  p_payload jsonb,
  p_media_ids uuid[]
)
RETURNS TABLE (
  id uuid,
  invitation_id uuid,
  project_id uuid,
  variant text,
  version_number integer,
  template_version_id uuid,
  renderer_key_snapshot text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_code        text;
  v_project_status      text;
  v_outcome             text;
  v_package_code        text;
  v_required            text[];
  v_design_tv_id        uuid;
  v_tv_renderer_key     text;
  v_invitation_id       uuid;
  v_current_review_id   uuid;
  v_next_number         integer;
  v_media_ids           uuid[];
  v_owned_media_count   integer;
  v_result              public.invitation_versions%ROWTYPE;
BEGIN
  -- A. Self-authorization (mirrors 0025 issue_review_link).
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'RV001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND OR public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'RV001';
  END IF;

  -- B. Lock the Project (per-Project serialization) and read its package.
  SELECT p.project_code, p.package_code_snapshot, p.status
    INTO v_project_code, v_package_code, v_project_status
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'RV002';
  END IF;

  -- B2. [0044] Owner decision D2 (Launch Hardening 01): a new review may be
  -- created from PUBLISHED (post-publish correction); never from COMPLETED
  -- or ARCHIVED. The live publication is untouched here (published_version_id
  -- is never written by this function). Fail closed.
  IF v_project_status IN ('COMPLETED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'Project status does not allow a new review version'
      USING ERRCODE = 'RV010';
  END IF;

  -- C. Canonical required-variant policy (header). Fail closed.
  v_required := CASE v_package_code
    WHEN 'COMMON' THEN ARRAY['COMMON']::text[]
    WHEN 'SEPARATE' THEN ARRAY['GROOM', 'BRIDE']::text[]
    ELSE NULL
  END;

  IF v_required IS NULL THEN
    RAISE EXCEPTION 'Project package has no invitation variant policy'
      USING ERRCODE = 'RV004';
  END IF;

  IF p_variant IS NULL OR NOT (p_variant = ANY (v_required)) THEN
    RAISE EXCEPTION 'Variant is not required by the Project package'
      USING ERRCODE = 'RV003';
  END IF;

  -- D. Exact design/template/renderer binding.
  SELECT d.template_version_id INTO v_design_tv_id
  FROM public.project_design AS d
  WHERE d.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project design is not configured'
      USING ERRCODE = 'RV005';
  END IF;

  SELECT tv.renderer_key INTO v_tv_renderer_key
  FROM public.template_versions AS tv
  WHERE tv.id = v_design_tv_id;

  IF p_template_version_id IS DISTINCT FROM v_design_tv_id
     OR p_renderer_key IS DISTINCT FROM v_tv_renderer_key
  THEN
    RAISE EXCEPTION 'Review binding does not match the current Project design'
      USING ERRCODE = 'RV006';
  END IF;

  -- E. Payload self-consistency (server-built; defense in depth).
  IF p_payload IS NULL
     OR jsonb_typeof(p_payload) <> 'object'
     OR (p_payload ->> 'payloadSchemaVersion') IS DISTINCT FROM '1'
     OR (p_payload ->> 'variant') IS DISTINCT FROM p_variant
     OR (p_payload -> 'template' ->> 'templateVersionId') IS DISTINCT FROM p_template_version_id::text
     OR (p_payload -> 'template' ->> 'rendererKey') IS DISTINCT FROM p_renderer_key
     OR (p_payload -> 'project' ->> 'code') IS DISTINCT FROM v_project_code
  THEN
    RAISE EXCEPTION 'Review payload is inconsistent with its binding'
      USING ERRCODE = 'RV007';
  END IF;

  -- F. Media references must all be rows of this Project.
  SELECT coalesce(array_agg(DISTINCT m), ARRAY[]::uuid[]) INTO v_media_ids
  FROM unnest(coalesce(p_media_ids, ARRAY[]::uuid[])) AS m
  WHERE m IS NOT NULL;

  SELECT count(*) INTO v_owned_media_count
  FROM public.project_media AS pm
  WHERE pm.id = ANY (v_media_ids)
    AND pm.project_id = p_project_id;

  IF v_owned_media_count <> cardinality(v_media_ids) THEN
    RAISE EXCEPTION 'Review media reference does not belong to the Project'
      USING ERRCODE = 'RV009';
  END IF;

  -- G. Ensure every required invitation row exists (existing rows untouched;
  -- public_slug assigned by the 0012 trigger).
  INSERT INTO public.project_invitations (project_id, variant, created_by)
  SELECT p_project_id, r.v, auth.uid()
  FROM unnest(v_required) AS r(v)
  ON CONFLICT ON CONSTRAINT project_invitations_project_id_variant_key DO NOTHING;

  -- H. Lock the target invitation and check the compare-and-set token.
  SELECT pi.id, pi.current_review_version_id
    INTO v_invitation_id, v_current_review_id
  FROM public.project_invitations AS pi
  WHERE pi.project_id = p_project_id
    AND pi.variant = p_variant
  FOR UPDATE;

  IF v_current_review_id IS DISTINCT FROM p_expected_current_review_version_id THEN
    RAISE EXCEPTION 'Current review version has changed'
      USING ERRCODE = 'RV008';
  END IF;

  SELECT coalesce(max(iv.version_number), 0) + 1 INTO v_next_number
  FROM public.invitation_versions AS iv
  WHERE iv.invitation_id = v_invitation_id;

  -- I. Append the immutable REVIEW version.
  INSERT INTO public.invitation_versions (
    invitation_id, project_id, version_number, version_type,
    template_version_id, renderer_key_snapshot, payload, created_by
  ) VALUES (
    v_invitation_id, p_project_id, v_next_number, 'REVIEW',
    p_template_version_id, p_renderer_key, p_payload, auth.uid()
  )
  RETURNING * INTO v_result;

  -- J. Pin exactly the referenced media.
  INSERT INTO public.invitation_version_media (invitation_version_id, project_media_id, project_id)
  SELECT v_result.id, m, p_project_id
  FROM unnest(v_media_ids) AS m;

  -- K. Advance the current review pointer (published_version_id untouched).
  UPDATE public.project_invitations AS pi SET
    current_review_version_id = v_result.id
  WHERE pi.id = v_invitation_id;

  -- K2. [0037] Owner decisions (Task 030B, A/D/G + final invariant): after
  -- the new version is current, recompute the aggregate outcome over ALL
  -- required current variants and persist it, in this same transaction.
  -- The saved status never disagrees with the aggregate outcome. Never
  -- touches payment_status, READY_TO_PUBLISH or PUBLISHED.
  v_outcome := public.review_outcome_for_project(p_project_id);
  IF v_outcome IS NULL THEN
    -- Unreachable (policy checked in C); fail closed rather than guess.
    RAISE EXCEPTION 'Project package has no invitation variant policy'
      USING ERRCODE = 'RV004';
  END IF;

  IF v_outcome IS DISTINCT FROM v_project_status THEN
    UPDATE public.projects AS p SET
      status = v_outcome
    WHERE p.id = p_project_id;

    PERFORM public.log_activity(
      p_project_id,
      'STAFF',
      'PROJECT_STATUS_CHANGED',
      'Project status changed',
      jsonb_build_object(
        'from_status', v_project_status,
        'to_status', v_outcome,
        'source', 'INVITATION_REVIEW_CREATED'
      )
    );
  END IF;

  -- L. Activity — ids only, never payload content.
  PERFORM public.log_activity(
    p_project_id,
    'STAFF',
    'INVITATION_REVIEW_CREATED',
    'Invitation review version created',
    jsonb_build_object(
      'invitation_id', v_invitation_id,
      'invitation_version_id', v_result.id,
      'variant', p_variant,
      'version_number', v_next_number,
      'template_version_id', p_template_version_id
    )
  );

  RETURN QUERY SELECT
    v_result.id, v_result.invitation_id, v_result.project_id, p_variant,
    v_result.version_number, v_result.template_version_id,
    v_result.renderer_key_snapshot, v_result.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_review_version(uuid, text, uuid, uuid, text, jsonb, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_review_version(uuid, text, uuid, uuid, text, jsonb, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.create_review_version(uuid, text, uuid, uuid, text, jsonb, uuid[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_review_version(uuid, text, uuid, uuid, text, jsonb, uuid[]) FROM service_role;
GRANT EXECUTE ON FUNCTION public.create_review_version(uuid, text, uuid, uuid, text, jsonb, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.create_review_version(uuid, text, uuid, uuid, text, jsonb, uuid[]) IS
  'Audited REVIEW snapshot creation (Task 030; replaced by 0037, then 0044) — TRUSTED BUSINESS ACTION, staff-only. Self-authorizes (profiles FOR UPDATE + is_staff()); locks the Project FOR NO KEY UPDATE; rejects COMPLETED/ARCHIVED (RV010) and allows PUBLISHED for a post-publish correction (0044, owner decision D2); applies the canonical package->required-variant policy (COMMON->{COMMON}, SEPARATE->{GROOM,BRIDE}); re-checks the exact project_design binding; ensures required project_invitations rows; compare-and-set on current_review_version_id; appends one REVIEW invitation_versions row; pins media; advances current_review_version_id; persists the recomputed aggregate review outcome over all required current variants — CUSTOMER_REVIEW unless another required variant still has an unreplaced REVISION_REQUEST (logging PROJECT_STATUS_CHANGED when it changes); logs INVITATION_REVIEW_CREATED. Never touches published_version_id or payment_status. See migrations 0036/0037/0044.';

-- ===========================================================================
-- 2. Post-conditions (fail the migration rather than leave a wrong function)
-- ===========================================================================
DO $$
DECLARE
  v_fn regprocedure := 'public.create_review_version(uuid, text, uuid, uuid, text, jsonb, uuid[])'::regprocedure;
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc AS p WHERE p.oid = v_fn;

  IF NOT (SELECT p.prosecdef FROM pg_proc AS p WHERE p.oid = v_fn) THEN
    RAISE EXCEPTION '0044: create_review_version must stay SECURITY DEFINER';
  END IF;
  IF NOT coalesce((SELECT 'search_path=""' = ANY (p.proconfig) FROM pg_proc AS p WHERE p.oid = v_fn), false) THEN
    RAISE EXCEPTION '0044: create_review_version must keep an empty search_path';
  END IF;
  IF position('IN (''COMPLETED'', ''ARCHIVED'')' IN v_src) = 0
     OR position('''PUBLISHED'', ''COMPLETED'', ''ARCHIVED''' IN v_src) > 0
  THEN
    RAISE EXCEPTION '0044: RV010 guard is not exactly COMPLETED/ARCHIVED';
  END IF;
  IF v_src ~ 'published_version_id\s*='
     OR v_src ~ 'payment_status\s*='
  THEN
    RAISE EXCEPTION '0044: create_review_version must not write publication or payment state';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
  THEN
    RAISE EXCEPTION '0044: create_review_version EXECUTE grants changed';
  END IF;
END;
$$;
