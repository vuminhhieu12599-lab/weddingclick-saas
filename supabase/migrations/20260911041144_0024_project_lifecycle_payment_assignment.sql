-- WeddingClick V2 — Feature Migration 0024 (Task 025, Authoring Phase 1)
-- transition_project_status() / mark_project_paid() / reassign_project_staff():
-- three narrowly-scoped TRUSTED BUSINESS ACTION functions for the manual/
-- operational project lifecycle transition, payment confirmation, and staff
-- assignment mutations named by docs/API_CONTRACT.md §8 (Task 025 boundary)
-- and specified exactly by docs/DECISIONS.md "Task 025 — Project Lifecycle /
-- Payment / Assignment" (see that section for the exact transition graph,
-- reserved targets, payment, and assignment rules; error-code semantics are
-- this migration's own concern, defined in the ERROR CONTRACT section
-- below; this file does not restate rationale beyond what is needed to
-- review the SQL itself).
--
-- This migration does NOT alter any frozen table shape, CHECK constraint,
-- index, or RLS policy on public.projects (migration 0005) or
-- public.profiles (migration 0002/0006b) — no CREATE TABLE, no ALTER TABLE
-- ... ADD/DROP COLUMN or CONSTRAINT, no CREATE/ALTER POLICY anywhere in this
-- file. It creates exactly three new functions and additionally tightens
-- six public.projects columns' `authenticated` UPDATE privilege (status,
-- payment_status, paid_at, assigned_staff_id, completed_at, archived_at) so
-- the three audited actions below are the only executable write path for
-- those columns — see TABLE PRIVILEGE TIGHTENING near the end of this file.
-- Every other public.projects column keeps its pre-existing table-wide
-- UPDATE access unchanged (a privilege change, not an RLS/table-shape
-- change — mirrors 0021's identical wedding_details tightening).
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL / apply this migration. External review
-- happens before preflight/apply (Task 025 Authoring Phase 1 instructions
-- §16: "author -> independent review -> apply -> live structural
-- verification").
--
-- ---------------------------------------------------------------------
-- WHY THESE ARE BUSINESS ACTIONS, NOT PLAIN RLS WRITES
-- ---------------------------------------------------------------------
-- docs/API_CONTRACT.md §3/§6: a lifecycle status change, a payment
-- confirmation, and a staff assignment change each correspond to a frozen
-- activity_logs action (PROJECT_STATUS_CHANGED/PROJECT_ARCHIVED,
-- PROJECT_MARKED_PAID, STAFF_ASSIGNMENT_CHANGED respectively). log_activity()
-- is private (0020) — not granted EXECUTE to any externally-reachable role —
-- so it is only reachable from inside another SECURITY DEFINER
-- business-action function owned by the same schema-owner role. These three
-- functions are those functions.
--
-- ---------------------------------------------------------------------
-- SECURITY MODEL — SECURITY DEFINER, self-authorizing (mirrors 0021/0022)
-- ---------------------------------------------------------------------
-- Each function runs as the schema-owner role (BYPASSRLS), so RLS does not
-- protect it — the function protects itself, identically in all three:
--   - requires auth.uid() IS NOT NULL
--   - locks the caller's own public.profiles row FOR UPDATE (existence
--     required) — stabilizes caller authorization against a concurrent
--     deactivation/demotion mid-transaction (mirrors save_wedding_details,
--     0021, "AUTHORIZATION STABILITY")
--   - while that lock is held, requires public.is_staff() IS TRUE — the
--     centralized, authoritative authorization helper (migration 0002),
--     never duplicated locally as a role/is_active check
--   - all three checked before any other data access; anything else raises
--     PL001
--
-- SET search_path = '' — every reference below is fully schema-qualified
-- (public.projects, public.profiles, public.is_staff(), public.log_activity(),
-- auth.uid()); built-in types resolve via the always-implicit pg_catalog
-- search path.
--
-- ---------------------------------------------------------------------
-- CONCURRENCY — lock the target Project row FOR UPDATE before any decision
-- ---------------------------------------------------------------------
-- Every function's first data access after caller authorization is
-- `SELECT ... FROM public.projects WHERE id = p_project_id FOR UPDATE`.
-- Because each function is SECURITY DEFINER (owner, BYPASSRLS), this is not
-- subject to any RLS UPDATE-policy visibility restriction. Holding this lock
-- until commit/rollback serializes any two concurrent calls (of any of the
-- three functions, or a concurrent project_addons commercial mutation via
-- the pre-existing guard_project_addon_commercial_freeze() trigger, 0006,
-- which locks the same projects row before inspecting payment_status)
-- against the same Project row — the second waits for the first to finish
-- before it can read/validate/mutate. This is what makes the
-- transition-legality check, the payment precondition check, and the
-- assignee validation authoritative against the row's *actual* current
-- state rather than a client-supplied "expected current state" — there is
-- no application-level pre-check anywhere in this design.
--
-- reassign_project_staff additionally locks the target assignee's
-- public.profiles row FOR UPDATE (when non-NULL) before deciding validity,
-- for the same reason — closing the TOCTOU window between reading that
-- profile's is_active/role and committing the assignment. Note: because
-- this second lock is taken in a fixed order (caller's own profile, then
-- the target Project, then the target profile) rather than a
-- globally-sorted lock order across all three functions' callers/targets,
-- two concurrent reassign_project_staff calls for two *different* Projects
-- that happen to cross-reference each other's caller/target profiles (staff
-- member X reassigns Project A to Y while Y concurrently reassigns Project
-- B to X) can in principle deadlock. This is a standard, Postgres-detected
-- condition (SQLSTATE 40P01) that aborts exactly one of the two
-- transactions with no data corruption — not a lost-update or TOCTOU
-- defect — and is accepted here rather than deviating from the
-- caller-lock-first convention established by 0021/0022, for an
-- internal-staff, low-frequency operation.
--
-- ---------------------------------------------------------------------
-- ERROR CONTRACT — PLxxx custom SQLSTATE range (defined here; enforces the
-- business rules in docs/DECISIONS.md "Task 025 — Project Lifecycle /
-- Payment / Assignment")
-- ---------------------------------------------------------------------
-- PL001  caller is not an active WeddingClick STAFF/ADMIN (all three
--        functions) -> ApiError kind FORBIDDEN (403)
-- PL002  target Project not found (all three functions)
--        -> ApiError kind NOT_FOUND (404)
-- PL003  transition_project_status: p_target_status is not one of the 12
--        frozen public.projects.status values -> ApiError kind BAD_REQUEST
--        (400) — malformed input, not a business-rule violation. Checked
--        before the Project row is locked (pure input-shape check, no row
--        access needed) so malformed input fails fast.
-- PL004  transition_project_status: p_target_status equals the Project's
--        current status (STATUS_CONFLICT, no-op) -> ApiError kind CONFLICT
--        (409); no mutation, no activity row
-- PL005  transition_project_status: (current status, p_target_status) is not
--        one of the exact frozen allowed edges (ILLEGAL_STATUS_TRANSITION)
--        -> ApiError kind INVARIANT (422). Because none of CUSTOMER_REVIEW,
--        REVISION_REQUIRED, APPROVED, or PUBLISHED ever appears as a target
--        in the allowed-edges list below, this single code and check is
--        also what enforces docs/DECISIONS.md "Task 025 — Project Lifecycle
--        / Payment / Assignment", part B (reserved targets) — by
--        construction, not by a separate special-cased branch, and
--        identically regardless of caller role (no ADMIN override exists
--        anywhere in this function, per part B: "No ADMIN override exists
--        in V1")
-- PL006  PAYMENT_STATUS_PRECONDITION -> ApiError kind INVARIANT (422). Two
--        distinct call sites raise this same code for the same underlying
--        concept ("a payment-status precondition blocks this operation
--        right now"): (a) transition_project_status, only for the
--        structurally-valid AWAITING_PAYMENT -> READY_TO_PUBLISH edge, when
--        payment_status <> 'PAID'; (b) mark_project_paid, when the
--        Project's status is not AWAITING_PAYMENT (checked only after
--        payment_status has already been confirmed not already 'PAID' —
--        see PL007)
-- PL007  mark_project_paid: payment_status is already 'PAID'
--        (PAYMENT_ALREADY_PAID) -> ApiError kind CONFLICT (409); no
--        mutation, no activity row. Checked before PL006, matching
--        docs/DECISIONS.md "Task 025 — Project Lifecycle / Payment /
--        Assignment", part D (payment): already-PAID is a CONFLICT and is
--        decided before the AWAITING_PAYMENT precondition, which is an
--        INVARIANT
-- PL008  reassign_project_staff: p_assigned_staff_id is not distinct from
--        the Project's current assigned_staff_id, including NULL -> NULL
--        (ASSIGNMENT_CONFLICT, no-op) -> ApiError kind CONFLICT (409); no
--        mutation, no activity row
-- PL009  reassign_project_staff: p_assigned_staff_id is non-NULL and does
--        not resolve to an existing, is_active = true, role IN
--        ('STAFF','ADMIN') public.profiles row (ASSIGNEE_INVALID) ->
--        ApiError kind INVARIANT (422). The role branch is defense-in-depth
--        only — public.profiles.role already carries a DB CHECK restricting
--        it to ('ADMIN','STAFF') (migration 0002), so no row can exist with
--        any other role today; kept so this function's contract stays
--        correct if that CHECK is ever loosened without this function being
--        revisited (mirrors WD003/PE003's identical unreachable-defense
--        rationale, 0021/0022)
-- PL010  transition_project_status: p_reason, after trimming leading/
--        trailing whitespace, is longer than 2000 characters -> ApiError
--        kind BAD_REQUEST (400)
--
-- Every RAISE EXCEPTION message below is a fixed, safe string — never a
-- forwarded raw Postgres/Supabase error. Any OTHER database failure is left
-- unhandled and propagates as a normal Postgres error with its own native
-- SQLSTATE; application code maps any SQLSTATE it does not recognize to a
-- generic HTTP 500 and never forwards the raw message.
--
-- ---------------------------------------------------------------------
-- FROZEN MANUAL TRANSITION GRAPH (docs/DECISIONS.md "Task 025 — Project
-- Lifecycle / Payment / Assignment", part A — copied here verbatim as the
-- single implementation source; do not hand-derive edges elsewhere)
-- ---------------------------------------------------------------------
-- NEW               -> WAITING_FOR_INFO
-- WAITING_FOR_INFO  -> IN_PROGRESS
-- IN_PROGRESS       -> INTERNAL_REVIEW
-- INTERNAL_REVIEW   -> IN_PROGRESS
-- REVISION_REQUIRED -> IN_PROGRESS
-- APPROVED          -> AWAITING_PAYMENT
-- AWAITING_PAYMENT  -> READY_TO_PUBLISH   (only if payment_status = PAID)
-- PUBLISHED         -> COMPLETED
-- COMPLETED         -> ARCHIVED
-- No other edge is allowed. ARCHIVED is terminal (never a from_status
-- below). CUSTOMER_REVIEW, REVISION_REQUIRED, APPROVED, and PUBLISHED never
-- appear as a to_status below — reserved for Task 030 (Review workflow) and
-- Task 031 (publish_invitation) respectively, never settable by this
-- generic function (see PL005 above).
--
-- ---------------------------------------------------------------------
-- STATUS TIMESTAMPS
-- ---------------------------------------------------------------------
-- Reaching COMPLETED sets completed_at = now(); reaching ARCHIVED sets
-- archived_at = now(). Both are written only on their matching target
-- branch (CASE WHEN p_target_status = '<TARGET>' THEN now() ELSE
-- <column> END) — every other transition leaves both columns exactly as
-- they already were. The frozen graph never moves away from COMPLETED to a
-- non-ARCHIVED state, and ARCHIVED is terminal, so neither column is ever
-- cleared by any reachable transition (docs/DECISIONS.md "Task 025 —
-- Project Lifecycle / Payment / Assignment", part C holds by construction,
-- not by a separate guard).
--
-- ---------------------------------------------------------------------
-- ACTIVITY LOGGING
-- ---------------------------------------------------------------------
-- transition_project_status: PROJECT_ARCHIVED when p_target_status =
-- 'ARCHIVED', PROJECT_STATUS_CHANGED for every other successful transition
-- — never both for the same call. Metadata: from_status, to_status, and
-- reason only when non-NULL after trim/whitespace normalization (the key
-- is omitted entirely when there is no reason, not set to a JSON null).
-- mark_project_paid: PROJECT_MARKED_PAID; metadata contains no
-- payment-provider fields — only previous_payment_status/payment_status.
-- reassign_project_staff: STAFF_ASSIGNMENT_CHANGED; metadata contains
-- previous_assigned_staff_id/assigned_staff_id (both always present, even
-- when NULL, since NULL is meaningful "unassigned" state here). No activity
-- row is ever written on a validation failure, invariant failure,
-- conflict/no-op, or not-found outcome — the log_activity() call happens
-- only after the real mutation has already succeeded, in the same
-- transaction.

-- ===========================================================================
-- transition_project_status
-- ===========================================================================
CREATE FUNCTION public.transition_project_status(
  p_project_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  status text,
  completed_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_status text;
  v_payment_status text;
  v_reason         text;
  v_metadata       jsonb;
  v_activity_type  text;
  v_result         public.projects%ROWTYPE;
BEGIN
  -- A. Caller — active WeddingClick STAFF/ADMIN, right now (header
  -- SECURITY MODEL).
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PL001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PL001';
  END IF;

  IF public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PL001';
  END IF;

  -- B. Target status must be one of the 12 frozen values (malformed input,
  -- not a business-rule violation -> PL003/BAD_REQUEST, distinct from the
  -- PL005/INVARIANT edge-legality check below). Checked before any row
  -- access. NULL is explicitly included in this guard: SQL three-valued
  -- logic makes `NULL NOT IN (...)` evaluate to NULL, not TRUE, so a bare
  -- `NOT IN` check alone would let p_target_status = NULL silently skip
  -- this branch and fall through toward PL005 instead of PL003.
  IF p_target_status IS NULL OR p_target_status NOT IN (
    'NEW', 'WAITING_FOR_INFO', 'IN_PROGRESS', 'INTERNAL_REVIEW',
    'CUSTOMER_REVIEW', 'REVISION_REQUIRED', 'APPROVED',
    'AWAITING_PAYMENT', 'READY_TO_PUBLISH', 'PUBLISHED',
    'COMPLETED', 'ARCHIVED'
  ) THEN
    RAISE EXCEPTION 'Target status is not a recognized project status'
      USING ERRCODE = 'PL003';
  END IF;

  -- C. reason: optional, trimmed (all whitespace, not just spaces),
  -- whitespace-only -> NULL, max 2000 characters (docs/DECISIONS.md
  -- "Task 025 — Project Lifecycle / Payment / Assignment", part C). Never a
  -- new projects column — stored only in activity metadata.
  v_reason := regexp_replace(p_reason, '^\s+|\s+$', '', 'g');
  IF v_reason = '' THEN
    v_reason := NULL;
  END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'Reason must be 2000 characters or fewer'
      USING ERRCODE = 'PL010';
  END IF;

  -- D. Lock the target Project row FOR UPDATE first (header CONCURRENCY) —
  -- every later decision reads v_current_status/v_payment_status from this
  -- locked row, never from a client-supplied "expected current status".
  SELECT p.status, p.payment_status INTO v_current_status, v_payment_status
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'PL002';
  END IF;

  -- E. No-op (STATUS_CONFLICT) — checked before edge legality so an
  -- already-correct request never surfaces as "illegal transition".
  IF p_target_status = v_current_status THEN
    RAISE EXCEPTION 'Project already has the requested status'
      USING ERRCODE = 'PL004';
  END IF;

  -- F. Edge legality — the exact frozen graph (header FROZEN MANUAL
  -- TRANSITION GRAPH), reproduced nowhere else in this codebase. Also
  -- enforces the reserved-target rule by construction (see PL005 above).
  IF NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('NEW', 'WAITING_FOR_INFO'),
      ('WAITING_FOR_INFO', 'IN_PROGRESS'),
      ('IN_PROGRESS', 'INTERNAL_REVIEW'),
      ('INTERNAL_REVIEW', 'IN_PROGRESS'),
      ('REVISION_REQUIRED', 'IN_PROGRESS'),
      ('APPROVED', 'AWAITING_PAYMENT'),
      ('AWAITING_PAYMENT', 'READY_TO_PUBLISH'),
      ('PUBLISHED', 'COMPLETED'),
      ('COMPLETED', 'ARCHIVED')
    ) AS allowed_edges(from_status, to_status)
    WHERE allowed_edges.from_status = v_current_status
      AND allowed_edges.to_status = p_target_status
  ) THEN
    RAISE EXCEPTION 'That status transition is not allowed'
      USING ERRCODE = 'PL005';
  END IF;

  -- G. Payment precondition — the AWAITING_PAYMENT -> READY_TO_PUBLISH edge
  -- is structurally valid (F above passed) but additionally requires
  -- payment_status = 'PAID' (header FROZEN MANUAL TRANSITION GRAPH).
  IF v_current_status = 'AWAITING_PAYMENT'
     AND p_target_status = 'READY_TO_PUBLISH'
     AND v_payment_status <> 'PAID'
  THEN
    RAISE EXCEPTION 'Project must be marked paid before moving to READY_TO_PUBLISH'
      USING ERRCODE = 'PL006';
  END IF;

  -- H. Mutate. completed_at/archived_at are set only on their matching
  -- target branch and otherwise left exactly as they already were (header
  -- STATUS TIMESTAMPS) — never cleared.
  UPDATE public.projects AS p SET
    status = p_target_status,
    completed_at = CASE WHEN p_target_status = 'COMPLETED' THEN now() ELSE p.completed_at END,
    archived_at = CASE WHEN p_target_status = 'ARCHIVED' THEN now() ELSE p.archived_at END
  WHERE p.id = p_project_id
  RETURNING p.* INTO v_result;

  -- I. Activity — exactly one row, PROJECT_ARCHIVED for the ARCHIVED
  -- target, PROJECT_STATUS_CHANGED otherwise (header ACTIVITY LOGGING).
  -- Every path reaching here is a real change (no-op already rejected at E).
  IF p_target_status = 'ARCHIVED' THEN
    v_activity_type := 'PROJECT_ARCHIVED';
  ELSE
    v_activity_type := 'PROJECT_STATUS_CHANGED';
  END IF;

  IF v_reason IS NOT NULL THEN
    v_metadata := jsonb_build_object(
      'from_status', v_current_status,
      'to_status', p_target_status,
      'reason', v_reason
    );
  ELSE
    v_metadata := jsonb_build_object(
      'from_status', v_current_status,
      'to_status', p_target_status
    );
  END IF;

  PERFORM public.log_activity(
    p_project_id,
    'STAFF',
    v_activity_type,
    'Project status changed',
    v_metadata
  );

  RETURN QUERY SELECT
    v_result.id, v_result.status, v_result.completed_at,
    v_result.archived_at, v_result.updated_at;
END;
$$;

-- ---------------------------------------------------------------------
-- Explicit Data API privileges — locked down immediately after creation
-- (Task 022 statement-order hardening pattern). PUBLIC: no execute. anon:
-- no execute. authenticated: execute (self-authorizes internally, see
-- header SECURITY MODEL). service_role: no execute (consistent with
-- 0021/0022's SECURITY DEFINER pattern — no service_role dependency). No
-- overloads.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.transition_project_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_project_status(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.transition_project_status(uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.transition_project_status(uuid, text, text) FROM service_role;

GRANT EXECUTE ON FUNCTION public.transition_project_status(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.transition_project_status(uuid, text, text) IS
  'Audited manual/operational project status transition (Task 025) — TRUSTED BUSINESS ACTION. Self-authorizes by locking the caller''s own profiles row FOR UPDATE then requiring public.is_staff() IS TRUE (mirrors save_wedding_details, 0021); locks the target Project row FOR UPDATE; enforces the exact frozen transition graph and reserved-target rule; calls log_activity(''PROJECT_STATUS_CHANGED'' or ''PROJECT_ARCHIVED'') atomically on success. See this migration''s header for the full contract.';

-- ===========================================================================
-- mark_project_paid
-- ===========================================================================
CREATE FUNCTION public.mark_project_paid(
  p_project_id uuid
)
RETURNS TABLE (
  id uuid,
  status text,
  payment_status text,
  paid_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_status text;
  v_payment_status text;
  v_result         public.projects%ROWTYPE;
BEGIN
  -- A. Caller — identical pattern to transition_project_status.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PL001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PL001';
  END IF;

  IF public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PL001';
  END IF;

  -- B. Lock the target Project row FOR UPDATE first (header CONCURRENCY) —
  -- this is the same row guard_project_addon_commercial_freeze() (0006)
  -- locks before inspecting payment_status, so a concurrent project_addons
  -- mutation and this call always serialize against each other via that one
  -- shared lock.
  SELECT p.status, p.payment_status INTO v_current_status, v_payment_status
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'PL002';
  END IF;

  -- C. Already PAID — checked first (docs/DECISIONS.md "Task 025 — Project
  -- Lifecycle / Payment / Assignment", part D). No mutation, no activity
  -- row.
  IF v_payment_status = 'PAID' THEN
    RAISE EXCEPTION 'Project is already marked paid'
      USING ERRCODE = 'PL007';
  END IF;

  -- D. Lifecycle precondition — only AWAITING_PAYMENT may be marked paid.
  IF v_current_status <> 'AWAITING_PAYMENT' THEN
    RAISE EXCEPTION 'Project must be in AWAITING_PAYMENT status to be marked paid'
      USING ERRCODE = 'PL006';
  END IF;

  -- E. Mutate. Status is deliberately never touched here (docs/DECISIONS.md
  -- "Task 025 — Project Lifecycle / Payment / Assignment", part D: "does
  -- NOT change project lifecycle status") — staff separately transitions
  -- AWAITING_PAYMENT -> READY_TO_PUBLISH
  -- afterward via transition_project_status, which re-verifies
  -- payment_status = 'PAID' atomically under its own row lock (step G
  -- there). The pre-existing guard_project_commercial_freeze() trigger
  -- (0005) does not fire on this UPDATE: its WHEN clause only fires when
  -- OLD.payment_status = 'PAID', which C above already ruled out for this
  -- call. There is no MARK_UNPAID / generic payment setter / reversal path
  -- anywhere in this function, by design.
  UPDATE public.projects AS p SET
    payment_status = 'PAID',
    paid_at = now()
  WHERE p.id = p_project_id
  RETURNING p.* INTO v_result;

  -- F. Activity — always logged on success (no-op already rejected above).
  -- No payment-provider fields (header ACTIVITY LOGGING).
  PERFORM public.log_activity(
    p_project_id,
    'STAFF',
    'PROJECT_MARKED_PAID',
    'Project marked paid',
    jsonb_build_object(
      'previous_payment_status', 'UNPAID',
      'payment_status', 'PAID'
    )
  );

  RETURN QUERY SELECT
    v_result.id, v_result.status, v_result.payment_status,
    v_result.paid_at, v_result.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_project_paid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_project_paid(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.mark_project_paid(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.mark_project_paid(uuid) FROM service_role;

GRANT EXECUTE ON FUNCTION public.mark_project_paid(uuid) TO authenticated;

COMMENT ON FUNCTION public.mark_project_paid(uuid) IS
  'Audited manual payment confirmation (Task 025) — TRUSTED BUSINESS ACTION. Self-authorizes identically to transition_project_status; locks the target Project row FOR UPDATE (composes with guard_project_addon_commercial_freeze()''s own lock on the same row, 0006); succeeds only when payment_status = UNPAID and status = AWAITING_PAYMENT; sets payment_status = PAID, paid_at = now(); never changes status; no reversal path exists. Calls log_activity(''PROJECT_MARKED_PAID'') atomically on success. See this migration''s header for the full contract.';

-- ===========================================================================
-- reassign_project_staff
-- ===========================================================================
CREATE FUNCTION public.reassign_project_staff(
  p_project_id uuid,
  p_assigned_staff_id uuid
)
RETURNS TABLE (
  id uuid,
  assigned_staff_id uuid,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_assigned_staff_id uuid;
  v_target_is_active           boolean;
  v_target_role                text;
  v_result                     public.projects%ROWTYPE;
BEGIN
  -- A. Caller — identical pattern to transition_project_status. Any active
  -- STAFF/ADMIN may call this — self-assignment, assigning another active
  -- STAFF/ADMIN, reassignment, and unassignment (NULL) are all equally
  -- permitted (docs/DECISIONS.md "Task 025 — Project Lifecycle / Payment /
  -- Assignment", part F); no additional role check
  -- beyond public.is_staff() exists in this function.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PL001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PL001';
  END IF;

  IF public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PL001';
  END IF;

  -- B. Lock the target Project row FOR UPDATE first (header CONCURRENCY).
  SELECT p.assigned_staff_id INTO v_current_assigned_staff_id
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'PL002';
  END IF;

  -- C. No-op (ASSIGNMENT_CONFLICT), including NULL -> NULL. No mutation,
  -- no activity row. IS NOT DISTINCT FROM is the NULL-safe equality this
  -- comparison needs (a plain = would evaluate to NULL, not TRUE, for
  -- NULL -> NULL and never raise).
  IF p_assigned_staff_id IS NOT DISTINCT FROM v_current_assigned_staff_id THEN
    RAISE EXCEPTION 'Project is already assigned to that staff member'
      USING ERRCODE = 'PL008';
  END IF;

  -- D. Non-NULL target must resolve to an existing, active, STAFF/ADMIN
  -- profile — validated and locked inside this same transaction (not an
  -- application-level pre-check) so a concurrent deactivation of the target
  -- cannot race this decision (header CONCURRENCY).
  IF p_assigned_staff_id IS NOT NULL THEN
    SELECT p.is_active, p.role INTO v_target_is_active, v_target_role
    FROM public.profiles AS p
    WHERE p.id = p_assigned_staff_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_target_is_active IS NOT TRUE
       OR v_target_role NOT IN ('STAFF', 'ADMIN')
    THEN
      RAISE EXCEPTION 'Assigned staff member must be an active STAFF or ADMIN profile'
        USING ERRCODE = 'PL009';
    END IF;
  END IF;

  -- E. Mutate. Never alters RLS/visibility — assigned_staff_id remains
  -- responsibility metadata only (docs/DECISIONS.md "Task 025 — Project
  -- Lifecycle / Payment / Assignment", part F).
  UPDATE public.projects AS p SET
    assigned_staff_id = p_assigned_staff_id
  WHERE p.id = p_project_id
  RETURNING p.* INTO v_result;

  -- F. Activity — always logged on success (no-op already rejected above).
  PERFORM public.log_activity(
    p_project_id,
    'STAFF',
    'STAFF_ASSIGNMENT_CHANGED',
    'Project staff assignment changed',
    jsonb_build_object(
      'previous_assigned_staff_id', v_current_assigned_staff_id,
      'assigned_staff_id', p_assigned_staff_id
    )
  );

  RETURN QUERY SELECT
    v_result.id, v_result.assigned_staff_id, v_result.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_project_staff(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reassign_project_staff(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reassign_project_staff(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.reassign_project_staff(uuid, uuid) FROM service_role;

GRANT EXECUTE ON FUNCTION public.reassign_project_staff(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.reassign_project_staff(uuid, uuid) IS
  'Audited project staff assignment/reassignment/unassignment (Task 025) — TRUSTED BUSINESS ACTION. Self-authorizes identically to transition_project_status; any active STAFF/ADMIN may self-assign, assign another active STAFF/ADMIN, reassign, or unassign (NULL); locks the target Project row and, for a non-NULL target, the target profiles row, both FOR UPDATE; never alters RLS/visibility (assigned_staff_id remains metadata only). Calls log_activity(''STAFF_ASSIGNMENT_CHANGED'') atomically on success. See this migration''s header for the full contract.';

-- ---------------------------------------------------------------------
-- TABLE PRIVILEGE TIGHTENING — projects lifecycle/payment/assignment
-- columns must go only through the three trusted actions above.
-- ---------------------------------------------------------------------
-- Migration 0005 granted `authenticated` table-wide UPDATE on
-- public.projects (RLS-scoped to is_staff()). Left as-is, that table-wide
-- grant would let any staff JWT bypass all three business actions above via
-- a direct PostgREST `.from("projects").update(...)` call on status,
-- payment_status, paid_at, assigned_staff_id, completed_at, or
-- archived_at — silently skipping transition-graph validation, the payment
-- precondition, active-assignee validation, and activity logging this
-- migration exists to guarantee (mirrors the 0021/0022 TABLE PRIVILEGE
-- TIGHTENING pattern for wedding_details/project_events — a privilege
-- change, not an RLS/table-shape change; the existing projects_update_staff
-- RLS policy, migration 0005, is left completely unmodified).
--
-- Scope: this migration restricts ONLY the six columns it introduces
-- trusted actions for. Every other public.projects column (id,
-- project_code, customer_id, event_type, deadline_at, service_package_id,
-- the three commercial snapshot/total columns, internal_note, created_by,
-- created_at, updated_at) keeps exactly its pre-existing table-wide UPDATE
-- access — none of that is Task 025's concern: commercial-column
-- mutability while UNPAID is deliberate per docs/PHYSICAL_DATABASE_PLAN.md
-- §R7 and already governed by its own freeze trigger (0005/0006);
-- id/project_code/customer_id/event_type/created_by/created_at being
-- technically UPDATE-able via the pre-existing blanket grant is an
-- unrelated, pre-existing condition from migration 0005, not introduced or
-- fixed here — out of Task 025's scope (CLAUDE.md §2), reported separately
-- as Technical Debt Found rather than silently changed.
REVOKE UPDATE ON TABLE public.projects FROM authenticated;
GRANT UPDATE (
  id, project_code, customer_id, event_type, deadline_at,
  service_package_id, package_code_snapshot, package_name_snapshot,
  base_price_vnd, addon_total_vnd, total_price_vnd,
  internal_note, created_by, created_at, updated_at
) ON TABLE public.projects TO authenticated;
-- status, payment_status, paid_at, assigned_staff_id, completed_at,
-- archived_at deliberately excluded from the column list above —
-- reachable only via transition_project_status() / mark_project_paid() /
-- reassign_project_staff() (SECURITY DEFINER, BYPASSRLS) from here on.
