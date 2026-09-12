-- WeddingClick V2 — Foundation Migration 0011
-- project_design table.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.12 (project_design),
-- §15 (RLS Matrix), §16 (Migration Order).
--
-- Scope: database foundation only. No project_invitations, no
-- invitation_versions, no design editor UI, no template renderer, no
-- manifest validation code, no preview/customer-review routes, no
-- snapshot generation, no Storage work, no template seed data.
--
-- This migration is purely additive. It does not touch any V1 object.

-- ---------------------------------------------------------------------
-- public.project_design (§2.12)
-- ---------------------------------------------------------------------
-- One shared, mutable draft design configuration per Project. COMMON,
-- GROOM, and BRIDE invitation variants all read this same project-level
-- row in V1 — there is no per-variant design row (CLAUDE.md §4).
CREATE TABLE public.project_design (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- UNIQUE enforces at most one project_design row per Project. A Project
  -- may exist before its design is configured — this is not a "must always
  -- have exactly one row" invariant, just a cap of one.
  project_id            UUID NOT NULL UNIQUE
                          REFERENCES public.projects (id) ON DELETE CASCADE,

  -- References a concrete immutable template version, not merely a
  -- template family. RESTRICT: a template_versions row can never be
  -- hard-deleted while any project_design still points to it. No FK/check/
  -- trigger against template_versions.retired_at here — selecting a
  -- retired version for new design work is application/domain validation,
  -- and an existing design must remain able to reference a version after
  -- it is retired.
  template_version_id  UUID NOT NULL
                          REFERENCES public.template_versions (id) ON DELETE RESTRICT,

  -- Validated against the selected template version's manifest at the
  -- application/domain layer, not a DB CHECK — supported keys vary by
  -- template version.
  palette_key           TEXT NOT NULL,
  font_preset_key       TEXT NOT NULL,
  effect_preset_key     TEXT NOT NULL,

  -- Template-approved options only, validated at the application layer.
  -- No JSON-schema validation in the database.
  section_settings      JSONB NOT NULL DEFAULT '{}'::jsonb,
  design_settings       JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_design IS
  'One shared, mutable draft design configuration per Project. See docs/PHYSICAL_DATABASE_PLAN.md §2.12. Not per-invitation-variant — COMMON/GROOM/BRIDE share this row (CLAUDE.md §4).';
COMMENT ON COLUMN public.project_design.template_version_id IS
  'Concrete immutable template version, not a template family. No DB guard against retired_at — retired-version selection is application/domain validation, not a DB constraint.';
COMMENT ON COLUMN public.project_design.palette_key IS
  'Validated against the selected template version manifest at the application layer, not a DB CHECK.';
COMMENT ON COLUMN public.project_design.font_preset_key IS
  'Validated against the selected template version manifest at the application layer, not a DB CHECK.';
COMMENT ON COLUMN public.project_design.effect_preset_key IS
  'Validated against the selected template version manifest at the application layer, not a DB CHECK.';

-- No immutability trigger: project_design is mutable draft state. Staff
-- must be able to edit template_version_id/palette_key/font_preset_key/
-- effect_preset_key/section_settings/design_settings before a Review
-- snapshot is created. Published/review immutability belongs to
-- invitation_versions later, not here.

-- ---------------------------------------------------------------------
-- Explicit Data API privileges — project_design
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.project_design FROM PUBLIC;
REVOKE ALL ON TABLE public.project_design FROM anon;
REVOKE ALL ON TABLE public.project_design FROM authenticated;
REVOKE ALL ON TABLE public.project_design FROM service_role;

-- authenticated represents both STAFF and ADMIN sessions; RLS grants both
-- equal SELECT/INSERT/UPDATE (§15 RLS Matrix: STAFF R/C/U, ADMIN R/C/U —
-- no admin-only gate here, unlike templates/template_versions). No DELETE
-- grant — no normal hard delete; the row disappears only via the parent
-- Project's ON DELETE CASCADE. No service_role business path: normal staff
-- mutations use the authenticated staff JWT + RLS (§1.4).
GRANT SELECT, INSERT, UPDATE ON TABLE public.project_design TO authenticated;

ALTER TABLE public.project_design ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_design FORCE ROW LEVEL SECURITY;

CREATE TRIGGER project_design_set_updated_at
  BEFORE UPDATE ON public.project_design
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS policies — project_design (§2.12, §15)
-- ---------------------------------------------------------------------
CREATE POLICY project_design_select_staff
  ON public.project_design
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY project_design_insert_staff
  ON public.project_design
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY project_design_update_staff
  ON public.project_design
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- No DELETE policy for any role — the row only disappears via the parent
-- Project's ON DELETE CASCADE, never a normal hard delete.

-- No anon policy. No customer-token policy. Customer REVIEW later renders
-- immutable invitation_versions snapshots, not a live read of
-- project_design (§15 RLS Matrix: Customer REVIEW is server-only, not a
-- direct RLS grant).
