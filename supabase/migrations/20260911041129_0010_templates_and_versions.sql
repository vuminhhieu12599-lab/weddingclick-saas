-- WeddingClick V2 — Foundation Migration 0010
-- templates and template_versions tables.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.10 (templates),
-- §2.11 (template_versions, [F10]), §15 (RLS Matrix), §16 (Migration Order).
--
-- Scope: database foundation only. No project_design, no
-- project_invitations, no invitation_versions, no renderer code, no
-- TypeScript manifests, no seed template rows (the frozen plan does not
-- require seeding actual commercial templates in this migration).
--
-- This migration is purely additive. It does not touch any V1 object.

-- ---------------------------------------------------------------------
-- public.templates (§2.10)
-- ---------------------------------------------------------------------
CREATE TABLE public.templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  code                TEXT NOT NULL UNIQUE,

  event_type          TEXT NOT NULL DEFAULT 'WEDDING'
                        CHECK (event_type IN ('WEDDING')),

  name                TEXT NOT NULL,
  description         TEXT,

  is_active           BOOLEAN NOT NULL DEFAULT true,
  sort_order          INTEGER NOT NULL DEFAULT 0,

  preview_media_path  TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.templates IS
  'Template family/catalog entry. See docs/PHYSICAL_DATABASE_PLAN.md §2.10.';
COMMENT ON COLUMN public.templates.is_active IS
  'Retirement flag for the template family itself. No paired boolean elsewhere on this table.';

-- ---------------------------------------------------------------------
-- Explicit Data API privileges — templates
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.templates FROM PUBLIC;
REVOKE ALL ON TABLE public.templates FROM anon;
REVOKE ALL ON TABLE public.templates FROM authenticated;
REVOKE ALL ON TABLE public.templates FROM service_role;

-- authenticated represents both STAFF and ADMIN sessions; RLS distinguishes
-- STAFF (SELECT only) from ADMIN (SELECT/INSERT/UPDATE). No DELETE grant —
-- template_versions.template_id is RESTRICT, and templates are retired via
-- is_active = false, never hard-deleted.
GRANT SELECT, INSERT, UPDATE ON TABLE public.templates TO authenticated;

-- No service_role business path in this migration.

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates FORCE ROW LEVEL SECURITY;

CREATE TRIGGER templates_set_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS policies — templates (§2.10, §15)
-- ---------------------------------------------------------------------
CREATE POLICY templates_select_staff
  ON public.templates
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY templates_insert_admin
  ON public.templates
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY templates_update_admin
  ON public.templates
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No DELETE policy for any role — retire via is_active = false.

-- ---------------------------------------------------------------------
-- public.template_versions (§2.11, [F10])
-- ---------------------------------------------------------------------
CREATE TABLE public.template_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  template_id      UUID NOT NULL
                     REFERENCES public.templates (id) ON DELETE RESTRICT,

  version_number   INTEGER NOT NULL
                     CHECK (version_number > 0),

  renderer_key     TEXT NOT NULL UNIQUE,

  manifest         JSONB NOT NULL,

  -- NULL = selectable for new projects/designs; non-NULL = retired. Sole
  -- source of truth — no paired is_active_for_new_projects boolean (§1.5).
  retired_at       TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT template_versions_template_id_version_number_key
    UNIQUE (template_id, version_number)
);

COMMENT ON TABLE public.template_versions IS
  'Immutable logical version metadata for one template implementation. See docs/PHYSICAL_DATABASE_PLAN.md §2.11 ([F10]).';
COMMENT ON COLUMN public.template_versions.retired_at IS
  'NULL = available for new selections; non-NULL = retired. Sole source of truth — no paired boolean. Only column a normal UPDATE may change ([F10]).';
COMMENT ON COLUMN public.template_versions.manifest IS
  'Supported features/presets metadata. Immutable after INSERT — see guard_template_version_immutability() ([F10]). Create a new version instead of editing a used one (CLAUDE.md §9).';

-- No updated_at column on template_versions per the frozen plan — created_at
-- plus retired_at are the only timestamps this table has.

-- ---------------------------------------------------------------------
-- Explicit Data API privileges — template_versions
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.template_versions FROM PUBLIC;
REVOKE ALL ON TABLE public.template_versions FROM anon;
REVOKE ALL ON TABLE public.template_versions FROM authenticated;
REVOKE ALL ON TABLE public.template_versions FROM service_role;

-- authenticated: SELECT, INSERT, UPDATE (RLS restricts to is_staff()/
-- is_admin(); the immutability trigger below then restricts a successful
-- UPDATE to retired_at only). No DELETE grant — RESTRICT FKs from future
-- project_design/invitation_versions tables mean a referenced version can
-- never be hard-deleted regardless.
GRANT SELECT, INSERT, UPDATE ON TABLE public.template_versions TO authenticated;

-- No service_role business path in this migration.

ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_versions FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- guard_template_version_immutability() ([F10])
-- ---------------------------------------------------------------------
-- Freezes every column except retired_at. manifest is included
-- unconditionally — [F10] explicitly corrects the earlier "manifest
-- mutable by convention" design, since a changed manifest on an
-- already-used version is exactly the silent visual/capability-contract
-- change CLAUDE.md §9 forbids ("do not edit v1 to become visually
-- different... create v2"). The frozen plan does not pair retired_at with
-- a monotonic NULL -> non-NULL-only rule; this trigger does not invent one.
CREATE FUNCTION public.guard_template_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.renderer_key IS DISTINCT FROM OLD.renderer_key
     OR NEW.manifest IS DISTINCT FROM OLD.manifest
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'template_versions is immutable except retired_at (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_template_version_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_template_version_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_template_version_immutability() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_template_version_immutability() FROM service_role;

CREATE TRIGGER template_versions_guard_immutability
  BEFORE UPDATE ON public.template_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_template_version_immutability();

-- ---------------------------------------------------------------------
-- RLS policies — template_versions (§2.11, §15)
-- ---------------------------------------------------------------------
CREATE POLICY template_versions_select_staff
  ON public.template_versions
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY template_versions_insert_admin
  ON public.template_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- ADMIN may attempt an UPDATE; guard_template_version_immutability() above
-- limits a successful UPDATE to retired_at only. Column-level immutability
-- is enforced by the trigger, not encoded in the policy.
CREATE POLICY template_versions_update_admin
  ON public.template_versions
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No DELETE policy for any role.
