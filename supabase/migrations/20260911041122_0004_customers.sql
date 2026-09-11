-- WeddingClick V2 — Foundation Migration 0004
-- customers table.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.2, §16.
--
-- Never created/linked by an INTAKE token — always staff-created before a
-- Project exists ([R5]). No Customer authentication/accounts.
--
-- This migration is purely additive. It does not touch any V1 object.

CREATE TABLE public.customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  phone         TEXT,
  email         TEXT,
  contact_note  TEXT,
  created_by    UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customers IS
  'Person buying/owning a WeddingClick Project. Never created/linked by an INTAKE token. See docs/PHYSICAL_DATABASE_PLAN.md §2.2.';

-- No uniqueness on phone/email — a family may legitimately share a phone;
-- not a business identity key (§2.2).
CREATE INDEX customers_created_by_idx ON public.customers (created_by);
CREATE INDEX customers_display_name_lower_idx ON public.customers (lower(display_name));

-- ---------------------------------------------------------------------
-- Explicit Data API privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.customers FROM PUBLIC;
REVOKE ALL ON TABLE public.customers FROM anon;
REVOKE ALL ON TABLE public.customers FROM authenticated;
REVOKE ALL ON TABLE public.customers FROM service_role;

-- authenticated: SELECT, INSERT, UPDATE (RLS further restricts to
-- is_staff()). No DELETE grant (§C, §Q5).
GRANT SELECT, INSERT, UPDATE ON TABLE public.customers TO authenticated;

-- service_role: no grant. Per §R5, customers is never touched by the
-- INTAKE token flow or any other documented service_role path in the
-- frozen plan — a customer row is always staff-created before a Project
-- exists, via the authenticated-session path only.

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY customers_select_staff
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY customers_insert_staff
  ON public.customers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY customers_update_staff
  ON public.customers
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- No DELETE policy for any role (§C, §Q5 — exceptional erasure only, by a
-- manual documented service_role procedure, never through the app).
