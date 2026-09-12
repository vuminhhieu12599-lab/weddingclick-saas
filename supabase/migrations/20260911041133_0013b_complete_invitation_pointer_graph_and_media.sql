-- WeddingClick V2 — Foundation Migration 0013b
-- Completes the deliberately deferred invitation pointer graph:
--   A. project_invitations composite pointer FKs (fk_current_review_same_
--      invitation, fk_published_same_invitation) + guard_invitation_pointer_
--      types().
--   B. guard_invitation_immutable_after_publish() (post-publish DELETE +
--      public_slug freeze) on project_invitations.
--   C. public.invitation_version_media junction table + its two composite
--      same-project FKs + supporting index + RLS/privileges.
--   D. guard_project_media_asset_immutability() (asset-identity freeze once
--      snapshot-referenced) on project_media.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §1.3 (SECURITY DEFINER
-- hardening), §2.9 (project_media, [R15]/[R16]), §2.13/§2.13.1
-- (project_invitations pointer integrity, [R9]), §2.14 (invitation_versions
-- — referenced only, not modified), §2.15 (invitation_version_media, [F5]),
-- §15 (RLS Matrix), §16 (Migration Order, [R10]/[F16]).
--
-- NOT implemented here (deferred to later tasks, see CLAUDE.md §2/§23 and
-- the task-013b instructions): project_access_links, intake_submissions,
-- review_feedback, guests, RSVP, publish/review application services,
-- snapshot-creation RPCs, Storage operations, UI/routes. No automatic
-- pointer/media population trigger is introduced — trusted server code
-- populates invitation_version_media and advances the pointer columns
-- transactionally as part of a future business action.
--
-- This migration is purely additive. It does not touch any V1 object. It
-- does not recreate project_invitations, invitation_versions, or
-- project_media — it only ALTERs them (new constraints/triggers) and creates
-- the one new table below.

-- =======================================================================
-- A. project_invitations — complete the pointer foreign keys (§2.13.1, [R9])
-- =======================================================================
-- invitation_versions now exists (0013) with UNIQUE (invitation_id, id), so
-- the composite FKs deferred at 0012/0013 can finally be added. Both
-- pointer columns remain nullable; normal MATCH SIMPLE semantics mean a NULL
-- pointer bypasses the FK entirely. RESTRICT, never SET NULL/CASCADE — see
-- §11/§4 of the plan for why composite FKs in this schema always use
-- RESTRICT. Single-column FKs on either pointer column alone are
-- deliberately never used — a single-column FK could not prevent Invitation
-- A's pointer from resolving to Invitation B's version.
ALTER TABLE public.project_invitations
  ADD CONSTRAINT fk_current_review_same_invitation
    FOREIGN KEY (id, current_review_version_id)
    REFERENCES public.invitation_versions (invitation_id, id)
    ON DELETE RESTRICT;

ALTER TABLE public.project_invitations
  ADD CONSTRAINT fk_published_same_invitation
    FOREIGN KEY (id, published_version_id)
    REFERENCES public.invitation_versions (invitation_id, id)
    ON DELETE RESTRICT;

COMMENT ON CONSTRAINT fk_current_review_same_invitation ON public.project_invitations IS
  '[R9] — composite FK guaranteeing current_review_version_id, when present, resolves to an invitation_versions row belonging to THIS SAME invitation (id). Does not by itself guarantee version_type = REVIEW; see guard_invitation_pointer_types(). MATCH SIMPLE: NULL pointer bypasses this FK.';
COMMENT ON CONSTRAINT fk_published_same_invitation ON public.project_invitations IS
  '[R9] — composite FK guaranteeing published_version_id, when present, resolves to an invitation_versions row belonging to THIS SAME invitation (id). Does not by itself guarantee version_type = PUBLISHED; see guard_invitation_pointer_types(). MATCH SIMPLE: NULL pointer bypasses this FK.';

-- ---------------------------------------------------------------------
-- guard_invitation_pointer_types() — BEFORE INSERT OR UPDATE trigger [R9]
-- ---------------------------------------------------------------------
-- The composite FKs above already guarantee (a) the referenced row exists
-- and (b) it belongs to the same invitation. A plain FK cannot constrain a
-- non-key attribute's literal value on the referenced row, so this trigger
-- adds the one remaining guarantee: current_review_version_id must resolve
-- to a version_type = 'REVIEW' row, and published_version_id must resolve
-- to a version_type = 'PUBLISHED' row. Deliberately no other coupling: it
-- does NOT require both pointers to be set together, does NOT require
-- published to source from current review, does NOT compare version_number
-- ordering — those are business/domain workflow concerns, not a structural
-- guard.
CREATE FUNCTION public.guard_invitation_pointer_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_review_type text;
  v_published_type text;
BEGIN
  IF NEW.current_review_version_id IS NOT NULL THEN
    SELECT version_type INTO v_review_type
    FROM public.invitation_versions
    WHERE id = NEW.current_review_version_id;

    IF v_review_type IS DISTINCT FROM 'REVIEW' THEN
      RAISE EXCEPTION 'current_review_version_id % must reference a REVIEW version, found %', NEW.current_review_version_id, v_review_type;
    END IF;
  END IF;

  IF NEW.published_version_id IS NOT NULL THEN
    SELECT version_type INTO v_published_type
    FROM public.invitation_versions
    WHERE id = NEW.published_version_id;

    IF v_published_type IS DISTINCT FROM 'PUBLISHED' THEN
      RAISE EXCEPTION 'published_version_id % must reference a PUBLISHED version, found %', NEW.published_version_id, v_published_type;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_invitation_pointer_types() IS
  'BEFORE INSERT OR UPDATE trigger-only helper ([R9]): raises unless current_review_version_id resolves to a REVIEW row and published_version_id resolves to a PUBLISHED row. The composite FKs already guarantee existence and same-invitation; this adds only the literal version_type check. No pointer-coupling/ordering logic. Not a business RPC — no direct EXECUTE grant to any role.';

-- Trigger-only: no external EXECUTE grant to any role. Trigger firing does
-- not require it (Postgres invokes trigger functions internally).
REVOKE ALL ON FUNCTION public.guard_invitation_pointer_types() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_invitation_pointer_types() FROM anon;
REVOKE ALL ON FUNCTION public.guard_invitation_pointer_types() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_invitation_pointer_types() FROM service_role;

CREATE TRIGGER project_invitations_guard_pointer_types
  BEFORE INSERT OR UPDATE ON public.project_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_invitation_pointer_types();

-- =======================================================================
-- B. project_invitations — post-publish DELETE guard + public_slug freeze
-- =======================================================================
-- Two independent protections now exist for a published invitation:
--   1. Migration 0013's composite RESTRICT FK
--      (invitation_versions.invitation_id, project_id) ->
--      project_invitations(id, project_id) already makes a
--      project_invitations row undeletable while it has ANY
--      invitation_versions row at all (REVIEW or PUBLISHED) — a strictly
--      broader condition than "has been published."
--   2. This migration's guard_invitation_immutable_after_publish() adds the
--      explicit, literal rule for rows that HAVE been published
--      (published_version_id IS NOT NULL): DELETE is rejected, and
--      public_slug can never change. This is not the only delete
--      protection — it is an additional, explicit guarantee layered on top
--      of (1).
-- Neither rule freezes the whole row: current_review_version_id,
-- published_version_id, variant, created_by, updated_at all remain
-- ordinarily updatable after publish (future review/publish rounds need to
-- advance the pointer columns).
CREATE FUNCTION public.guard_invitation_immutable_after_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'project_invitations % cannot be deleted: it has already been published (published_version_id %)', OLD.id, OLD.published_version_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'project_invitations % public_slug is frozen after first publish (old: %, new: %)', OLD.id, OLD.public_slug, NEW.public_slug;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.guard_invitation_immutable_after_publish() IS
  'Trigger-only helper: rejects DELETE on a project_invitations row once published_version_id IS NOT NULL, and rejects UPDATE that changes public_slug once published_version_id IS NOT NULL. Does not freeze any other column and does not fire on INSERT. This is an explicit rule layered on top of (not a replacement for) 0013''s composite RESTRICT FK, which independently already blocks deleting an invitation with ANY invitation_versions row. Not a business RPC — no direct EXECUTE grant to any role.';

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_invitation_immutable_after_publish() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_invitation_immutable_after_publish() FROM anon;
REVOKE ALL ON FUNCTION public.guard_invitation_immutable_after_publish() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_invitation_immutable_after_publish() FROM service_role;

CREATE TRIGGER project_invitations_guard_delete_after_publish
  BEFORE DELETE ON public.project_invitations
  FOR EACH ROW
  WHEN (OLD.published_version_id IS NOT NULL)
  EXECUTE FUNCTION public.guard_invitation_immutable_after_publish();

CREATE TRIGGER project_invitations_guard_slug_freeze_after_publish
  BEFORE UPDATE ON public.project_invitations
  FOR EACH ROW
  WHEN (
    OLD.published_version_id IS NOT NULL
    AND NEW.public_slug IS DISTINCT FROM OLD.public_slug
  )
  EXECUTE FUNCTION public.guard_invitation_immutable_after_publish();

-- =======================================================================
-- C. public.invitation_version_media (§2.15, [F5])
-- =======================================================================
-- Normalized junction recording exactly which project_media rows an
-- immutable invitation_versions snapshot depends on. No surrogate id, no
-- updated_at, no created_by, no media URL/path snapshot, no sort_order, no
-- metadata JSON — deliberately minimal per §2.15.
CREATE TABLE public.invitation_version_media (
  -- No plain single-column FK on this column alone — see the composite FK
  -- below ([F5]).
  invitation_version_id  UUID NOT NULL,

  -- No plain single-column FK on this column alone — see the composite FK
  -- below ([F5]).
  project_media_id       UUID NOT NULL,

  -- Denormalized, present solely so the two composite FKs below
  -- transitively force invitation_versions.project_id =
  -- invitation_version_media.project_id = project_media.project_id. No
  -- independent FK of its own to projects(id).
  project_id              UUID NOT NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- project_id is deliberately NOT part of the primary key.
  CONSTRAINT invitation_version_media_pkey
    PRIMARY KEY (invitation_version_id, project_media_id),

  -- ---------------------------------------------------------------------
  -- [F5] — same-project integrity. Two composite FKs sharing project_id.
  -- This FK may safely use CASCADE: unlike other project_id-shaped
  -- composite FKs in this plan, this table's project_id has no independent
  -- FK of its own to projects(id) that a CASCADE here could conflict with.
  CONSTRAINT invitation_version_media_version_fkey
    FOREIGN KEY (invitation_version_id, project_id)
    REFERENCES public.invitation_versions (id, project_id)
    ON DELETE CASCADE,

  -- This FK MUST remain RESTRICT — it is the entire delete-protection
  -- mechanism for project_media rows still referenced by any retained
  -- snapshot (REVIEW, current PUBLISHED, or superseded/historical
  -- PUBLISHED). Do not weaken to CASCADE/SET NULL.
  CONSTRAINT invitation_version_media_project_media_fkey
    FOREIGN KEY (project_media_id, project_id)
    REFERENCES public.project_media (id, project_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.invitation_version_media IS
  'Junction recording exactly which project_media rows an immutable invitation_versions snapshot depends on ([R15]). Replaces the removed media_refs UUID[] column. Effectively immutable after insert — no UPDATE/DELETE policy or grant. See docs/PHYSICAL_DATABASE_PLAN.md §2.15.';
COMMENT ON COLUMN public.invitation_version_media.project_id IS
  '[F5] — denormalized, present only to make the two composite FKs on this table transitively force same-project integrity between invitation_versions and project_media. No independent FK to projects(id).';
COMMENT ON CONSTRAINT invitation_version_media_version_fkey ON public.invitation_version_media IS
  '[F5] — ON DELETE CASCADE is safe here specifically because this table''s project_id has no other independent FK to projects(id) that a CASCADE could conflict with (unlike other composite FKs in this plan, which use RESTRICT for exactly that reason).';
COMMENT ON CONSTRAINT invitation_version_media_project_media_fkey ON public.invitation_version_media IS
  '[R15] — ON DELETE RESTRICT is the delete-protection mechanism for project_media rows referenced by any retained snapshot (REVIEW, current PUBLISHED, or superseded PUBLISHED). Must remain RESTRICT — do not weaken.';

-- Postgres does not automatically index the referencing side of a FK. This
-- supports both the RESTRICT check's performance and "which snapshots use
-- this media" lookups. The PK already covers
-- (invitation_version_id, project_media_id) — no other index is added.
CREATE INDEX invitation_version_media_media_project_idx
  ON public.invitation_version_media (project_media_id, project_id);

-- ---------------------------------------------------------------------
-- Explicit Data API privileges — invitation_version_media
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.invitation_version_media FROM PUBLIC;
REVOKE ALL ON TABLE public.invitation_version_media FROM anon;
REVOKE ALL ON TABLE public.invitation_version_media FROM authenticated;
REVOKE ALL ON TABLE public.invitation_version_media FROM service_role;

-- authenticated represents STAFF/ADMIN sessions; RLS further restricts to
-- is_staff() (§15 RLS Matrix: "R/C (alongside parent version); no U/D").
-- Rows are inserted by the same trusted server action that creates the
-- parent invitation_versions row, in the same transaction — but that
-- action runs as the staff member's own authenticated session (§1.4), not
-- service_role, so no service_role table privilege is granted here.
GRANT SELECT, INSERT ON TABLE public.invitation_version_media TO authenticated;

ALTER TABLE public.invitation_version_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_version_media FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- RLS policies (§2.15, §15) — staff/admin only. No UPDATE policy, no
-- DELETE policy for any role — a junction row is never meant to change
-- once written. No anon policy. No customer/guest-token policy.
-- ---------------------------------------------------------------------
CREATE POLICY invitation_version_media_select_staff
  ON public.invitation_version_media
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY invitation_version_media_insert_staff
  ON public.invitation_version_media
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

-- =======================================================================
-- D. project_media — asset-identity immutability guard (§2.9, [R16]/[F16])
-- =======================================================================
-- Deferred to this migration ([F16]) because its EXISTS check depends on
-- invitation_version_media, created immediately above. Only asset identity
-- (storage_bucket/storage_path) becomes frozen once referenced by any
-- snapshot — alt_text, sort_order, media_type, mime_type, size_bytes,
-- width, and height all remain editable regardless of reference state.
-- This is not a full-row immutability guard, and no separate DELETE
-- trigger is created here: project_media deletion remains protected solely
-- by invitation_version_media's ON DELETE RESTRICT FK above (§13 of the
-- task spec).
CREATE FUNCTION public.guard_project_media_asset_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invitation_version_media
    WHERE project_media_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'project_media % asset identity (storage_bucket/storage_path) cannot change: it is referenced by at least one invitation_version_media snapshot. Upload a new object and create a new project_media row instead.', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_project_media_asset_immutability() IS
  '[R16] — BEFORE UPDATE trigger-only helper, created in 0013b (not 0007, [F16]) because its EXISTS check depends on invitation_version_media. Blocks changing storage_bucket/storage_path once any invitation_version_media row references this project_media row. Does not freeze alt_text/sort_order/media_type/mime_type/size_bytes/width/height. Not a business RPC — no direct EXECUTE grant to any role.';

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_project_media_asset_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_project_media_asset_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_project_media_asset_immutability() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_project_media_asset_immutability() FROM service_role;

CREATE TRIGGER project_media_guard_asset_immutability
  BEFORE UPDATE ON public.project_media
  FOR EACH ROW
  WHEN (
    NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
    OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
  )
  EXECUTE FUNCTION public.guard_project_media_asset_immutability();
