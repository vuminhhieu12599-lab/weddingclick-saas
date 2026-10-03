-- WeddingClick V2 — Feature Migration 0037 (Task 030B)
-- Customer REVIEW read + feedback/approval + review status lifecycle.
--
-- Source of truth: Product Owner decisions recorded in docs/DECISIONS.md
-- "Task 030B — Customer Review, Approval and Review Status Lifecycle";
-- docs/API_CONTRACT.md §1 (Path B), §4 (token resolution), §6 (activity
-- union), §16/§17; docs/PHYSICAL_DATABASE_PLAN.md §2.18 [R-Q2].
--
-- PURPOSE (one): make the customer half of Task 030 possible without any
-- broad table grant. Contents:
--   1. CREATE OR REPLACE create_review_version (same signature as 0036,
--      which is NOT edited): adds RV010 (no review from PUBLISHED /
--      COMPLETED / ARCHIVED) and, in the same transaction, recomputes
--      the aggregate review outcome over ALL required current variants
--      and persists it (owner decisions A/D/G + final invariant: the saved
--      status never disagrees with the aggregate outcome). The new version
--      itself is unapproved, so this is CUSTOMER_REVIEW unless another
--      required variant still has an unreplaced REVISION_REQUEST.
--   2. review_outcome_for_project(): PRIVATE helper (no EXECUTE for any
--      external role) implementing the owner status precedence:
--        any required variant's CURRENT review has a REVISION_REQUEST
--                                                  -> REVISION_REQUIRED
--        else every required variant's CURRENT review has an APPROVAL
--                                                  -> APPROVED
--        else                                      -> CUSTOMER_REVIEW
--   3. get_customer_review(): service_role-only SECURITY DEFINER read for
--      the customer REVIEW page. Re-validates the already-resolved REVIEW
--      access-link context, then returns ONLY the required variants'
--      CURRENT REVIEW versions (persisted payload + pinned binding), the
--      project_media storage references pinned to exactly those versions
--      through invitation_version_media, and those versions' feedback.
--   4. submit_review_feedback(): service_role-only SECURITY DEFINER
--      business action. Re-validates the REVIEW link under lock, binds to
--      the exact CURRENT review version, appends one canonical
--      review_feedback row, logs the frozen activity type, and recomputes
--      + sets the Project review status — all in ONE transaction.
--   5. REVOKE the 0016 table-level INSERT on review_feedback from
--      service_role (mirrors 0026 for intake_submissions): customer
--      feedback now reaches the table only through submit_review_feedback.
--      service_role keeps NO SELECT/INSERT/UPDATE/DELETE on review_feedback.
--
-- TOKEN BOUNDARY (Path B, unchanged): the raw token never enters the
-- database. lib/server/access-links/resolve-access-link.ts hashes and
-- resolves it (404 / 410 semantics, last_used_at) and passes only
-- { project id, access-link id } here. Both customer RPCs re-check that
-- context (existence / project / REVIEW purpose collapsed to RV011, then
-- revoked RV012, then expired RV013) before reading anything else.
-- REVIEW links are Project-scoped and live across revision rounds
-- ([R-Q2]); the version a customer acts on is always re-bound to the
-- invitation's CURRENT review under the invitation row lock.
--
-- FEEDBACK RULES (fail closed):
--   * every customer feedback type — COMMENT included — must target the
--     CURRENT review version of a REQUIRED variant (RV016 otherwise); a
--     superseded version can never be commented on, approved or revised;
--   * feedback is accepted only while projects.status is CUSTOMER_REVIEW,
--     REVISION_REQUIRED or APPROVED (RV017 otherwise) — a customer can
--     never move a Project out of AWAITING_PAYMENT / READY_TO_PUBLISH or
--     any earlier/later state;
--   * COMMENT and REVISION_REQUEST need a non-blank message; APPROVAL's
--     message is optional; max 2000 characters (0016 CHECK);
--   * the first decision on a version is FINAL (RV018 otherwise):
--     APPROVAL is rejected when the version already has an APPROVAL (0016
--     unique index stays the backstop) or a REVISION_REQUEST (it still
--     requires replacement); REVISION_REQUEST is rejected when the version
--     already has an APPROVAL (no approval withdrawal — changes after an
--     approval need a NEW review version, which needs fresh approval).
--     COMMENT stays allowed on the current version and never changes status;
--   * COMMENT never changes project status and logs no activity (no
--     COMMENT type exists in the frozen union, API_CONTRACT §6);
--   * REVISION_REQUEST logs REVISION_REQUESTED; APPROVAL logs
--     CUSTOMER_APPROVED; a resulting status change logs
--     PROJECT_STATUS_CHANGED — all actor CUSTOMER, ids-only metadata.
--
-- NEVER HERE: payment_status, READY_TO_PUBLISH, PUBLISHED, PUBLISHED
-- invitation_versions, published_version_id, guests, RSVP, public slugs.
-- APPROVED does not imply PAID or READY_TO_PUBLISH (Task 025 graph keeps
-- APPROVED -> AWAITING_PAYMENT -> READY_TO_PUBLISH [PAID]).
--
-- LOCK ORDER (no cycle with 0025/0036/0016): access link -> Project
-- (FOR NO KEY UPDATE, same mode as create_review_version, so feedback and
-- review creation for one Project serialize) -> project_invitations row
-- (FOR UPDATE; the 0016 approval guard re-locks the same row).
--
-- ERROR CONTRACT (continues 0036's RV range; mapped by
-- lib/server/invitation-review/review-rpc-error-codes.ts and
-- lib/server/customer-review/customer-review-rpc-error-codes.ts):
--   RV010  create: Project status forbids a new review    -> CONFLICT
--   RV011  access-link context invalid / wrong project / not REVIEW
--                                                          -> NOT_FOUND
--   RV012  access link revoked                             -> REVOKED_TOKEN
--   RV013  access link expired                             -> EXPIRED_TOKEN
--   RV014  invalid feedback type or message                -> BAD_REQUEST
--   RV015  version not a REVIEW version of a required variant of this
--          Project                                         -> NOT_FOUND
--   RV016  version is not the invitation's CURRENT review  -> CONFLICT
--   RV017  Project status is not open for customer feedback -> CONFLICT
--   RV018  decision not allowed on this version (APPROVAL after any
--          decision, or REVISION_REQUEST after APPROVAL)   -> CONFLICT
--
-- Purely additive apart from the create_review_version replacement and the
-- single REVOKE: no table shape change.

-- ===========================================================================
-- 1. create_review_version (replacement; 0036 left untouched)
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

  -- B2. [0037] Post-publication lifecycle states are Task 031's concern;
  -- a review is never (re)opened from them here. Fail closed.
  IF v_project_status IN ('PUBLISHED', 'COMPLETED', 'ARCHIVED') THEN
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
  'Audited REVIEW snapshot creation (Task 030; replaced by 0037) — TRUSTED BUSINESS ACTION, staff-only. Self-authorizes (profiles FOR UPDATE + is_staff()); locks the Project FOR NO KEY UPDATE; rejects PUBLISHED/COMPLETED/ARCHIVED (RV010); applies the canonical package->required-variant policy (COMMON->{COMMON}, SEPARATE->{GROOM,BRIDE}); re-checks the exact project_design binding; ensures required project_invitations rows; compare-and-set on current_review_version_id; appends one REVIEW invitation_versions row; pins media; advances current_review_version_id; persists the recomputed aggregate review outcome over all required current variants — CUSTOMER_REVIEW unless another required variant still has an unreplaced REVISION_REQUEST (logging PROJECT_STATUS_CHANGED when it changes); logs INVITATION_REVIEW_CREATED. Never touches published_version_id or payment_status. See migrations 0036/0037.';

-- ===========================================================================
-- 2. review_outcome_for_project (PRIVATE helper)
-- ===========================================================================
CREATE FUNCTION public.review_outcome_for_project(p_project_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_required text[];
BEGIN
  SELECT CASE p.package_code_snapshot
    WHEN 'COMMON' THEN ARRAY['COMMON']::text[]
    WHEN 'SEPARATE' THEN ARRAY['GROOM', 'BRIDE']::text[]
    ELSE NULL
  END INTO v_required
  FROM public.projects AS p
  WHERE p.id = p_project_id;

  IF v_required IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Any required variant's CURRENT review carries a REVISION_REQUEST.
  IF EXISTS (
    SELECT 1
    FROM unnest(v_required) AS r(v)
    JOIN public.project_invitations AS pi
      ON pi.project_id = p_project_id AND pi.variant = r.v
    JOIN public.review_feedback AS rf
      ON rf.invitation_version_id = pi.current_review_version_id
     AND rf.project_id = p_project_id
     AND rf.feedback_type = 'REVISION_REQUEST'
  ) THEN
    RETURN 'REVISION_REQUIRED';
  END IF;

  -- 2. Every required variant has a CURRENT review carrying an APPROVAL.
  IF NOT EXISTS (
    SELECT 1
    FROM unnest(v_required) AS r(v)
    LEFT JOIN public.project_invitations AS pi
      ON pi.project_id = p_project_id AND pi.variant = r.v
    WHERE pi.current_review_version_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.review_feedback AS rf
         WHERE rf.invitation_version_id = pi.current_review_version_id
           AND rf.project_id = p_project_id
           AND rf.feedback_type = 'APPROVAL'
       )
  ) THEN
    RETURN 'APPROVED';
  END IF;

  RETURN 'CUSTOMER_REVIEW';
END;
$$;

REVOKE ALL ON FUNCTION public.review_outcome_for_project(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_outcome_for_project(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.review_outcome_for_project(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.review_outcome_for_project(uuid) FROM service_role;

COMMENT ON FUNCTION public.review_outcome_for_project(uuid) IS
  'PRIVATE helper (Task 030B, 0037) — no EXECUTE for any external role; called only from create_review_version and submit_review_feedback. Owner precedence over the REQUIRED variants'' CURRENT review versions: any REVISION_REQUEST -> REVISION_REQUIRED; else all APPROVAL -> APPROVED; else CUSTOMER_REVIEW. NULL when the package has no variant policy. TypeScript mirror: lib/domain/review-outcome.ts.';

-- ===========================================================================
-- 3. get_customer_review (service_role only, after token resolution)
-- ===========================================================================
CREATE FUNCTION public.get_customer_review(
  p_project_id uuid,
  p_access_link_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link_type    text;
  v_link_project uuid;
  v_revoked_at   timestamptz;
  v_expires_at   timestamptz;
  v_status       text;
  v_package_code text;
  v_required     text[];
  v_variants     jsonb;
BEGIN
  -- A. Re-validate the resolved REVIEW access-link context first.
  SELECT l.link_type, l.project_id, l.revoked_at, l.expires_at
    INTO v_link_type, v_link_project, v_revoked_at, v_expires_at
  FROM public.project_access_links AS l
  WHERE l.id = p_access_link_id;

  IF NOT FOUND
     OR v_link_project IS DISTINCT FROM p_project_id
     OR v_link_type IS DISTINCT FROM 'REVIEW'
  THEN
    RAISE EXCEPTION 'Review access link not found'
      USING ERRCODE = 'RV011';
  END IF;
  IF v_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Review access link has been revoked'
      USING ERRCODE = 'RV012';
  END IF;
  IF v_expires_at IS NOT NULL AND v_expires_at <= now() THEN
    RAISE EXCEPTION 'Review access link has expired'
      USING ERRCODE = 'RV013';
  END IF;

  -- B. Project status + canonical required-variant policy.
  SELECT p.status, p.package_code_snapshot INTO v_status, v_package_code
  FROM public.projects AS p
  WHERE p.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review access link not found'
      USING ERRCODE = 'RV011';
  END IF;

  v_required := CASE v_package_code
    WHEN 'COMMON' THEN ARRAY['COMMON']::text[]
    WHEN 'SEPARATE' THEN ARRAY['GROOM', 'BRIDE']::text[]
    ELSE NULL
  END;

  -- C. Only the required variants' CURRENT REVIEW versions, their pinned
  -- media references, and their own feedback. Never the mutable draft,
  -- never unpinned project_media, never another Project's rows.
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'variant', r.v,
      'review', CASE WHEN iv.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', iv.id,
        'invitationId', iv.invitation_id,
        'versionNumber', iv.version_number,
        'templateVersionId', iv.template_version_id,
        'rendererKey', iv.renderer_key_snapshot,
        'createdAt', iv.created_at,
        'payload', iv.payload,
        'media', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', pm.id,
            'storageBucket', pm.storage_bucket,
            'storagePath', pm.storage_path,
            'width', pm.width,
            'height', pm.height
          ) ORDER BY pm.id), '[]'::jsonb)
          FROM public.invitation_version_media AS ivm
          JOIN public.project_media AS pm
            ON pm.id = ivm.project_media_id
           AND pm.project_id = p_project_id
          WHERE ivm.invitation_version_id = iv.id
            AND ivm.project_id = p_project_id
        ),
        'feedback', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', rf.id,
            'feedbackType', rf.feedback_type,
            'message', rf.message,
            'createdAt', rf.created_at
          ) ORDER BY rf.created_at, rf.id), '[]'::jsonb)
          FROM public.review_feedback AS rf
          WHERE rf.invitation_version_id = iv.id
            AND rf.project_id = p_project_id
        )
      ) END
    ) ORDER BY r.ord
  ), '[]'::jsonb) INTO v_variants
  FROM unnest(coalesce(v_required, ARRAY[]::text[])) WITH ORDINALITY AS r(v, ord)
  LEFT JOIN public.project_invitations AS pi
    ON pi.project_id = p_project_id AND pi.variant = r.v
  LEFT JOIN public.invitation_versions AS iv
    ON iv.id = pi.current_review_version_id
   AND iv.invitation_id = pi.id
   AND iv.project_id = p_project_id
   AND iv.version_type = 'REVIEW';

  RETURN jsonb_build_object(
    'projectId', p_project_id,
    'projectStatus', v_status,
    'hasVariantPolicy', v_required IS NOT NULL,
    'feedbackOpen', v_status IN ('CUSTOMER_REVIEW', 'REVISION_REQUIRED', 'APPROVED'),
    'variants', v_variants
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_review(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_review(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_customer_review(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_customer_review(uuid, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_review(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.get_customer_review(uuid, uuid) IS
  'Customer REVIEW read (Task 030B, 0037) — service_role-exclusive, called only after lib/server/access-links/resolve-access-link.ts validated the raw REVIEW token. Re-validates the access-link context (RV011 not found/wrong project/not REVIEW, RV012 revoked, RV013 expired), then returns only the REQUIRED variants'' CURRENT REVIEW versions (persisted payload + pinned renderer binding), the project_media storage references pinned to exactly those versions via invitation_version_media, and those versions'' feedback. No draft data, no unpinned media, no staff metadata.';

-- ===========================================================================
-- 4. submit_review_feedback (service_role only, after token resolution)
-- ===========================================================================
CREATE FUNCTION public.submit_review_feedback(
  p_project_id uuid,
  p_access_link_id uuid,
  p_invitation_version_id uuid,
  p_feedback_type text,
  p_message text
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  invitation_version_id uuid,
  feedback_type text,
  created_at timestamptz,
  project_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link_type      text;
  v_link_project   uuid;
  v_revoked_at     timestamptz;
  v_expires_at     timestamptz;
  v_message        text;
  v_status         text;
  v_package_code   text;
  v_required       text[];
  v_invitation_id  uuid;
  v_variant        text;
  v_current_id     uuid;
  v_outcome        text;
  v_final_status   text;
  v_feedback       public.review_feedback%ROWTYPE;
BEGIN
  -- A. Re-validate the resolved REVIEW access-link context under lock
  -- (closes the resolution-to-submit race with revoke/rotate).
  SELECT l.link_type, l.project_id, l.revoked_at, l.expires_at
    INTO v_link_type, v_link_project, v_revoked_at, v_expires_at
  FROM public.project_access_links AS l
  WHERE l.id = p_access_link_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_link_project IS DISTINCT FROM p_project_id
     OR v_link_type IS DISTINCT FROM 'REVIEW'
  THEN
    RAISE EXCEPTION 'Review access link not found'
      USING ERRCODE = 'RV011';
  END IF;
  IF v_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Review access link has been revoked'
      USING ERRCODE = 'RV012';
  END IF;
  IF v_expires_at IS NOT NULL AND v_expires_at <= now() THEN
    RAISE EXCEPTION 'Review access link has expired'
      USING ERRCODE = 'RV013';
  END IF;

  -- B. Input: canonical type only; message trimmed, blank -> NULL.
  IF p_feedback_type IS NULL
     OR p_feedback_type NOT IN ('COMMENT', 'REVISION_REQUEST', 'APPROVAL')
  THEN
    RAISE EXCEPTION 'Feedback type is not recognized'
      USING ERRCODE = 'RV014';
  END IF;

  v_message := regexp_replace(p_message, '^\s+|\s+$', '', 'g');
  IF v_message = '' THEN
    v_message := NULL;
  END IF;
  IF v_message IS NOT NULL AND char_length(v_message) > 2000 THEN
    RAISE EXCEPTION 'Message must be 2000 characters or fewer'
      USING ERRCODE = 'RV014';
  END IF;
  IF v_message IS NULL AND p_feedback_type IN ('COMMENT', 'REVISION_REQUEST') THEN
    RAISE EXCEPTION 'Message is required for this feedback type'
      USING ERRCODE = 'RV014';
  END IF;

  -- C. Lock the Project (serializes with create_review_version).
  SELECT p.status, p.package_code_snapshot INTO v_status, v_package_code
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review access link not found'
      USING ERRCODE = 'RV011';
  END IF;

  IF v_status NOT IN ('CUSTOMER_REVIEW', 'REVISION_REQUIRED', 'APPROVED') THEN
    RAISE EXCEPTION 'Project is not open for customer review feedback'
      USING ERRCODE = 'RV017';
  END IF;

  v_required := CASE v_package_code
    WHEN 'COMMON' THEN ARRAY['COMMON']::text[]
    WHEN 'SEPARATE' THEN ARRAY['GROOM', 'BRIDE']::text[]
    ELSE NULL
  END;

  -- D. The version must be a REVIEW version of THIS Project.
  SELECT iv.invitation_id INTO v_invitation_id
  FROM public.invitation_versions AS iv
  WHERE iv.id = p_invitation_version_id
    AND iv.project_id = p_project_id
    AND iv.version_type = 'REVIEW';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review version not found'
      USING ERRCODE = 'RV015';
  END IF;

  -- E. Lock its invitation; it must be a REQUIRED variant and the version
  -- must be that invitation's CURRENT review (stale -> RV016).
  SELECT pi.variant, pi.current_review_version_id INTO v_variant, v_current_id
  FROM public.project_invitations AS pi
  WHERE pi.id = v_invitation_id
    AND pi.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR v_required IS NULL OR NOT (v_variant = ANY (v_required)) THEN
    RAISE EXCEPTION 'Review version not found'
      USING ERRCODE = 'RV015';
  END IF;

  IF v_current_id IS DISTINCT FROM p_invitation_version_id THEN
    RAISE EXCEPTION 'Review version has been superseded'
      USING ERRCODE = 'RV016';
  END IF;

  -- F. The first decision on a version is final (0016 unique index +
  -- current-review guard remain backstops). APPROVAL: never after any
  -- decision. REVISION_REQUEST: never after APPROVAL (no withdrawal).
  IF (p_feedback_type = 'APPROVAL' AND EXISTS (
        SELECT 1
        FROM public.review_feedback AS rf
        WHERE rf.invitation_version_id = p_invitation_version_id
          AND rf.feedback_type IN ('APPROVAL', 'REVISION_REQUEST')
      ))
     OR (p_feedback_type = 'REVISION_REQUEST' AND EXISTS (
        SELECT 1
        FROM public.review_feedback AS rf
        WHERE rf.invitation_version_id = p_invitation_version_id
          AND rf.feedback_type = 'APPROVAL'
      ))
  THEN
    RAISE EXCEPTION 'A decision has already been recorded for this review version'
      USING ERRCODE = 'RV018';
  END IF;

  -- G. Append the canonical feedback row.
  INSERT INTO public.review_feedback (
    project_id, access_link_id, invitation_version_id, feedback_type, message
  ) VALUES (
    p_project_id, p_access_link_id, p_invitation_version_id, p_feedback_type, v_message
  )
  RETURNING * INTO v_feedback;

  v_final_status := v_status;

  -- H. Activity + status: COMMENT changes nothing and logs nothing.
  IF p_feedback_type <> 'COMMENT' THEN
    PERFORM public.log_activity(
      p_project_id,
      'CUSTOMER',
      CASE p_feedback_type WHEN 'APPROVAL' THEN 'CUSTOMER_APPROVED' ELSE 'REVISION_REQUESTED' END,
      CASE p_feedback_type WHEN 'APPROVAL' THEN 'Customer approved review' ELSE 'Customer requested revision' END,
      jsonb_build_object(
        'invitation_id', v_invitation_id,
        'invitation_version_id', p_invitation_version_id,
        'variant', v_variant,
        'review_feedback_id', v_feedback.id,
        'access_link_id', p_access_link_id
      )
    );

    v_outcome := public.review_outcome_for_project(p_project_id);
    IF v_outcome IS NULL THEN
      -- Unreachable (policy checked in E); fail closed rather than guess.
      RAISE EXCEPTION 'Project package has no invitation variant policy'
        USING ERRCODE = 'RV015';
    END IF;

    IF v_outcome IS DISTINCT FROM v_status THEN
      UPDATE public.projects AS p SET
        status = v_outcome
      WHERE p.id = p_project_id;

      PERFORM public.log_activity(
        p_project_id,
        'CUSTOMER',
        'PROJECT_STATUS_CHANGED',
        'Project status changed',
        jsonb_build_object(
          'from_status', v_status,
          'to_status', v_outcome,
          'source', p_feedback_type
        )
      );
      v_final_status := v_outcome;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_feedback.id, v_feedback.project_id, v_feedback.invitation_version_id,
    v_feedback.feedback_type, v_feedback.created_at, v_final_status;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_review_feedback(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_review_feedback(uuid, uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.submit_review_feedback(uuid, uuid, uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.submit_review_feedback(uuid, uuid, uuid, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.submit_review_feedback(uuid, uuid, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.submit_review_feedback(uuid, uuid, uuid, text, text) IS
  'Customer REVIEW feedback (Task 030B, 0037) — TRUSTED BUSINESS ACTION, service_role-exclusive, called only after lib/server/access-links/resolve-access-link.ts validated the raw REVIEW token. Re-validates the access-link context under FOR UPDATE (RV011/RV012/RV013); accepts only COMMENT/REVISION_REQUEST/APPROVAL (RV014); requires project status CUSTOMER_REVIEW/REVISION_REQUIRED/APPROVED (RV017); binds to the exact CURRENT review version of a REQUIRED variant under the invitation row lock (RV015/RV016); first decision per version is final: rejects APPROVAL after any decision and REVISION_REQUEST after APPROVAL (RV018); appends one review_feedback row; logs CUSTOMER_APPROVED/REVISION_REQUESTED (COMMENT logs nothing); recomputes the owner review outcome and sets projects.status (PROJECT_STATUS_CHANGED) atomically. Never touches payment_status, READY_TO_PUBLISH, PUBLISHED or published_version_id.';

-- ===========================================================================
-- 5. review_feedback privilege hardening
-- ===========================================================================
-- The 0016 table-level INSERT is no longer needed: customer feedback is
-- written only by submit_review_feedback (owner-run SECURITY DEFINER).
-- service_role is left with no privilege of any kind on review_feedback.
REVOKE INSERT ON TABLE public.review_feedback FROM service_role;
