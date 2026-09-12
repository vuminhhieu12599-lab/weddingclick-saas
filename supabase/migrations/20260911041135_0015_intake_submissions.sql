-- WeddingClick V2 — Foundation Migration 0015
-- intake_submissions table.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.16 (intake_submissions),
-- [R5], [R11-C], [G2]; §15 (RLS Matrix); §16 (Migration Order, [F17]).
-- Also synced: docs/DATABASE.md §17.
--
-- Task 015 note on [G2]: the original Task 015 brief instructed NOT to
-- invent a payload immutability trigger in this migration. That instruction
-- conflicted with docs/PHYSICAL_DATABASE_PLAN.md §2.16/§16/§5.C and
-- docs/DATABASE.md §17, which explicitly and consistently require
-- guard_intake_submission_immutability() as part of 0015 (tagged [G2], a
-- deliberate, reviewed patch on top of the originally frozen plan — not a
-- stale mention). The conflict was surfaced and the user explicitly
-- directed following the current authoritative docs, so the trigger is
-- included below.
--
-- NOT implemented here (later tasks): review_feedback, guests, RSVP,
-- customer UI, intake form route, apply-intake RPC, token resolution RPC,
-- activity logging.
--
-- This migration is purely additive. It does not touch any V1 object.

-- ---------------------------------------------------------------------
-- public.intake_submissions (§2.16)
-- ---------------------------------------------------------------------
-- Customer-submitted information awaiting staff review/application. Never
-- writes directly to wedding_details/project_events/project_design/
-- project_invitations — those remain staff-applied only (§R5, §13).
CREATE TABLE public.intake_submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id     UUID NOT NULL
                   REFERENCES public.projects (id) ON DELETE CASCADE,

  -- Nullable: a submission need not be tied to an access link. When set,
  -- must reference an INTAKE-typed link on the SAME project — enforced by
  -- the composite FK below plus guard_intake_link_type().
  access_link_id UUID,

  -- Exactly what the customer submitted. Immutable after INSERT ([G2],
  -- see guard_intake_submission_immutability() below) — an audit-integrity
  -- record, never application-updated.
  payload        JSONB NOT NULL,

  status         TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'APPLIED', 'REJECTED')),

  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  reviewed_by    UUID REFERENCES public.profiles (id) ON DELETE SET NULL,

  -- Consistency with status: PENDING <=> reviewed_at IS NULL. Application/
  -- staff business logic supplies reviewed_at on APPLIED/REJECTED — no
  -- automatic timestamp is invented here.
  reviewed_at    TIMESTAMPTZ
                   CHECK ((status = 'PENDING') = (reviewed_at IS NULL)),

  staff_note     TEXT,

  -- [R11-C] Same-project access-link integrity. Nullable access_link_id
  -- means MATCH SIMPLE bypasses this check entirely when it's NULL — the
  -- desired behavior for submissions with no associated link. Capability
  -- type (INTAKE only) is enforced separately by guard_intake_link_type()
  -- below, not by this FK.
  CONSTRAINT intake_submissions_access_link_project_fkey
    FOREIGN KEY (access_link_id, project_id)
    REFERENCES public.project_access_links (id, project_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.intake_submissions IS
  'Customer-submitted information awaiting staff review/application. Never written directly to wedding_details/project_events/project_design/project_invitations. See docs/PHYSICAL_DATABASE_PLAN.md §2.16.';
COMMENT ON COLUMN public.intake_submissions.payload IS
  'Exactly what the customer submitted. Immutable after INSERT ([G2]) — see guard_intake_submission_immutability(). Never application-updated.';
COMMENT ON COLUMN public.intake_submissions.access_link_id IS
  'Nullable. When set, must be an INTAKE-typed link on the same project — same-project integrity via the composite FK, capability type via guard_intake_link_type() (§R11-C).';
COMMENT ON COLUMN public.intake_submissions.reviewed_at IS
  'NULL iff status = PENDING (table CHECK). Supplied by staff/application business logic on APPLIED/REJECTED — never auto-filled by a trigger.';

-- Staff "list submissions for this project by status" (§2.16). PK already
-- covers id. No speculative indexes.
CREATE INDEX intake_submissions_project_status_idx
  ON public.intake_submissions (project_id, status);

-- ---------------------------------------------------------------------
-- Explicit Data API privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.intake_submissions FROM PUBLIC;
REVOKE ALL ON TABLE public.intake_submissions FROM anon;
REVOKE ALL ON TABLE public.intake_submissions FROM authenticated;
REVOKE ALL ON TABLE public.intake_submissions FROM service_role;

-- authenticated represents STAFF/ADMIN sessions; RLS further restricts to
-- is_staff(). No INSERT grant — customer INTAKE submission is server-only
-- via service_role after token validation (§10/§H), never a staff-session
-- write. No DELETE grant — audit trail of what the customer actually sent
-- (§5.C).
GRANT SELECT, UPDATE ON TABLE public.intake_submissions TO authenticated;

-- service_role: INSERT only — the trusted-server-only customer INTAKE
-- token flow (raw token -> Next.js server validates project_access_links
-- -> service_role INSERT here). No service_role SELECT/UPDATE/DELETE:
-- staff review (SELECT/UPDATE) stays on the authenticated-session + RLS
-- path; granting more here is a later reviewed task if a server flow needs
-- it (§11/§12).
GRANT INSERT ON TABLE public.intake_submissions TO service_role;

ALTER TABLE public.intake_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_submissions FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- guard_intake_link_type() (§R11-C)
-- ---------------------------------------------------------------------
-- The composite FK above already guarantees existence + same-project
-- integrity when access_link_id is set. This trigger is responsible for
-- capability type only: an intake submission may reference an INTAKE-typed
-- link, never REVIEW or PORTAL.
CREATE FUNCTION public.guard_intake_link_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link_type text;
BEGIN
  SELECT link_type INTO v_link_type
  FROM public.project_access_links
  WHERE id = NEW.access_link_id;

  IF v_link_type IS DISTINCT FROM 'INTAKE' THEN
    RAISE EXCEPTION 'intake_submissions.access_link_id must reference an INTAKE-typed access link (access_link_id=%)', NEW.access_link_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only helper, not an RPC: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_intake_link_type() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_intake_link_type() FROM anon;
REVOKE ALL ON FUNCTION public.guard_intake_link_type() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_intake_link_type() FROM service_role;

-- ---------------------------------------------------------------------
-- guard_intake_submission_immutability() ([G2])
-- ---------------------------------------------------------------------
-- intake_submissions is a permanent, exact record of what the customer
-- actually submitted — an audit-integrity rule, not a soft preference.
-- id, project_id, access_link_id, payload, and submitted_at may never
-- change through a normal UPDATE. id is included because PostgreSQL
-- primary keys are updatable unless explicitly guarded — a plain PK
-- declaration alone does not stop `UPDATE intake_submissions SET id = ...`.
-- Only status, reviewed_by, reviewed_at, and staff_note (the staff
-- review-workflow fields) may ever change.
CREATE FUNCTION public.guard_intake_submission_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.access_link_id IS DISTINCT FROM OLD.access_link_id
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
  THEN
    RAISE EXCEPTION 'intake_submissions.id/project_id/access_link_id/payload/submitted_at are immutable after INSERT (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_intake_submission_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_intake_submission_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_intake_submission_immutability() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_intake_submission_immutability() FROM service_role;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
CREATE TRIGGER intake_submissions_guard_link_type
  BEFORE INSERT ON public.intake_submissions
  FOR EACH ROW
  WHEN (NEW.access_link_id IS NOT NULL)
  EXECUTE FUNCTION public.guard_intake_link_type();

CREATE TRIGGER intake_submissions_guard_immutability
  BEFORE UPDATE ON public.intake_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_intake_submission_immutability();

-- ---------------------------------------------------------------------
-- RLS policies (§2.16, §15) — staff/admin only. No anon/customer/guest
-- policy — customer INTAKE submission is server-only via service_role
-- after token validation, never RLS-scoped (§10/§H).
-- ---------------------------------------------------------------------
CREATE POLICY intake_submissions_select_staff
  ON public.intake_submissions
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- No INSERT policy for any role — server-only via service_role (§12).

CREATE POLICY intake_submissions_update_staff
  ON public.intake_submissions
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- No DELETE policy for any role — audit trail, cascades only with the
-- parent Project (§5.C).
