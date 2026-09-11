-- WeddingClick V2 — Foundation Migration 0003
-- service_packages / service_addons catalog + approved seed catalog.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.4, §2.5, §16;
-- docs/DECISIONS.md "Commercial Packages".
--
-- Seed values are the currently approved catalog only (§16):
--   service_packages: COMMON 150000, SEPARATE 250000
--   service_addons:   PERSONALIZED_GUEST 50000
-- These rows are current-catalog data, never used to derive historical
-- Project pricing (projects/project_addons store their own snapshots —
-- migrations 0005/0006).
--
-- Ordering note: both tables' seed rows are inserted immediately after
-- CREATE TABLE, deliberately BEFORE ROW LEVEL SECURITY is enabled/forced
-- below. This makes the seed insert succeed regardless of whether the
-- migration-running role carries BYPASSRLS (see migration 0002's header
-- note on that assumption) — the seed does not need to lean on it, unlike
-- the profiles-recursion-avoidance mechanism in 0002, which structurally
-- does. Deterministic and idempotent (ON CONFLICT DO NOTHING) either way.
--
-- This migration is purely additive. It does not touch any V1 object.

-- ---------------------------------------------------------------------
-- Table: service_packages
-- ---------------------------------------------------------------------
CREATE TABLE public.service_packages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  price_vnd     INTEGER NOT NULL CHECK (price_vnd >= 0),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.service_packages IS
  'Current package catalog. Never used for historical Project pricing — Projects store snapshots. See docs/PHYSICAL_DATABASE_PLAN.md §2.4.';

-- ---------------------------------------------------------------------
-- Table: service_addons
-- ---------------------------------------------------------------------
CREATE TABLE public.service_addons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  price_vnd     INTEGER NOT NULL CHECK (price_vnd >= 0),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.service_addons IS
  'Add-on catalog. Structurally identical to service_packages. See docs/PHYSICAL_DATABASE_PLAN.md §2.5.';

-- ---------------------------------------------------------------------
-- Approved commercial catalog seed (deterministic, idempotent)
-- ---------------------------------------------------------------------
INSERT INTO public.service_packages (code, name, description, price_vnd, is_active)
VALUES
  ('COMMON',   'Common Invitation',                            'One shared invitation for both families.',       150000, true),
  ('SEPARATE', 'Separate Groom-side / Bride-side Invitations',  'Separate groom-side and bride-side invitations.', 250000, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.service_addons (code, name, description, price_vnd, is_active)
VALUES
  ('PERSONALIZED_GUEST', 'Personalized Guest Names', 'Personalized guest-name invitation links.', 50000, true)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- Explicit Data API privileges: service_packages
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.service_packages FROM PUBLIC;
REVOKE ALL ON TABLE public.service_packages FROM anon;
REVOKE ALL ON TABLE public.service_packages FROM authenticated;
REVOKE ALL ON TABLE public.service_packages FROM service_role;

-- authenticated: SELECT, INSERT, UPDATE (RLS further restricts INSERT/
-- UPDATE to is_admin()). No DELETE grant.
GRANT SELECT, INSERT, UPDATE ON TABLE public.service_packages TO authenticated;

-- service_role: SELECT only, for future customer/token server flows that
-- need to display current catalog pricing (e.g. PORTAL) without an Auth
-- session. No write grant — catalog admin remains an authenticated-admin
-- operation only.
GRANT SELECT ON TABLE public.service_packages TO service_role;

-- ---------------------------------------------------------------------
-- RLS: service_packages
-- ---------------------------------------------------------------------
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_packages FORCE ROW LEVEL SECURITY;

CREATE TRIGGER service_packages_set_updated_at
  BEFORE UPDATE ON public.service_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY service_packages_select_staff
  ON public.service_packages
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY service_packages_insert_admin
  ON public.service_packages
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY service_packages_update_admin
  ON public.service_packages
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No DELETE policy for any role: projects.service_package_id is RESTRICT
-- (migration 0005), so a used package row cannot be hard-deleted regardless;
-- retire via is_active = false.

-- ---------------------------------------------------------------------
-- Explicit Data API privileges: service_addons
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.service_addons FROM PUBLIC;
REVOKE ALL ON TABLE public.service_addons FROM anon;
REVOKE ALL ON TABLE public.service_addons FROM authenticated;
REVOKE ALL ON TABLE public.service_addons FROM service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.service_addons TO authenticated;
GRANT SELECT ON TABLE public.service_addons TO service_role;

-- ---------------------------------------------------------------------
-- RLS: service_addons
-- ---------------------------------------------------------------------
ALTER TABLE public.service_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_addons FORCE ROW LEVEL SECURITY;

CREATE TRIGGER service_addons_set_updated_at
  BEFORE UPDATE ON public.service_addons
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY service_addons_select_staff
  ON public.service_addons
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY service_addons_insert_admin
  ON public.service_addons
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY service_addons_update_admin
  ON public.service_addons
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No DELETE policy for any role: project_addons.service_addon_id is
-- RESTRICT (migration 0006); retire via is_active = false.
