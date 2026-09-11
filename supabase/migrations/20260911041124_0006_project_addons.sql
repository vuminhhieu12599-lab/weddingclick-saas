-- WeddingClick V2 — Foundation Migration 0006
-- project_addons table.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.6, §16, §D (money model).
--
-- NAMING NOTE — APPROVED by external review (Task 002 revision round 2):
-- the project_addons-side PAID-freeze guard is named
-- guard_project_addon_commercial_freeze(), distinct from the projects-side
-- guard_project_commercial_freeze() (migration 0005). PostgreSQL cannot
-- host two distinct zero-argument functions with the identical name in one
-- schema, so these two functions — identical in intent, each enforcing the
-- PAID freeze on its own table — always needed distinct SQL identifiers.
-- docs/PHYSICAL_DATABASE_PLAN.md and docs/DATABASE.md have been updated in
-- this same revision to name both functions distinctly, matching this
-- file (see the final task report's DOCUMENTATION SYNC section). No table,
-- column, constraint, RLS policy, or business rule differs from the
-- frozen plan — naming only.
--
-- This migration is purely additive. It does not touch any V1 object.

CREATE TABLE public.project_addons (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  service_addon_id       UUID NOT NULL REFERENCES public.service_addons (id) ON DELETE RESTRICT,
  addon_code_snapshot    TEXT NOT NULL,
  addon_name_snapshot    TEXT NOT NULL,
  price_vnd_snapshot     INTEGER NOT NULL CHECK (price_vnd_snapshot >= 0),
  created_by             UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  revoked_at             TIMESTAMPTZ,
  revoked_by             UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  revoked_reason         TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_addons IS
  'Add-ons purchased for a Project. Per-add-on purchase snapshots; revocation is soft, re-adding after revocation creates a new row. See docs/PHYSICAL_DATABASE_PLAN.md §2.6.';
COMMENT ON COLUMN public.project_addons.revoked_at IS
  'NULL = active/entitled. Sole source of truth for active/inactive state — no paired boolean.';

-- At most one ACTIVE row per Project/add-on; a revoked-then-re-added
-- add-on is a new row, and the old row remains as history.
CREATE UNIQUE INDEX project_addons_active_unique_idx
  ON public.project_addons (project_id, service_addon_id)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------
-- Explicit Data API privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.project_addons FROM PUBLIC;
REVOKE ALL ON TABLE public.project_addons FROM anon;
REVOKE ALL ON TABLE public.project_addons FROM authenticated;
REVOKE ALL ON TABLE public.project_addons FROM service_role;

-- authenticated: SELECT, INSERT, UPDATE (RLS further restricts to
-- is_staff(); column-level immutability/freeze enforced by the guard
-- triggers below, not by the grant). No DELETE grant — revoke, never
-- delete.
GRANT SELECT, INSERT, UPDATE ON TABLE public.project_addons TO authenticated;

-- service_role: SELECT only, for future customer/token server flows that
-- need to derive entitlement (e.g. Guest Tool: "at least one non-revoked
-- project_addons row for the relevant service_addon_id") without an Auth
-- session. No write grant — add-on purchase/revocation remains the
-- authenticated-staff-session path only.
GRANT SELECT ON TABLE public.project_addons TO service_role;

ALTER TABLE public.project_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_addons FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- guard_project_addon_identity_immutability() ([F9])
-- ---------------------------------------------------------------------
-- These seven columns are never mutable through normal application code
-- after insert, full stop, unconditionally regardless of the parent
-- Project's payment_status. Only revoked_at/revoked_by/revoked_reason may
-- ever change, and only while guard_project_addon_commercial_freeze()
-- below still permits it.
CREATE FUNCTION public.guard_project_addon_identity_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.service_addon_id IS DISTINCT FROM OLD.service_addon_id
     OR NEW.addon_code_snapshot IS DISTINCT FROM OLD.addon_code_snapshot
     OR NEW.addon_name_snapshot IS DISTINCT FROM OLD.addon_name_snapshot
     OR NEW.price_vnd_snapshot IS DISTINCT FROM OLD.price_vnd_snapshot
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'project_addons identity/snapshot columns are immutable after INSERT (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_project_addon_identity_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_project_addon_identity_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_project_addon_identity_immutability() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_project_addon_identity_immutability() FROM service_role;

-- ---------------------------------------------------------------------
-- guard_project_addon_revocation_immutability() — revocation is monotonic
-- ---------------------------------------------------------------------
-- Once revoked_at first becomes non-NULL, the entire revocation record
-- (revoked_at, revoked_by, revoked_reason) is frozen: it can never be
-- changed back to NULL (no "un-revoking" / resurrecting an old snapshot)
-- and it can never be changed to a different value (no rewriting history).
-- While the row is still active (OLD.revoked_at IS NULL), the first
-- revocation (NULL -> non-NULL) remains freely allowed here — subject
-- only to guard_project_addon_commercial_freeze() below, which additionally
-- blocks it once the parent Project is PAID. If the customer wants the
-- same add-on again after revocation while still UNPAID, application code
-- creates a NEW project_addons row (a fresh purchase snapshot) rather than
-- reviving this one — this guard is what makes that the only possible path.
CREATE FUNCTION public.guard_project_addon_revocation_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    IF NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
       OR NEW.revoked_by IS DISTINCT FROM OLD.revoked_by
       OR NEW.revoked_reason IS DISTINCT FROM OLD.revoked_reason
    THEN
      RAISE EXCEPTION 'project_addons revocation record is immutable once revoked_at is set (id=%)', OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_project_addon_revocation_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_project_addon_revocation_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_project_addon_revocation_immutability() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_project_addon_revocation_immutability() FROM service_role;

-- ---------------------------------------------------------------------
-- guard_project_addon_commercial_freeze() — see naming note at top of file.
-- ---------------------------------------------------------------------
-- Blocks adding AND revoking add-ons once the parent Project is PAID — so
-- once PAID, even the revocation trio becomes frozen (in addition to the
-- identity/snapshot columns already frozen unconditionally above).
--
-- CONCURRENCY / SERIALIZATION POINT (Task 002 revision round 4): the
-- SELECT below uses FOR UPDATE to take a row lock on the parent projects
-- row BEFORE this project_addons row is inserted/updated. This is the
-- transaction's only lock acquisition on that project — everything else
-- in this trigger, and sync_project_commercial_totals() below, executes
-- while already holding it, until this transaction commits or rolls back.
-- This serves two purposes:
--   1. Same-Project addon mutations serialize. Two concurrent INSERT/
--      UPDATE statements on project_addons for the same project_id can no
--      longer both read a stale, pre-mutation view of the sibling rows and
--      then race to overwrite projects.addon_total_vnd — the second
--      transaction's SELECT ... FOR UPDATE here blocks until the first
--      transaction (guard + INSERT/UPDATE + sync_project_commercial_totals()
--      SUM + UPDATE) has fully committed, so its own subsequent SUM in
--      sync_project_commercial_totals() sees the first transaction's
--      already-committed rows. No lost update, no stale total.
--   2. Addon mutation and the UNPAID -> PAID transition serialize against
--      each other, because a plain UPDATE on projects (e.g. the
--      payment_status transition) also takes an ordinary row lock on that
--      same row: whichever transaction acquires the row lock first wins —
--      if an addon mutation locks first, the PAID transition waits until
--      it fully commits (totals finish first); if the PAID transition
--      locks first, the addon mutation waits, then observes PAID once
--      unblocked and is rejected below, exactly as before.
-- sync_project_commercial_totals() remains the sole, authoritative full
-- SUM recomputation per the frozen design — this change adds locking
-- around the existing read/write, it does not replace it with arithmetic
-- carried in this function or in application code.
--
-- BYPASSRLS DEPENDENCY: this function issues a fresh SELECT ... FOR UPDATE
-- against public.projects, a different FORCE-RLS table. It relies on the
-- same owner-has-BYPASSRLS assumption documented in migration 0002's
-- header — without it, this SELECT would be silently RLS-filtered to zero
-- rows. The FAIL CLOSED check immediately below converts that scenario
-- (and the genuine "no such project" scenario) into a loud, explicit
-- exception rather than letting v_payment_status stay NULL and the freeze
-- silently fail to trigger — closing the silent-failure risk previously
-- noted here, though the underlying BYPASSRLS environment assumption
-- itself is unchanged and still must be verified per migration 0002.
CREATE FUNCTION public.guard_project_addon_commercial_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment_status text;
BEGIN
  SELECT payment_status INTO v_payment_status
  FROM public.projects
  WHERE id = NEW.project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot add, modify, or revoke add-ons: parent Project % not found', NEW.project_id;
  END IF;

  IF v_payment_status = 'PAID' THEN
    RAISE EXCEPTION 'Cannot add, modify, or revoke add-ons once Project % is PAID', NEW.project_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_project_addon_commercial_freeze() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_project_addon_commercial_freeze() FROM anon;
REVOKE ALL ON FUNCTION public.guard_project_addon_commercial_freeze() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_project_addon_commercial_freeze() FROM service_role;

-- ---------------------------------------------------------------------
-- sync_project_commercial_totals() ([R8])
-- ---------------------------------------------------------------------
-- Recomputes projects.addon_total_vnd from the live sum of non-revoked
-- price_vnd_snapshot rows and derives total_price_vnd, in the same
-- transaction as the triggering project_addons write. Because
-- guard_project_addon_commercial_freeze() above always runs first (BEFORE)
-- and blocks the write entirely when the project is PAID, this AFTER
-- trigger only ever executes while the parent Project is still UNPAID —
-- the two triggers compose correctly by construction, not by coincidence.
-- It also always executes while still holding the SELECT ... FOR UPDATE
-- row lock that guard_project_addon_commercial_freeze() took on this same
-- projects row earlier in the same transaction (Task 002 revision round
-- 4) — no concurrent transaction touching the same project_id can be
-- mid-flight here, so this SUM is always computed over a fully-settled
-- view of this project's project_addons rows, never a partial one. This
-- remains the sole, authoritative full-SUM recomputation; nothing about
-- its own SQL changed in this revision, only what happens before it.
--
-- BYPASSRLS DEPENDENCY: same as guard_project_addon_commercial_freeze()
-- above — this function both re-queries public.project_addons (a fresh
-- SELECT, not NEW/OLD) and UPDATEs public.projects, a different FORCE-RLS
-- table. Without the owner-has-BYPASSRLS assumption (migration 0002), the
-- SUM could silently see fewer rows than actually exist and/or the UPDATE
-- could silently affect zero rows, desynchronizing addon_total_vnd/
-- total_price_vnd without any error being raised.
CREATE FUNCTION public.sync_project_commercial_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_addon_total integer;
BEGIN
  SELECT COALESCE(SUM(price_vnd_snapshot), 0) INTO v_addon_total
  FROM public.project_addons
  WHERE project_id = NEW.project_id
    AND revoked_at IS NULL;

  UPDATE public.projects
  SET addon_total_vnd = v_addon_total,
      total_price_vnd = base_price_vnd + v_addon_total
  WHERE id = NEW.project_id;

  RETURN NEW;
END;
$$;

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.sync_project_commercial_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_project_commercial_totals() FROM anon;
REVOKE ALL ON FUNCTION public.sync_project_commercial_totals() FROM authenticated;
REVOKE ALL ON FUNCTION public.sync_project_commercial_totals() FROM service_role;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
CREATE TRIGGER project_addons_guard_identity_immutability
  BEFORE UPDATE ON public.project_addons
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_project_addon_identity_immutability();

CREATE TRIGGER project_addons_guard_revocation_immutability
  BEFORE UPDATE ON public.project_addons
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_project_addon_revocation_immutability();

CREATE TRIGGER project_addons_guard_commercial_freeze
  BEFORE INSERT OR UPDATE ON public.project_addons
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_project_addon_commercial_freeze();

CREATE TRIGGER project_addons_sync_commercial_totals
  AFTER INSERT OR UPDATE ON public.project_addons
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_project_commercial_totals();

-- ---------------------------------------------------------------------
-- RLS policies (§2.6)
-- ---------------------------------------------------------------------
CREATE POLICY project_addons_select_staff
  ON public.project_addons
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY project_addons_insert_staff
  ON public.project_addons
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY project_addons_update_staff
  ON public.project_addons
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- No DELETE policy for any role — revoke, never delete.
