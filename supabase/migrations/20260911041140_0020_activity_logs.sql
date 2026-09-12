-- WeddingClick V2 — Foundation Migration 0020
-- activity_logs table + private log_activity() SECURITY DEFINER helper.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §1.3, §2.22 ([R17],
-- [F13], [F15]), §14/§L, §15/§M, §16/§N; docs/DATABASE.md §23;
-- docs/SECURITY.md §5.4. Approved decisions (Task 020 resume):
--   - actor/profile consistency: one-way CHECK, not the stricter two-way
--     form, because the latter would conflict with actor_profile_id's own
--     ON DELETE SET NULL FK to profiles.
--   - log_activity() exact signature and semantics frozen below — no
--     p_actor_profile_id parameter, no overloads, RETURNS void.
--
-- Purpose: immutable, append-only audit record of meaningful domain
-- events (NOT telemetry/keystroke/page-view logging).
--
-- This migration is purely additive. It does not touch templates, RSVP,
-- guests, invitations, project_tasks, or any V1 object.

-- ---------------------------------------------------------------------
-- Table: activity_logs
-- ---------------------------------------------------------------------
CREATE TABLE public.activity_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id        UUID NOT NULL
                      REFERENCES public.projects (id) ON DELETE CASCADE,

  actor_type        TEXT NOT NULL
                      CHECK (actor_type IN ('STAFF', 'CUSTOMER', 'GUEST', 'SYSTEM')),

  -- Non-NULL only permitted when actor_type = 'STAFF' (see CHECK below).
  -- ON DELETE SET NULL, not RESTRICT: an exceptional hard-delete of the
  -- referenced profiles row (docs/PHYSICAL_DATABASE_PLAN.md §14's
  -- "Task-014 clarification" pattern) must not be blocked by an
  -- already-immutable historical audit row.
  actor_profile_id  UUID
                      REFERENCES public.profiles (id) ON DELETE SET NULL,

  -- Short stable code (e.g. PROJECT_PUBLISHED). Deliberately NOT a DB
  -- CHECK enum — centralized as a TypeScript union in the domain layer
  -- instead, because new action types are expected frequently as
  -- features ship (docs/PHYSICAL_DATABASE_PLAN.md §2.22, §3.A exception).
  action_type       TEXT NOT NULL,

  summary           TEXT NOT NULL
                      CHECK (char_length(summary) BETWEEN 1 AND 500),

  -- Must never contain a raw token/secret — application/code-review
  -- discipline, not a DB constraint (a constraint cannot reliably detect
  -- "this JSON contains a secret").
  metadata          JSONB,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()

  -- No updated_at: the table is append-only/immutable (no UPDATE policy
  -- exists for any role, see below).
);

COMMENT ON TABLE public.activity_logs IS
  'Immutable, append-only audit record of meaningful domain events. See docs/PHYSICAL_DATABASE_PLAN.md §2.22 ([R17]).';
COMMENT ON COLUMN public.activity_logs.actor_profile_id IS
  'Set only when actor_type = STAFF (see the row CHECK). May later read NULL for a STAFF row via this FK''s own ON DELETE SET NULL after an exceptional profile hard-delete — deliberately one-way, not a two-way CHECK, to avoid conflicting with that FK action.';

-- Actor/profile consistency — approved decision (one-way, not two-way;
-- see the migration header comment and docs/PHYSICAL_DATABASE_PLAN.md
-- §2.22 for the rejected two-way alternative and why).
ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_actor_profile_consistency_chk
  CHECK (actor_profile_id IS NULL OR actor_type = 'STAFF');

-- ---------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------
-- Primary expected read pattern is newest-first project-scoped activity
-- history (docs/PHYSICAL_DATABASE_PLAN.md §14/§L). No other index is
-- added — current docs prescribe none, and this migration does not
-- speculate one into existence.
CREATE INDEX activity_logs_project_id_created_at_idx
  ON public.activity_logs (project_id, created_at DESC);

-- ---------------------------------------------------------------------
-- Explicit Data API privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.activity_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.activity_logs FROM anon;
REVOKE ALL ON TABLE public.activity_logs FROM authenticated;
REVOKE ALL ON TABLE public.activity_logs FROM service_role;

-- authenticated: SELECT only. No INSERT/UPDATE/DELETE grant — writes
-- happen exclusively as a side effect of trusted SECURITY DEFINER
-- business-action functions (none of which are authored in this
-- migration; see the log_activity() comment below), executing as their
-- owner and therefore needing no table INSERT grant for the calling
-- role. RLS further restricts SELECT to is_staff() below.
GRANT SELECT ON TABLE public.activity_logs TO authenticated;

-- service_role: no table privileges. No documented Foundation-batch
-- server flow reads or writes activity_logs directly via service_role —
-- the approved write path is exclusively the private, owner-executed
-- log_activity() helper called from owner-executed business-action
-- functions (docs/PHYSICAL_DATABASE_PLAN.md §2.22/§M), not a blanket
-- service_role CRUD grant merely because service_role bypasses RLS.

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- RLS policies (§2.22, §M) — staff read-only. No INSERT/UPDATE/DELETE
-- policy for any role, ever: an immutable audit trail.
-- ---------------------------------------------------------------------
CREATE POLICY activity_logs_select_staff
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- No INSERT policy for any role: rows are created exclusively via
-- log_activity() below, which is itself not directly callable by any
-- externally-reachable role (see its REVOKE block).
-- No UPDATE policy for any role, ever.
-- No DELETE policy for any role, ever.

-- ---------------------------------------------------------------------
-- log_activity(): private internal helper (§1.3, §2.22, [F13], [F15]).
--
-- Frozen exact signature — no p_actor_profile_id parameter, no
-- overloads, RETURNS void. Not an RPC for Next.js to call: it is
-- reachable only from within other SECURITY DEFINER business-action
-- functions owned by the same schema-owner role (e.g. a future
-- publish_invitation(), apply_intake_submission(), mark_project_paid(),
-- revoke_access_link() — none of which are authored in this migration),
-- which need no separate grant to call a sibling owned function.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.log_activity(
  p_project_id uuid,
  p_actor_type text,
  p_action_type text,
  p_summary text,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_profile_id uuid;
BEGIN
  IF p_actor_type = 'STAFF' THEN
    IF auth.uid() IS NULL OR public.is_staff() IS NOT TRUE THEN
      RAISE EXCEPTION 'log_activity: STAFF actor_type requires an active staff auth.uid()';
    END IF;
    v_actor_profile_id := auth.uid();
  ELSE
    v_actor_profile_id := NULL;
  END IF;

  INSERT INTO public.activity_logs (
    project_id, actor_type, actor_profile_id, action_type, summary, metadata
  ) VALUES (
    p_project_id, p_actor_type, v_actor_profile_id, p_action_type, p_summary, p_metadata
  );
END;
$$;

COMMENT ON FUNCTION public.log_activity(uuid, text, text, text, jsonb) IS
  'Private internal audit-log writer. Not directly callable by any externally-reachable role (see REVOKE below) — invoked only from within other SECURITY DEFINER business-action functions owned by the same role. See docs/PHYSICAL_DATABASE_PLAN.md §2.22 ([F13]).';

-- CRITICAL — no subsequent GRANT EXECUTE to any role, ever. This is the
-- one deliberate exception to the "REVOKE FROM PUBLIC, then GRANT TO
-- authenticated" pattern used by every other SECURITY DEFINER helper in
-- this project: log_activity() must remain unreachable by PUBLIC, anon,
-- authenticated, and service_role alike.
REVOKE ALL ON FUNCTION public.log_activity(uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_activity(uuid, text, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.log_activity(uuid, text, text, text, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.log_activity(uuid, text, text, text, jsonb) FROM service_role;
