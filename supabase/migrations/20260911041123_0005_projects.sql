-- WeddingClick V2 — Foundation Migration 0005
-- projects table (the aggregate root) + project_code_seq + generate_project_code().
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §1.7, §2.3, §16;
-- docs/DECISIONS.md "Commercial Packages" / "Project Lifecycle".
--
-- This migration is purely additive. It does not touch any V1 object.

-- ---------------------------------------------------------------------
-- project_code_seq + generate_project_code() (§1.7, [F2])
-- ---------------------------------------------------------------------
-- Created once here. Never reset — not yearly, not ever. NO CYCLE means it
-- errors rather than wraps if it somehow reached the BIGINT maximum.
CREATE SEQUENCE public.project_code_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

-- Explicit Data API privileges: no role may consume this sequence
-- directly (USAGE/SELECT/UPDATE). The only controlled route to advance it
-- is generate_project_code() below (SECURITY DEFINER, executes as the
-- owner, which implicitly has full rights on objects it owns — no
-- separate sequence grant is needed for that function to call nextval()).
-- Do not rely on Supabase project default privileges for this.
REVOKE ALL ON SEQUENCE public.project_code_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.project_code_seq FROM anon;
REVOKE ALL ON SEQUENCE public.project_code_seq FROM authenticated;
REVOKE ALL ON SEQUENCE public.project_code_seq FROM service_role;

-- WC-YYYY-NNNNNN. YYYY is the creation-time year in Asia/Ho_Chi_Minh, not
-- UTC and not the session timezone. The numeric part is left-padded to at
-- least 6 digits (lpad does not truncate past 6). Client never calculates
-- the next number — this function is the column DEFAULT, evaluated by
-- Postgres at INSERT time; it takes no arguments derived from sibling
-- columns, so a plain column DEFAULT is valid here (unlike
-- project_invitations.public_slug in a later migration).
-- Deliberately NOT STABLE: nextval() has side effects.
CREATE FUNCTION public.generate_project_code()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 'WC-' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY')
         || '-' || lpad(nextval('public.project_code_seq')::text, 6, '0');
$$;

COMMENT ON FUNCTION public.generate_project_code() IS
  'DEFAULT for projects.project_code. WC-YYYY-NNNNNN, YYYY in Asia/Ho_Chi_Minh, sequence never reset. See docs/PHYSICAL_DATABASE_PLAN.md §1.7.';

REVOKE ALL ON FUNCTION public.generate_project_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_project_code() FROM anon;
REVOKE ALL ON FUNCTION public.generate_project_code() FROM authenticated;
REVOKE ALL ON FUNCTION public.generate_project_code() FROM service_role;
GRANT EXECUTE ON FUNCTION public.generate_project_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_project_code() TO service_role;

-- ---------------------------------------------------------------------
-- Table: projects
-- ---------------------------------------------------------------------
CREATE TABLE public.projects (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code            TEXT NOT NULL UNIQUE DEFAULT public.generate_project_code(),
  customer_id             UUID NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  event_type              TEXT NOT NULL DEFAULT 'WEDDING' CHECK (event_type IN ('WEDDING')),
  status                  TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN (
                             'NEW', 'WAITING_FOR_INFO', 'IN_PROGRESS', 'INTERNAL_REVIEW',
                             'CUSTOMER_REVIEW', 'REVISION_REQUIRED', 'APPROVED',
                             'AWAITING_PAYMENT', 'READY_TO_PUBLISH', 'PUBLISHED',
                             'COMPLETED', 'ARCHIVED'
                           )),
  deadline_at             TIMESTAMPTZ,
  assigned_staff_id       UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  service_package_id      UUID REFERENCES public.service_packages (id) ON DELETE RESTRICT,
  package_code_snapshot   TEXT NOT NULL,
  package_name_snapshot   TEXT NOT NULL,
  base_price_vnd          INTEGER NOT NULL CHECK (base_price_vnd >= 0),
  addon_total_vnd         INTEGER NOT NULL DEFAULT 0 CHECK (addon_total_vnd >= 0),
  total_price_vnd         INTEGER NOT NULL CHECK (total_price_vnd >= 0),
  payment_status          TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PAID')),
  paid_at                 TIMESTAMPTZ,
  internal_note           TEXT,
  created_by              UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at            TIMESTAMPTZ,
  archived_at             TIMESTAMPTZ,
  CONSTRAINT projects_total_price_consistent
    CHECK (total_price_vnd = base_price_vnd + addon_total_vnd),
  CONSTRAINT projects_paid_at_consistent
    CHECK ((payment_status = 'PAID') = (paid_at IS NOT NULL))
);

COMMENT ON TABLE public.projects IS
  'One operational customer order/event — the aggregate root. See docs/PHYSICAL_DATABASE_PLAN.md §2.3.';
COMMENT ON COLUMN public.projects.assigned_staff_id IS
  'Responsibility/assignment label only — never an RLS visibility filter (all active STAFF see all Projects, §R-Q1).';
COMMENT ON COLUMN public.projects.addon_total_vnd IS
  'Maintained by sync_project_commercial_totals() (migration 0006), not written directly by application code in normal operation.';

CREATE INDEX projects_customer_id_idx ON public.projects (customer_id);
CREATE INDEX projects_assigned_staff_id_idx ON public.projects (assigned_staff_id);
CREATE INDEX projects_status_deadline_idx ON public.projects (status, deadline_at);

-- ---------------------------------------------------------------------
-- Explicit Data API privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.projects FROM PUBLIC;
REVOKE ALL ON TABLE public.projects FROM anon;
REVOKE ALL ON TABLE public.projects FROM authenticated;
REVOKE ALL ON TABLE public.projects FROM service_role;

-- authenticated: SELECT, INSERT, UPDATE (RLS further restricts to
-- is_staff(); UPDATE additionally frozen post-PAID by the trigger below).
-- No DELETE grant (§C, §Q5 — archive via status/archived_at only).
GRANT SELECT, INSERT, UPDATE ON TABLE public.projects TO authenticated;

-- service_role: SELECT only, for future customer/token server flows
-- (INTAKE/REVIEW/PORTAL, post-Foundation) that need minimal project
-- display context without an Auth session. No write grant — normal
-- project mutation remains the authenticated-staff-session path only
-- (§1.4); nothing in the Foundation batch requires service_role to write
-- projects directly.
GRANT SELECT ON TABLE public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- guard_project_commercial_freeze() — projects side ([F8], monotonic).
-- ---------------------------------------------------------------------
-- UNPAID -> PAID is normal application flow (this trigger's WHEN clause
-- does not even fire when OLD.payment_status = 'UNPAID'). Once PAID, this
-- blocks PAID -> UNPAID *and* any change to the six frozen commercial
-- columns, for every normal code path. An exceptional correction/rollback
-- requires a documented DBA/service_role procedure that temporarily
-- disables this trigger — never a normal app feature.
CREATE FUNCTION public.guard_project_commercial_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.payment_status <> 'PAID'
     OR NEW.service_package_id IS DISTINCT FROM OLD.service_package_id
     OR NEW.package_code_snapshot IS DISTINCT FROM OLD.package_code_snapshot
     OR NEW.package_name_snapshot IS DISTINCT FROM OLD.package_name_snapshot
     OR NEW.base_price_vnd IS DISTINCT FROM OLD.base_price_vnd
     OR NEW.addon_total_vnd IS DISTINCT FROM OLD.addon_total_vnd
     OR NEW.total_price_vnd IS DISTINCT FROM OLD.total_price_vnd
  THEN
    RAISE EXCEPTION 'Project % commercial data is frozen once payment_status = PAID', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only: no external EXECUTE grant to any role. Trigger firing does
-- not require it (Postgres invokes trigger functions internally).
REVOKE ALL ON FUNCTION public.guard_project_commercial_freeze() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_project_commercial_freeze() FROM anon;
REVOKE ALL ON FUNCTION public.guard_project_commercial_freeze() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_project_commercial_freeze() FROM service_role;

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER projects_guard_commercial_freeze
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  WHEN (OLD.payment_status = 'PAID')
  EXECUTE FUNCTION public.guard_project_commercial_freeze();

-- ---------------------------------------------------------------------
-- RLS policies (§2.3, §R-Q1: all active STAFF see/manage all Projects)
-- ---------------------------------------------------------------------
CREATE POLICY projects_select_staff
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY projects_insert_staff
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY projects_update_staff
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- No DELETE policy for any role (§C, §Q5 — archive via status/archived_at only).
