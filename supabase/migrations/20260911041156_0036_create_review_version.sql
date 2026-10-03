-- WeddingClick V2 — Feature Migration 0036 (Task 030)
-- create_review_version(): atomic, audited REVIEW snapshot creation.
--
-- Source of truth: docs/API_CONTRACT.md §3 ("operations requiring
-- cross-table atomicity (review snapshot creation, publish) are business
-- actions"), §6 (INVITATION_REVIEW_CREATED), §8 (Task 030);
-- docs/PHYSICAL_DATABASE_PLAN.md §2.13–§2.15, §2.18 [R-Q2];
-- docs/DECISIONS.md "Task 030 — Review Snapshot Foundation".
--
-- PURPOSE (one): in ONE transaction,
--   1. ensure the Project's REQUIRED project_invitations rows exist
--      (canonical variant policy below; public_slug via the existing 0012
--      BEFORE INSERT trigger; existing rows are never changed);
--   2. append one immutable REVIEW invitation_versions row for one variant;
--   3. pin exactly the supplied media references in invitation_version_media;
--   4. advance project_invitations.current_review_version_id to it;
--   5. log INVITATION_REVIEW_CREATED.
-- A failure at any step rolls back every step: no version without its
-- pointer, no pointer to an incomplete version, no orphan media pins.
--
-- CANONICAL REQUIRED-VARIANT POLICY (projects.package_code_snapshot):
--   COMMON   -> {COMMON}
--   SEPARATE -> {GROOM, BRIDE}
-- (docs/DECISIONS.md "Commercial Packages", docs/PRODUCT.md §3,
-- docs/PHYSICAL_DATABASE_PLAN.md §2.18 [R-Q2], lib/domain/
-- service-package-code.ts.) The TypeScript mirror is
-- lib/domain/invitation-variant-policy.ts; a static test asserts both agree.
-- Any other package code fails closed (RV004) — never guessed.
--
-- SERVER-AUTHORITATIVE SNAPSHOT: p_payload / p_template_version_id /
-- p_renderer_key / p_media_ids are produced by the trusted Next.js staff
-- use case from the canonical draft (never browser input). This function
-- independently re-checks that they agree with the Project's CURRENT
-- project_design binding and the pinned template_versions.renderer_key, and
-- that the payload's own variant/template/project-code fields agree.
--
-- CONCURRENCY / NUMBERING: the Project row is locked FOR NO KEY UPDATE
-- (serializes review creation per Project, including the ensure-rows
-- INSERT; does not block FK KEY SHARE locks), then the target invitation
-- row FOR UPDATE. version_number = max(existing for this invitation) + 1
-- is computed only while holding that lock; UNIQUE (invitation_id,
-- version_number) from 0013 remains the backstop.
--
-- DOUBLE-SUBMIT: p_expected_current_review_version_id is a compare-and-set
-- token. It must equal the invitation's current_review_version_id (NULL
-- for "no review yet") under the lock, otherwise RV008 (CONFLICT). Two
-- identical requests carrying the same expectation therefore create
-- exactly one version; the second is rejected as stale.
--
-- NOT HERE: PUBLISHED versions, published_version_id, project status
-- transitions, review links, customer feedback, guests, RSVP.
--
-- ERROR CONTRACT (custom SQLSTATE, mapped by
-- lib/server/invitation-review/review-rpc-error-codes.ts):
--   RV001  caller is not an active staff profile             -> FORBIDDEN
--   RV002  Project not found                                 -> NOT_FOUND
--   RV003  variant not required by the Project's package     -> INVARIANT
--   RV004  package code has no canonical variant policy      -> INVARIANT
--   RV005  Project has no design                              -> CONFLICT
--   RV006  template/renderer binding differs from the design  -> CONFLICT
--   RV007  payload inconsistent with the supplied binding     -> (unmapped, 500)
--   RV008  expected current review version is stale          -> CONFLICT
--   RV009  a media reference is not a row of this Project     -> CONFLICT
--
-- Purely additive: no table shape change, no change to any earlier
-- migration's object.

CREATE FUNCTION public.create_review_version(
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
  SELECT p.project_code, p.package_code_snapshot
    INTO v_project_code, v_package_code
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'RV002';
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
  'Audited REVIEW snapshot creation (Task 030) — TRUSTED BUSINESS ACTION, staff-only. Self-authorizes (profiles FOR UPDATE + is_staff()); locks the Project FOR NO KEY UPDATE; applies the canonical package->required-variant policy (COMMON->{COMMON}, SEPARATE->{GROOM,BRIDE}); re-checks the exact project_design template_version_id and template_versions.renderer_key; ensures required project_invitations rows; compare-and-set on current_review_version_id; appends one REVIEW invitation_versions row (max+1 under the invitation row lock); pins media; advances current_review_version_id; logs INVITATION_REVIEW_CREATED. Never touches published_version_id or project status. See this migration''s header.';
