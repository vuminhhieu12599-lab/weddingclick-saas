-- WeddingClick V2 — Feature Migration 0053 (TE-06)
-- Staff approval on behalf of the customer: approval evidence columns on
-- review_feedback + the staff_confirm_review_approval business action.
--
-- Source of truth: docs/DECISIONS.md "TE-01 T12" (the note column CORRECTED
-- by "TE-03A" item 5), docs/ROADMAP.md "TE-06", docs/API_CONTRACT.md §16.5,
-- docs/PHYSICAL_DATABASE_PLAN.md §2.18.
--
-- AUTHORING ONLY — not applied. Applying it to DEV (then Production) is an
-- explicit Product Owner decision; nothing in this task applies it.
--
-- WHY review_feedback AND NOT A NEW TABLE (T12). A staff-confirmed approval
-- IS an APPROVAL row for the exact REVIEW version, so every existing rule
-- keeps applying unchanged and in one place: the 0016 one-approval-per-
-- version unique index, guard_feedback_targets_review_version(),
-- guard_approval_targets_current_review() (which locks the invitation row),
-- the "first decision is final" rule, review_outcome_for_project() and the
-- reviewVersionStateOf/deriveReviewOutcome mirrors in lib/domain. A second
-- source of approvals would force every outcome computation to union two
-- tables — two places to get approval wrong.
--
-- WHAT THIS MIGRATION DOES NOT DO. It does not change the customer path:
-- submit_review_feedback, get_customer_review and their grants are
-- untouched, and get_customer_review builds its feedback objects from
-- explicit keys (id, feedbackType, message, createdAt), so the three staff
-- evidence columns and the note are structurally unreachable from the
-- customer REVIEW surface. It never touches payment_status,
-- published_version_id, invitation_versions or any template/catalog row,
-- and it adds no new activity action type (the existing CUSTOMER_APPROVED
-- is reused, with actor_type = 'STAFF').
--
-- This migration is purely additive. It does not touch any V1 object.

-- ---------------------------------------------------------------------
-- 0. Pre-condition (T12 / TE-01 F9): the row CHECK below can only be
--    added if every existing row is a genuine customer row. A legacy
--    APPROVAL with no access link would make the CHECK unsatisfiable, so
--    fail the migration loudly instead of weakening the constraint.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_orphans bigint;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM public.review_feedback
  WHERE access_link_id IS NULL;

  IF v_orphans <> 0 THEN
    RAISE EXCEPTION 'Migration 0053 pre-condition failed: % review_feedback row(s) have access_link_id IS NULL; the CUSTOMER branch of review_feedback_actor_evidence_check cannot be satisfied', v_orphans;
  END IF;

  RAISE NOTICE 'Migration 0053 pre-condition verified: every existing review_feedback row carries an access link.';
END;
$$;

-- ---------------------------------------------------------------------
-- 1. Approval evidence columns (T12 table, corrected by TE-03A item 5)
-- ---------------------------------------------------------------------
-- Additive and backward compatible: existing rows are exactly the customer
-- path (actor_type DEFAULT 'CUSTOMER', the three new evidence columns NULL).
ALTER TABLE public.review_feedback
  ADD COLUMN actor_type TEXT NOT NULL DEFAULT 'CUSTOMER'
    CONSTRAINT review_feedback_actor_type_check
      CHECK (actor_type IN ('CUSTOMER', 'STAFF')),

  -- ON DELETE RESTRICT: approval evidence must never lose its actor (T12).
  ADD COLUMN staff_profile_id UUID
    CONSTRAINT review_feedback_staff_profile_fkey
      REFERENCES public.profiles (id) ON DELETE RESTRICT,

  ADD COLUMN approval_channel TEXT
    CONSTRAINT review_feedback_approval_channel_check
      CHECK (approval_channel IN ('ZALO', 'PHONE', 'IN_PERSON', 'OTHER')),

  -- INTERNAL, STAFF-ONLY. Never returned by get_customer_review and never
  -- copied into activity metadata (TE-03A item 5).
  ADD COLUMN staff_note TEXT
    CONSTRAINT review_feedback_staff_note_length_check
      CHECK (staff_note IS NULL OR char_length(staff_note) <= 2000);

-- Exactly the two row shapes T12/TE-03A allow; anything else is rejected by
-- the database, independently of which function writes the row.
ALTER TABLE public.review_feedback
  ADD CONSTRAINT review_feedback_actor_evidence_check CHECK (
    (
      actor_type = 'CUSTOMER'
      AND access_link_id IS NOT NULL
      AND staff_profile_id IS NULL
      AND approval_channel IS NULL
      AND staff_note IS NULL
    )
    OR
    (
      actor_type = 'STAFF'
      AND feedback_type = 'APPROVAL'
      AND access_link_id IS NULL
      AND staff_profile_id IS NOT NULL
      AND approval_channel IS NOT NULL
      AND message IS NULL
    )
  );

COMMENT ON COLUMN public.review_feedback.actor_type IS
  'CUSTOMER (the REVIEW-link path, the default for every pre-0053 row) or STAFF (approval confirmed on the customer''s behalf, TE-06). The two row shapes are enforced by review_feedback_actor_evidence_check.';
COMMENT ON COLUMN public.review_feedback.staff_profile_id IS
  'NOT NULL exactly on STAFF rows: the confirming staff member, always auth.uid() inside staff_confirm_review_approval, never a parameter. ON DELETE RESTRICT — approval evidence must not lose its actor.';
COMMENT ON COLUMN public.review_feedback.approval_channel IS
  'NOT NULL exactly on STAFF rows: how the customer confirmed (ZALO / PHONE / IN_PERSON / OTHER). Never exposed to the customer REVIEW surface.';
COMMENT ON COLUMN public.review_feedback.staff_note IS
  'Optional internal staff note, <= 2000 chars, STAFF rows only (TE-03A item 5). Deliberately separate from message, which get_customer_review returns to the customer; never returned by get_customer_review and never copied into activity metadata.';
COMMENT ON CONSTRAINT review_feedback_actor_evidence_check ON public.review_feedback IS
  'T12/TE-03A row semantics: CUSTOMER => access_link_id NOT NULL and no staff evidence; STAFF => APPROVAL only, no access link, staff_profile_id and approval_channel present, message NULL (the customer-facing column stays empty on a staff row).';

-- No grant change: the existing table-level GRANT SELECT TO authenticated
-- (0016) already covers the new columns for the staff read model, and the
-- table still has no INSERT/UPDATE/DELETE grant or policy for any role.
-- Writes remain exclusively the owner-run SECURITY DEFINER functions.

-- ---------------------------------------------------------------------
-- 2. staff_confirm_review_approval (TE-06 business action)
-- ---------------------------------------------------------------------
-- Staff-only (authenticated + is_staff() inside), one atomic transaction,
-- same rule set as submit_review_feedback's APPROVAL path. The actor is
-- auth.uid(), never a parameter, so a caller cannot attribute an approval
-- to another staff member. Fails closed on every precondition and writes
-- nothing on failure.
--
-- BYPASSRLS DEPENDENCY: like every other business action here, the INSERT
-- below relies on this function's owner carrying BYPASSRLS (migration 0002
-- header, §1.3) — review_feedback has FORCE ROW LEVEL SECURITY and no
-- INSERT policy for any role.
CREATE FUNCTION public.staff_confirm_review_approval(
  p_project_id uuid,
  p_invitation_version_id uuid,
  p_expected_current_review_version_id uuid,
  p_channel text,
  p_note text
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  invitation_version_id uuid,
  variant text,
  approval_channel text,
  created_at timestamptz,
  project_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_note           text;
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
  -- A. Self-authorization (mirrors create_review_version step A).
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'SA001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND OR public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'SA001';
  END IF;

  -- B. Input: the channel is mandatory evidence; the note is optional,
  -- trimmed, blank -> NULL.
  IF p_channel IS NULL OR p_channel NOT IN ('ZALO', 'PHONE', 'IN_PERSON', 'OTHER') THEN
    RAISE EXCEPTION 'Approval confirmation channel is not recognized'
      USING ERRCODE = 'SA005';
  END IF;

  v_note := regexp_replace(p_note, '^\s+|\s+$', '', 'g');
  IF v_note = '' THEN
    v_note := NULL;
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'Internal note must be 2000 characters or fewer'
      USING ERRCODE = 'SA006';
  END IF;

  -- C. Lock the Project (serializes with create_review_version and
  -- submit_review_feedback) and read its package + status.
  SELECT p.status, p.package_code_snapshot INTO v_status, v_package_code
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'SA002';
  END IF;

  IF v_status NOT IN ('CUSTOMER_REVIEW', 'REVISION_REQUIRED', 'APPROVED') THEN
    RAISE EXCEPTION 'Project is not open for review approval'
      USING ERRCODE = 'SA007';
  END IF;

  v_required := CASE v_package_code
    WHEN 'COMMON' THEN ARRAY['COMMON']::text[]
    WHEN 'SEPARATE' THEN ARRAY['GROOM', 'BRIDE']::text[]
    ELSE NULL
  END;

  IF v_required IS NULL THEN
    RAISE EXCEPTION 'Project package has no invitation variant policy'
      USING ERRCODE = 'SA003';
  END IF;

  -- D. The target must be a REVIEW version of THIS Project. A draft has no
  -- approval path at all: there is nothing but REVIEW rows to point at.
  SELECT iv.invitation_id INTO v_invitation_id
  FROM public.invitation_versions AS iv
  WHERE iv.id = p_invitation_version_id
    AND iv.project_id = p_project_id
    AND iv.version_type = 'REVIEW';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review version not found'
      USING ERRCODE = 'SA008';
  END IF;

  -- E. Lock its invitation; the variant must be REQUIRED and the version
  -- must still be that invitation's CURRENT review.
  SELECT pi.variant, pi.current_review_version_id INTO v_variant, v_current_id
  FROM public.project_invitations AS pi
  WHERE pi.id = v_invitation_id
    AND pi.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review version not found'
      USING ERRCODE = 'SA008';
  END IF;

  IF NOT (v_variant = ANY (v_required)) THEN
    RAISE EXCEPTION 'Variant is not required by the Project package'
      USING ERRCODE = 'SA004';
  END IF;

  IF v_current_id IS DISTINCT FROM p_invitation_version_id THEN
    RAISE EXCEPTION 'Review version has been superseded'
      USING ERRCODE = 'SA009';
  END IF;

  -- F. Compare-and-set on what the staff member actually saw: a stale tab
  -- (or a second click after a new review was created) never approves a
  -- version the confirming staff member did not read out to the customer.
  IF p_expected_current_review_version_id IS DISTINCT FROM v_current_id THEN
    RAISE EXCEPTION 'Current review version has changed; reload and try again'
      USING ERRCODE = 'SA010';
  END IF;

  -- G. The first decision on a version is final — identical to the customer
  -- path (0037 step F): no second approval, and no approval after a
  -- revision request. The 0016 unique index stays the backstop.
  IF EXISTS (
    SELECT 1
    FROM public.review_feedback AS rf
    WHERE rf.invitation_version_id = p_invitation_version_id
      AND rf.feedback_type IN ('APPROVAL', 'REVISION_REQUEST')
  ) THEN
    RAISE EXCEPTION 'A decision has already been recorded for this review version'
      USING ERRCODE = 'SA011';
  END IF;

  -- H. Append the canonical APPROVAL row as STAFF evidence. message stays
  -- NULL: it is the customer-facing column.
  INSERT INTO public.review_feedback (
    project_id, access_link_id, invitation_version_id, feedback_type, message,
    actor_type, staff_profile_id, approval_channel, staff_note
  ) VALUES (
    p_project_id, NULL, p_invitation_version_id, 'APPROVAL', NULL,
    'STAFF', auth.uid(), p_channel, v_note
  )
  RETURNING * INTO v_feedback;

  -- I. Audit with the existing action type and a STAFF actor. The note is
  -- deliberately NOT copied into metadata (TE-03A item 5).
  PERFORM public.log_activity(
    p_project_id,
    'STAFF',
    'CUSTOMER_APPROVED',
    'Staff confirmed customer approval',
    jsonb_build_object(
      'invitation_id', v_invitation_id,
      'invitation_version_id', p_invitation_version_id,
      'variant', v_variant,
      'review_feedback_id', v_feedback.id,
      'actor_type', 'STAFF',
      'channel', p_channel
    )
  );

  -- J. Same recompute as the customer path: the saved status never
  -- disagrees with the aggregate outcome over the REQUIRED variants.
  v_final_status := v_status;
  v_outcome := public.review_outcome_for_project(p_project_id);

  IF v_outcome IS NULL THEN
    -- Unreachable (policy checked in C); fail closed rather than guess.
    RAISE EXCEPTION 'Project package has no invitation variant policy'
      USING ERRCODE = 'SA003';
  END IF;

  IF v_outcome IS DISTINCT FROM v_status THEN
    UPDATE public.projects AS p SET
      status = v_outcome
    WHERE p.id = p_project_id;

    PERFORM public.log_activity(
      p_project_id,
      'STAFF',
      'PROJECT_STATUS_CHANGED',
      'Project status changed',
      jsonb_build_object(
        'from_status', v_status,
        'to_status', v_outcome,
        'source', 'STAFF_APPROVAL'
      )
    );
    v_final_status := v_outcome;
  END IF;

  RETURN QUERY SELECT
    v_feedback.id, v_feedback.project_id, v_feedback.invitation_version_id,
    v_variant, v_feedback.approval_channel, v_feedback.created_at, v_final_status;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_confirm_review_approval(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_confirm_review_approval(uuid, uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.staff_confirm_review_approval(uuid, uuid, uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.staff_confirm_review_approval(uuid, uuid, uuid, text, text) FROM service_role;
-- authenticated only: this is a STAFF action on the staff session's own JWT.
-- Never service_role — no customer/guest token flow reaches it.
GRANT EXECUTE ON FUNCTION public.staff_confirm_review_approval(uuid, uuid, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.staff_confirm_review_approval(uuid, uuid, uuid, text, text) IS
  'Staff approval on behalf of the customer (TE-06, 0053) — TRUSTED BUSINESS ACTION, authenticated-only, self-authorizing via is_staff() (SA001). Actor is auth.uid(), never a parameter. Requires a recognized channel ZALO/PHONE/IN_PERSON/OTHER (SA005) and an optional note <= 2000 chars written to staff_note, never message (SA006); Project found (SA002) with a variant policy (SA003) and status CUSTOMER_REVIEW/REVISION_REQUIRED/APPROVED (SA007); binds to the exact CURRENT REVIEW version of a REQUIRED variant under the invitation row lock (SA004/SA008/SA009) with compare-and-set on the expected current review version (SA010); first decision per version is final (SA011); appends one STAFF APPROVAL review_feedback row; logs CUSTOMER_APPROVED with actor_type STAFF and the channel but never the note; recomputes the owner review outcome and sets projects.status (PROJECT_STATUS_CHANGED) atomically. Never writes payment_status, READY_TO_PUBLISH, PUBLISHED, published_version_id or any invitation_versions row, and never touches the customer REVIEW path.';
