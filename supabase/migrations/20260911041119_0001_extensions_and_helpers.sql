-- WeddingClick V2 — Foundation Migration 0001
-- Extensions and common helpers.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §16 (migration
-- 0001_extensions_and_helpers.sql), §1.2 (updated_at convention).
--
-- This migration is purely additive. It does not touch any V1 object
-- (public.invitations, public.weddings, public.wishes, wedding-photos
-- Storage bucket).

-- ---------------------------------------------------------------------
-- Required extension
-- ---------------------------------------------------------------------
-- gen_random_uuid() is the DEFAULT for every V2 table's surrogate primary
-- key except public.profiles (docs/PHYSICAL_DATABASE_PLAN.md §1.1).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Shared updated_at maintenance trigger
-- ---------------------------------------------------------------------
-- Every V2 table with an updated_at column uses this single BEFORE UPDATE
-- trigger function (docs/PHYSICAL_DATABASE_PLAN.md §1.2).
--
-- Deliberately NOT SECURITY DEFINER: it only ever stamps NEW.updated_at on
-- the row already being written under the invoking role's own, already-
-- authorized UPDATE privilege. It performs no cross-table reads and needs
-- no elevated privilege, so it is not part of the SECURITY DEFINER
-- hardening set described in docs/PHYSICAL_DATABASE_PLAN.md §1.3 (that set
-- is enumerated there as current_user_role, is_staff, is_admin,
-- log_activity, admin_create_profile, generate_project_code,
-- generate_invitation_slug, and the per-table guard/trigger functions that
-- read other rows/tables to enforce a business rule).
CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Shared BEFORE UPDATE trigger: stamps NEW.updated_at = now(). Attached per-table starting in migration 0002.';

-- ---------------------------------------------------------------------
-- Explicit Data API privileges (trigger-only function)
-- ---------------------------------------------------------------------
-- Do not rely on Supabase project default privileges for anon/authenticated/
-- service_role — explicitly revoke from every externally-reachable role.
-- Trigger firing does NOT require EXECUTE privilege for the invoking
-- session (Postgres invokes trigger functions internally), so this
-- function remains fully usable as a BEFORE UPDATE trigger on every table
-- while being non-callable as a direct RPC by any role.
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM service_role;
