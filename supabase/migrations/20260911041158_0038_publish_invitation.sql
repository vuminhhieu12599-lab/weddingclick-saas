-- WeddingClick V2 — Feature Migration 0038 (Task 031)
-- publish_invitation(): atomic, audited copy-on-publish of ONE required
-- invitation variant's approved CURRENT REVIEW version.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §8 "F. Publish Snapshot
-- Model" (copy-on-publish, never re-derived from draft), §2.13–§2.15,
-- §2.18 [R-Q2]; docs/DECISIONS.md "Task 025" (PUBLISHED is reserved for
-- publish_invitation; AWAITING_PAYMENT -> READY_TO_PUBLISH only when PAID)
-- and "Task 031 — Publish Approved Review"; docs/API_CONTRACT.md §6
-- (INVITATION_PUBLISHED / INVITATION_REPUBLISHED), §8 (Task 031).
--
-- PURPOSE (one): in ONE transaction, for one required variant,
--   1. validate the staff caller, the Project lifecycle (READY_TO_PUBLISH,
--      payment_status = PAID) and the canonical required-variant policy;
--   2. validate the invitation's CURRENT REVIEW version: present, REVIEW,
--      same invitation, APPROVED, no REVISION_REQUEST, aggregate review
--      outcome APPROVED, and not already the source of the current
--      publication;
--   3. compare-and-set on BOTH current_review_version_id and
--      published_version_id (stale -> conflict);
--   4. append one PUBLISHED invitation_versions row whose payload,
--      template_version_id and renderer_key_snapshot are copied VERBATIM
--      from that REVIEW row (INSERT ... SELECT — nothing is supplied by the
--      caller or rebuilt from draft), source_review_version_id = REVIEW id;
--   5. copy exactly the REVIEW row's invitation_version_media pins;
--   6. advance project_invitations.published_version_id;
--   7. set projects.status = PUBLISHED only when EVERY required variant's
--      published version is sourced from its current approved review;
--   8. log INVITATION_PUBLISHED / INVITATION_REPUBLISHED (+
--      PROJECT_STATUS_CHANGED when the status changes).
-- Any failure rolls back every step: no half-published state.
--
-- The caller supplies NO Snapshot, renderer key, template version, version
-- number, media list or status target: only (project, variant, expected
-- current review, expected current publication).
--
-- CONCURRENCY / NUMBERING (lock order identical to 0036/0037):
--   profiles (FOR UPDATE, self-auth) -> projects (FOR NO KEY UPDATE)
--   -> project_invitations row (FOR UPDATE).
-- version_number = max(existing for this invitation) + 1, computed only
-- while holding the invitation row lock; REVIEW and PUBLISHED rows share
-- that per-invitation sequence. UNIQUE (invitation_id, version_number) from
-- 0013 remains the backstop.
--
-- DOUBLE-SUBMIT: two identical requests carrying the same expected pointers
-- create exactly one PUBLISHED row. The second sees published_version_id
-- changed (PB010) — and, independently, that the current review is already
-- the source of the current publication (PB012).
--
-- NOT HERE: public /i/[slug] rendering, Open Graph / SOCIAL_SHARE_COVER
-- metadata, guest tokens, RSVP, payment changes, READY_TO_PUBLISH,
-- review creation/feedback, rollback/unpublish.
--
-- ERROR CONTRACT (custom SQLSTATE, mapped by
-- lib/server/invitation-publish/publish-rpc-error-codes.ts):
--   PB001  caller is not an active staff profile               -> FORBIDDEN
--   PB002  Project not found                                   -> NOT_FOUND
--   PB003  variant not required by the Project's package       -> INVARIANT
--   PB004  package code has no canonical variant policy        -> INVARIANT
--   PB005  Project status is not READY_TO_PUBLISH              -> CONFLICT LIFECYCLE_NOT_READY
--   PB006  payment_status is not PAID                          -> CONFLICT PAYMENT_NOT_READY
--   PB007  Project is PUBLISHED / COMPLETED / ARCHIVED         -> CONFLICT PROJECT_CLOSED
--   PB008  invitation has no current REVIEW version            -> CONFLICT NOT_APPROVED
--   PB009  expected current review version is stale            -> CONFLICT STALE_REVIEW
--   PB010  expected published version is stale                 -> CONFLICT STALE_PUBLISHED_VERSION
--   PB011  current review not approved / revision requested,
--          or the aggregate review outcome is not APPROVED     -> CONFLICT NOT_APPROVED
--   PB012  current review is already the current publication   -> CONFLICT ALREADY_PUBLISHED
--   PB013  integrity fault (pointer/type/media copy mismatch)  -> (unmapped, 500)
--
-- Purely additive: one new function, no table shape change, no change to
-- any earlier migration's object.

CREATE FUNCTION public.publish_invitation(
  p_project_id uuid,
  p_variant text,
  p_expected_current_review_version_id uuid,
  p_expected_published_version_id uuid
)
RETURNS TABLE (
  id uuid,
  invitation_id uuid,
  project_id uuid,
  variant text,
  version_number integer,
  source_review_version_id uuid,
  template_version_id uuid,
  renderer_key_snapshot text,
  published_at timestamptz,
  previous_published_version_id uuid,
  project_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status              text;
  v_payment_status      text;
  v_package_code        text;
  v_required            text[];
  v_invitation_id       uuid;
  v_current_review_id   uuid;
  v_published_id        uuid;
  v_review              public.invitation_versions%ROWTYPE;
  v_published_source_id uuid;
  v_next_number         integer;
  v_result              public.invitation_versions%ROWTYPE;
  v_review_media_count  integer;
  v_copied_media_count  integer;
  v_fully_published     boolean;
  v_final_status        text;
BEGIN
  -- A. Self-authorization (mirrors 0036 create_review_version).
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PB001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND OR public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PB001';
  END IF;

  -- B. Lock the Project (serializes with review creation / feedback).
  SELECT p.status, p.payment_status, p.package_code_snapshot
    INTO v_status, v_payment_status, v_package_code
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'PB002';
  END IF;

  -- C. Lifecycle + payment (Task 025 graph; PAID is never faked here).
  IF v_status IN ('PUBLISHED', 'COMPLETED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'Project is already published or closed'
      USING ERRCODE = 'PB007';
  END IF;

  IF v_payment_status IS DISTINCT FROM 'PAID' THEN
    RAISE EXCEPTION 'Project payment is not confirmed'
      USING ERRCODE = 'PB006';
  END IF;

  IF v_status IS DISTINCT FROM 'READY_TO_PUBLISH' THEN
    RAISE EXCEPTION 'Project is not ready to publish'
      USING ERRCODE = 'PB005';
  END IF;

  -- D. Canonical required-variant policy (same CASE as 0036/0037). Fail closed.
  v_required := CASE v_package_code
    WHEN 'COMMON' THEN ARRAY['COMMON']::text[]
    WHEN 'SEPARATE' THEN ARRAY['GROOM', 'BRIDE']::text[]
    ELSE NULL
  END;

  IF v_required IS NULL THEN
    RAISE EXCEPTION 'Project package has no invitation variant policy'
      USING ERRCODE = 'PB004';
  END IF;

  IF p_variant IS NULL OR NOT (p_variant = ANY (v_required)) THEN
    RAISE EXCEPTION 'Variant is not required by the Project package'
      USING ERRCODE = 'PB003';
  END IF;

  -- E. Lock the target invitation; compare-and-set on both pointers.
  SELECT pi.id, pi.current_review_version_id, pi.published_version_id
    INTO v_invitation_id, v_current_review_id, v_published_id
  FROM public.project_invitations AS pi
  WHERE pi.project_id = p_project_id
    AND pi.variant = p_variant
  FOR UPDATE;

  IF NOT FOUND OR v_current_review_id IS NULL THEN
    RAISE EXCEPTION 'Invitation has no current review version'
      USING ERRCODE = 'PB008';
  END IF;

  IF v_current_review_id IS DISTINCT FROM p_expected_current_review_version_id THEN
    RAISE EXCEPTION 'Current review version has changed'
      USING ERRCODE = 'PB009';
  END IF;

  IF v_published_id IS DISTINCT FROM p_expected_published_version_id THEN
    RAISE EXCEPTION 'Published version has changed'
      USING ERRCODE = 'PB010';
  END IF;

  -- F. The current REVIEW row itself (FK + 0013b trigger already guarantee
  -- same invitation + REVIEW type; re-checked here, fail closed).
  SELECT iv.* INTO v_review
  FROM public.invitation_versions AS iv
  WHERE iv.id = v_current_review_id;

  IF NOT FOUND
     OR v_review.version_type IS DISTINCT FROM 'REVIEW'
     OR v_review.invitation_id IS DISTINCT FROM v_invitation_id
     OR v_review.project_id IS DISTINCT FROM p_project_id
  THEN
    RAISE EXCEPTION 'Current review pointer integrity fault'
      USING ERRCODE = 'PB013';
  END IF;

  -- G. Approval of EXACTLY this version; a revision request outranks it.
  IF NOT EXISTS (
       SELECT 1 FROM public.review_feedback AS rf
       WHERE rf.invitation_version_id = v_review.id
         AND rf.project_id = p_project_id
         AND rf.feedback_type = 'APPROVAL'
     )
     OR EXISTS (
       SELECT 1 FROM public.review_feedback AS rf
       WHERE rf.invitation_version_id = v_review.id
         AND rf.project_id = p_project_id
         AND rf.feedback_type = 'REVISION_REQUEST'
     )
     OR public.review_outcome_for_project(p_project_id) IS DISTINCT FROM 'APPROVED'
  THEN
    RAISE EXCEPTION 'Current review version is not approved'
      USING ERRCODE = 'PB011';
  END IF;

  -- H. Never publish the same approved review twice.
  IF v_published_id IS NOT NULL THEN
    SELECT iv.source_review_version_id INTO v_published_source_id
    FROM public.invitation_versions AS iv
    WHERE iv.id = v_published_id;

    IF v_published_source_id IS NOT DISTINCT FROM v_review.id THEN
      RAISE EXCEPTION 'Current review version is already published'
        USING ERRCODE = 'PB012';
    END IF;
  END IF;

  -- I. Append the PUBLISHED row: copy-on-publish from the approved REVIEW.
  SELECT coalesce(max(iv.version_number), 0) + 1 INTO v_next_number
  FROM public.invitation_versions AS iv
  WHERE iv.invitation_id = v_invitation_id;

  INSERT INTO public.invitation_versions (
    invitation_id, project_id, version_number, version_type,
    source_review_version_id, template_version_id, renderer_key_snapshot,
    payload, created_by, published_at
  )
  SELECT
    src.invitation_id, src.project_id, v_next_number, 'PUBLISHED',
    src.id, src.template_version_id, src.renderer_key_snapshot,
    src.payload, auth.uid(), now()
  FROM public.invitation_versions AS src
  WHERE src.id = v_review.id
  RETURNING * INTO v_result;

  -- J. Copy exactly the approved REVIEW's media pins (never re-extracted).
  INSERT INTO public.invitation_version_media (invitation_version_id, project_media_id, project_id)
  SELECT v_result.id, ivm.project_media_id, ivm.project_id
  FROM public.invitation_version_media AS ivm
  WHERE ivm.invitation_version_id = v_review.id
    AND ivm.project_id = p_project_id;

  SELECT count(*) INTO v_review_media_count
  FROM public.invitation_version_media AS ivm
  WHERE ivm.invitation_version_id = v_review.id;

  SELECT count(*) INTO v_copied_media_count
  FROM public.invitation_version_media AS ivm
  WHERE ivm.invitation_version_id = v_result.id;

  IF v_copied_media_count <> v_review_media_count THEN
    RAISE EXCEPTION 'Published media pins do not match the approved review'
      USING ERRCODE = 'PB013';
  END IF;

  -- K. Advance the publication pointer (current_review_version_id untouched).
  UPDATE public.project_invitations AS pi SET
    published_version_id = v_result.id
  WHERE pi.id = v_invitation_id;

  -- L. Activity — ids only, never payload content.
  PERFORM public.log_activity(
    p_project_id,
    'STAFF',
    CASE WHEN v_published_id IS NULL THEN 'INVITATION_PUBLISHED' ELSE 'INVITATION_REPUBLISHED' END,
    CASE WHEN v_published_id IS NULL THEN 'Invitation published' ELSE 'Invitation republished' END,
    jsonb_build_object(
      'invitation_id', v_invitation_id,
      'invitation_version_id', v_result.id,
      'source_review_version_id', v_review.id,
      'previous_published_version_id', v_published_id,
      'variant', p_variant,
      'version_number', v_next_number,
      'template_version_id', v_result.template_version_id
    )
  );

  -- M. Aggregate publication: every REQUIRED variant's current publication
  -- must be sourced from its current (approved) review. Rows for variants
  -- the package does not require are ignored.
  SELECT NOT EXISTS (
    SELECT 1
    FROM unnest(v_required) AS r(v)
    LEFT JOIN public.project_invitations AS pi
      ON pi.project_id = p_project_id AND pi.variant = r.v
    LEFT JOIN public.invitation_versions AS pv
      ON pv.id = pi.published_version_id
     AND pv.version_type = 'PUBLISHED'
    WHERE pi.id IS NULL
       OR pi.current_review_version_id IS NULL
       OR pv.id IS NULL
       OR pv.source_review_version_id IS DISTINCT FROM pi.current_review_version_id
  ) INTO v_fully_published;

  v_final_status := v_status;
  IF v_fully_published THEN
    UPDATE public.projects AS p SET
      status = 'PUBLISHED'
    WHERE p.id = p_project_id;

    PERFORM public.log_activity(
      p_project_id,
      'STAFF',
      'PROJECT_STATUS_CHANGED',
      'Project status changed',
      jsonb_build_object(
        'from_status', v_status,
        'to_status', 'PUBLISHED',
        'source', 'INVITATION_PUBLISHED'
      )
    );
    v_final_status := 'PUBLISHED';
  END IF;

  RETURN QUERY SELECT
    v_result.id, v_result.invitation_id, v_result.project_id, p_variant,
    v_result.version_number, v_result.source_review_version_id,
    v_result.template_version_id, v_result.renderer_key_snapshot,
    v_result.published_at, v_published_id, v_final_status;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_invitation(uuid, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_invitation(uuid, text, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.publish_invitation(uuid, text, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.publish_invitation(uuid, text, uuid, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.publish_invitation(uuid, text, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.publish_invitation(uuid, text, uuid, uuid) IS
  'Audited copy-on-publish of one required invitation variant (Task 031) — TRUSTED BUSINESS ACTION, staff-only. Self-authorizes (profiles FOR UPDATE + is_staff()); locks the Project FOR NO KEY UPDATE; requires status READY_TO_PUBLISH and payment_status PAID; applies the canonical package->required-variant policy; locks the invitation row; compare-and-set on current_review_version_id and published_version_id; requires an APPROVAL and no REVISION_REQUEST on exactly the current REVIEW version and an APPROVED aggregate outcome; rejects republishing the same review; appends one PUBLISHED invitation_versions row copied verbatim from that REVIEW (payload, template_version_id, renderer_key_snapshot; source_review_version_id set); copies its invitation_version_media pins; advances published_version_id; sets projects.status = PUBLISHED only when every required variant''s publication is sourced from its current review; logs INVITATION_PUBLISHED/INVITATION_REPUBLISHED (+ PROJECT_STATUS_CHANGED). Never touches payment_status, never rebuilds from draft. See this migration''s header.';
