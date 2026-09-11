-- WeddingClick V2 — Foundation Migration 0002
-- profiles table + centralized staff authorization helpers.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §1.1, §1.3, §2.1, §16, §P.
--
-- IMPORTANT — SECURITY DEFINER / BYPASSRLS assumption (§1.3, §P):
-- Every SECURITY DEFINER function below relies on being OWNED BY the same
-- role that runs this migration (no explicit OWNER TO is issued, so
-- ownership defaults to the migration-running role — "in Supabase this is
-- effectively the migration-running role" per §1.3). That owning role MUST
-- carry the BYPASSRLS attribute, or the profiles-table recursion described
-- in §1.3 is not actually prevented. In a normal hosted Supabase project,
-- migrations run as the `postgres` role, which Supabase grants BYPASSRLS
-- by default — no custom/undocumented role is created or required here.
-- This is an environment assumption, not a workaround; it must be verified
-- by the operator before this migration is applied to any environment
-- (see the final task report's KNOWN LIMITATIONS / MANUAL TEST STEPS).
--
-- This same assumption is load-bearing well beyond profiles: every later
-- Foundation-batch SECURITY DEFINER function that issues a fresh query
-- against a *different* FORCE-RLS table (not just NEW/OLD of its own
-- triggering row) — concretely, guard_project_addon_commercial_freeze()
-- and sync_project_commercial_totals() in migration 0006, both of which
-- query/update public.projects — depends on it too. If the owning role
-- ever lacks BYPASSRLS, those two functions would not error; they would
-- silently see zero rows (RLS-filtered) and silently fail to enforce the
-- freeze / silently fail to sync totals. See migration 0006's inline note.
--
-- No ADMIN profile is seeded here. Initial ADMIN bootstrap is an
-- operational, out-of-migration procedure (§P.1) — this migration commits
-- no real person's UUID/email to source control.
--
-- This migration is purely additive. It does not touch any V1 object.

-- ---------------------------------------------------------------------
-- Table: profiles
-- ---------------------------------------------------------------------
-- Sole exception to "every table gets gen_random_uuid() default" (§1.1):
-- a profile's id is always exactly the auth.users id it extends.
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
  display_name  TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'Internal WeddingClick identity extending Supabase Auth, 1:1. See docs/PHYSICAL_DATABASE_PLAN.md §2.1.';

-- ---------------------------------------------------------------------
-- Explicit Data API privileges (§SECURITY, revision: do not rely on
-- Supabase project default privileges — explicitly define the surface).
-- GRANT is the base object-level privilege layer; RLS (below) remains the
-- live row-level enforcement on top of it. Neither replaces the other.
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.profiles FROM authenticated;
REVOKE ALL ON TABLE public.profiles FROM service_role;

-- authenticated: SELECT/UPDATE only. No INSERT grant — new rows are
-- created exclusively via admin_create_profile() (SECURITY DEFINER,
-- executes as the function owner, so the calling role needs no table
-- INSERT grant for that path to work). No DELETE grant (§C).
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;

-- service_role: INSERT only, needed exclusively for the one-time, manual,
-- out-of-migration ADMIN bootstrap procedure (§P.1 — an operator-run
-- service_role SQL statement, never an application code path). No SELECT/
-- UPDATE/DELETE grant: no documented Foundation-batch server flow reads or
-- writes profiles via service_role beyond that one bootstrap INSERT.
GRANT INSERT ON TABLE public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- Authorization helpers (§1.3, §5.1 of docs/SECURITY.md)
-- ---------------------------------------------------------------------
-- current_user_role(): NULL if no row, or a row exists but is_active = false.
CREATE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
    AND is_active = true;
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_role() FROM anon;
REVOKE ALL ON FUNCTION public.current_user_role() FROM authenticated;
REVOKE ALL ON FUNCTION public.current_user_role() FROM service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

CREATE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.current_user_role() IN ('ADMIN', 'STAFF');
$$;

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff() FROM anon;
REVOKE ALL ON FUNCTION public.is_staff() FROM authenticated;
REVOKE ALL ON FUNCTION public.is_staff() FROM service_role;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

CREATE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.current_user_role() = 'ADMIN';
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM authenticated;
REVOKE ALL ON FUNCTION public.is_admin() FROM service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---------------------------------------------------------------------
-- profiles RLS policies (§2.1, corrected per [F11]: SELECT and the
-- self-update branch both require is_staff(), never bare auth.uid()).
-- ---------------------------------------------------------------------
CREATE POLICY profiles_select_staff
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- No INSERT policy for any role: new rows are created exclusively via
-- admin_create_profile() below, which enforces is_admin() internally.

CREATE POLICY profiles_update_self_or_admin
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((auth.uid() = id AND public.is_staff()) OR public.is_admin())
  WITH CHECK ((auth.uid() = id AND public.is_staff()) OR public.is_admin());

-- No DELETE policy for any role (§C — deactivate via is_active, never delete).

-- ---------------------------------------------------------------------
-- Guard triggers (§2.1, §P.2)
-- ---------------------------------------------------------------------
-- guard_last_active_admin(): concurrency-safe via a fixed advisory lock
-- ([F12]) — prevents the system from ever reaching zero active admins
-- through any normal UPDATE path.
CREATE FUNCTION public.guard_last_active_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_other_active_admins integer;
BEGIN
  -- Fixed, reserved advisory-lock key documented here and nowhere else
  -- reused (docs/PHYSICAL_DATABASE_PLAN.md §2.1). Forces every concurrent
  -- last-admin check across the whole database to run one at a time so
  -- two concurrent demotions of different admins cannot both see "1 other
  -- active admin" and both commit.
  PERFORM pg_advisory_xact_lock(872234501);

  SELECT count(*) INTO v_other_active_admins
  FROM public.profiles
  WHERE role = 'ADMIN'
    AND is_active = true
    AND id <> OLD.id;

  IF v_other_active_admins = 0 THEN
    RAISE EXCEPTION 'Cannot demote or deactivate the last active ADMIN profile (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only: no external EXECUTE grant to any role. Trigger firing does
-- not require it (Postgres invokes trigger functions internally).
REVOKE ALL ON FUNCTION public.guard_last_active_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_last_active_admin() FROM anon;
REVOKE ALL ON FUNCTION public.guard_last_active_admin() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_last_active_admin() FROM service_role;

-- guard_self_role_escalation(): an active non-admin may update their own
-- display_name (via the UPDATE policy above) but may never self-promote
-- role or reactivate/deactivate themselves.
CREATE FUNCTION public.guard_self_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Cannot change your own role or active status (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_self_role_escalation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_self_role_escalation() FROM anon;
REVOKE ALL ON FUNCTION public.guard_self_role_escalation() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_self_role_escalation() FROM service_role;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER profiles_guard_last_active_admin
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role = 'ADMIN' AND OLD.is_active = true AND (NEW.role <> 'ADMIN' OR NEW.is_active = false))
  EXECUTE FUNCTION public.guard_last_active_admin();

CREATE TRIGGER profiles_guard_self_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (auth.uid() = OLD.id AND NOT public.is_admin())
  EXECUTE FUNCTION public.guard_self_role_escalation();

-- ---------------------------------------------------------------------
-- admin_create_profile(): the sole path for new profile rows (§2.1).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.admin_create_profile(
  target_auth_user_id uuid,
  target_role text,
  target_display_name text
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an active ADMIN may create a profile';
  END IF;

  INSERT INTO public.profiles (id, role, display_name, is_active)
  VALUES (target_auth_user_id, target_role, target_display_name, true)
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

COMMENT ON FUNCTION public.admin_create_profile(uuid, text, text) IS
  'Only path to create a profiles row. Requires an active ADMIN caller. role/display_name are still enforced by the table CHECK constraints on profiles.';

REVOKE ALL ON FUNCTION public.admin_create_profile(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_profile(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_create_profile(uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_create_profile(uuid, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_profile(uuid, text, text) TO authenticated;
