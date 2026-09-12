-- WeddingClick V2 — Foundation Migration 0012
-- project_invitations table + generate_invitation_slug() +
-- set_invitation_public_slug().
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.13 (project_invitations),
-- §2.13.1 (pointer integrity — deferred), §15 (RLS Matrix), §16 (Migration
-- Order), [R9], [R10], [R18], [F1], [F3].
--
-- ORDERING NOTE — [R10]: this migration intentionally creates
-- current_review_version_id/published_version_id as bare nullable UUID
-- columns with NO foreign key, NO pointer-type guard, NO post-publish
-- delete guard, and NO public_slug freeze guard. invitation_versions does
-- not exist yet. Those are added in 0013_invitation_versions.sql (composite
-- FK targets) and 0013b_complete_invitation_pointer_graph_and_media.sql
-- (the composite FKs themselves, guard_invitation_pointer_types(),
-- guard_invitation_immutable_after_publish()) once invitation_versions'
-- UNIQUE(invitation_id, id) exists (§2.13.1, [F3]). Do not collapse this
-- sequence into this migration.
--
-- NOT implemented here: invitation_versions, invitation_version_media,
-- pointer FKs, pointer-type guard, published-slug-freeze guard,
-- post-publish delete guard, review/publish services, public invitation
-- route, UI, guest logic, or any package/variant business trigger.
--
-- This migration is purely additive. It does not touch any V1 object.

-- ---------------------------------------------------------------------
-- public.project_invitations (§2.13)
-- ---------------------------------------------------------------------
-- One logical invitation variant (COMMON/GROOM/BRIDE) belonging to a
-- Project. Variants are different views over the same canonical Project
-- data (CLAUDE.md §4) — this table never duplicates wedding/guest/event
-- data itself.
CREATE TABLE public.project_invitations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id                  UUID NOT NULL
                                REFERENCES public.projects (id) ON DELETE CASCADE,

  variant                     TEXT NOT NULL
                                CHECK (variant IN ('COMMON', 'GROOM', 'BRIDE')),

  -- No column DEFAULT — see generate_invitation_slug()/
  -- set_invitation_public_slug() below ([F1]). A column DEFAULT expression
  -- cannot reference sibling columns (project_id/variant) of the same
  -- INSERT, so a BEFORE INSERT trigger is used instead. Routing identifier,
  -- not an authorization credential.
  public_slug                 TEXT NOT NULL UNIQUE,

  -- Bare nullable pointers, NO foreign key yet ([R10]) — invitation_versions
  -- does not exist until migration 0013. Composite FKs + the pointer-type
  -- guard are added in 0013b once invitation_versions' UNIQUE(invitation_id,
  -- id) target exists (§2.13.1, [F3]). Do not add a FK/CHECK/trigger on
  -- these two columns in this migration.
  current_review_version_id   UUID,
  published_version_id        UUID,

  created_by                  UUID REFERENCES public.profiles (id) ON DELETE SET NULL,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Core rule preventing duplicate variants per Project; also the target of
  -- guests' composite FK (§2.18, later migration).
  CONSTRAINT project_invitations_project_id_variant_key UNIQUE (project_id, variant),

  -- [F3] — trivially true since id is already the PK, but required as the
  -- exact declared composite-FK target for invitation_versions'
  -- (invitation_id, project_id) -> project_invitations(id, project_id) FK
  -- added in migration 0013. Intentionally redundant with the PK — do not
  -- remove.
  CONSTRAINT project_invitations_id_project_id_key UNIQUE (id, project_id)
);

COMMENT ON TABLE public.project_invitations IS
  'One logical invitation variant (COMMON/GROOM/BRIDE) belonging to a Project. Variants are views over shared canonical Project data (CLAUDE.md §4). See docs/PHYSICAL_DATABASE_PLAN.md §2.13.';
COMMENT ON COLUMN public.project_invitations.public_slug IS
  'Assigned by the set_invitation_public_slug() BEFORE INSERT trigger when not explicitly supplied — no column DEFAULT ([F1]). Routing identifier only, never an authorization credential.';
COMMENT ON COLUMN public.project_invitations.current_review_version_id IS
  'Bare nullable UUID, no FK yet. Composite FK + pointer-type guard added in 0013b once invitation_versions exists (§2.13.1, [F3], [R10]).';
COMMENT ON COLUMN public.project_invitations.published_version_id IS
  'Bare nullable UUID, no FK yet. Composite FK + pointer-type guard added in 0013b once invitation_versions exists (§2.13.1, [F3], [R10]).';
COMMENT ON CONSTRAINT project_invitations_id_project_id_key ON public.project_invitations IS
  'Composite-FK target for invitation_versions (invitation_id, project_id) -> project_invitations(id, project_id), added in migration 0013 ([F3]). Intentionally redundant with the PK — required, not dead weight.';

-- ---------------------------------------------------------------------
-- generate_invitation_slug() (§2.13, [F1])
-- ---------------------------------------------------------------------
-- lower(project_code) || '-' || lower(variant), e.g.
-- WC-2026-000001 + GROOM -> wc-2026-000001-groom. Deliberately no random
-- suffix, hash, or timestamp component — public_slug is a routing
-- identifier, not an authentication credential.
CREATE FUNCTION public.generate_invitation_slug(
  p_project_id UUID,
  p_variant TEXT
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT lower(p.project_code) || '-' || lower(p_variant)
  FROM public.projects p
  WHERE p.id = p_project_id;
$$;

COMMENT ON FUNCTION public.generate_invitation_slug(UUID, TEXT) IS
  'Computes project_invitations.public_slug as lower(project_code) || ''-'' || lower(variant). Called only from set_invitation_public_slug() or explicit application code — never a column DEFAULT ([F1], since it references sibling columns of the row being inserted). See docs/PHYSICAL_DATABASE_PLAN.md §2.13.';

REVOKE ALL ON FUNCTION public.generate_invitation_slug(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_invitation_slug(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.generate_invitation_slug(UUID, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.generate_invitation_slug(UUID, TEXT) FROM service_role;
GRANT EXECUTE ON FUNCTION public.generate_invitation_slug(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invitation_slug(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- set_invitation_public_slug() — BEFORE INSERT trigger ([F1])
-- ---------------------------------------------------------------------
-- Fills public_slug only when the inserting code has not already supplied
-- one (WHEN (NEW.public_slug IS NULL) on the trigger below). Never attached
-- to UPDATE — this migration does not regenerate a slug when variant,
-- project_id, or the parent project_code changes.
CREATE FUNCTION public.set_invitation_public_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.public_slug := public.generate_invitation_slug(NEW.project_id, NEW.variant);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_invitation_public_slug() IS
  'BEFORE INSERT trigger-only helper for project_invitations.public_slug ([F1]). Not a business RPC — no direct EXECUTE grant to any role.';

-- Trigger-only: no external EXECUTE grant to any role. Trigger firing does
-- not require it (Postgres invokes trigger functions internally).
REVOKE ALL ON FUNCTION public.set_invitation_public_slug() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_invitation_public_slug() FROM anon;
REVOKE ALL ON FUNCTION public.set_invitation_public_slug() FROM authenticated;
REVOKE ALL ON FUNCTION public.set_invitation_public_slug() FROM service_role;

CREATE TRIGGER project_invitations_set_public_slug
  BEFORE INSERT ON public.project_invitations
  FOR EACH ROW
  WHEN (NEW.public_slug IS NULL)
  EXECUTE FUNCTION public.set_invitation_public_slug();

-- ---------------------------------------------------------------------
-- updated_at trigger — reuses the shared set_updated_at() function (0001).
-- ---------------------------------------------------------------------
CREATE TRIGGER project_invitations_set_updated_at
  BEFORE UPDATE ON public.project_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- Explicit Data API privileges — project_invitations
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.project_invitations FROM PUBLIC;
REVOKE ALL ON TABLE public.project_invitations FROM anon;
REVOKE ALL ON TABLE public.project_invitations FROM authenticated;
REVOKE ALL ON TABLE public.project_invitations FROM service_role;

-- authenticated represents both STAFF and ADMIN sessions; RLS further
-- restricts every operation to is_staff() (§15 RLS Matrix: STAFF/ADMIN
-- R/C/U/D, D only actually succeeding pre-publish once the 0013b FK/guard
-- exist — not invented here).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_invitations TO authenticated;

-- service_role: SELECT only. Per §15 RLS Matrix, anonymous public-route
-- resolution by public_slug and Customer REVIEW/PORTAL invitation-link
-- display are server-only trusted paths (independent token/route
-- validation, then a service_role read) — never a service_role write.
-- Normal staff mutation of this table remains the authenticated-session +
-- RLS path only (§1.4).
GRANT SELECT ON TABLE public.project_invitations TO service_role;

ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_invitations FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- RLS policies (§2.13, §15) — staff/admin only. No anon policy. No
-- customer/guest-token policy — those flows are server-only (above).
-- ---------------------------------------------------------------------
CREATE POLICY project_invitations_select_staff
  ON public.project_invitations
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY project_invitations_insert_staff
  ON public.project_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY project_invitations_update_staff
  ON public.project_invitations
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- No post-publish delete restriction is invented here. Once invitation_
-- versions and its composite RESTRICT FK exist (0013/0013b), a published
-- (or ever-versioned) invitation becomes structurally undeletable; this
-- policy only grants the attempt to staff, per §15.
CREATE POLICY project_invitations_delete_staff
  ON public.project_invitations
  FOR DELETE
  TO authenticated
  USING (public.is_staff());
