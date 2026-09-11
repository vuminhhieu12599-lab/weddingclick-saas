-- WeddingClick V2 — Foundation Migration 0007
-- project_media table.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.9, §16 (Migration Order,
-- [F7]), §K (Media Model, [R15]/[R16]).
--
-- ORDERING NOTE — [F7]: this migration is deliberately placed before
-- wedding_details (0008), not after it. wedding_details' groom/bride QR
-- fields will reference project_media via composite FKs to
-- project_media(id, project_id) — see [F6] — so project_media must exist
-- first. This is the FINAL dependency-corrected physical plan order.
--
-- DEFERRED TRIGGER NOTE — [F16]: guard_project_media_asset_immutability()
-- is intentionally NOT created in this migration. Its EXISTS check depends
-- on invitation_version_media, which is not created until migration 0013b.
-- Creating a stub, forward reference, or weakened version now would violate
-- the frozen plan. See docs/PHYSICAL_DATABASE_PLAN.md §16's 0013b entry.
--
-- This migration is purely additive. It does not touch any V1 object,
-- storage bucket, or storage policy — it stores media METADATA only.

CREATE TABLE public.project_media (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  media_type        TEXT NOT NULL CHECK (
                       media_type IN (
                         'COVER',
                         'GALLERY',
                         'AUDIO',
                         'QR_GROOM',
                         'QR_BRIDE',
                         'QR_COMMON'
                       )
                     ),
  storage_bucket    TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  mime_type         TEXT,
  size_bytes        INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  width             INTEGER CHECK (width IS NULL OR width > 0),
  height            INTEGER CHECK (height IS NULL OR height > 0),
  alt_text          TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- No two rows may claim the same storage object.
  CONSTRAINT project_media_storage_object_unique UNIQUE (storage_bucket, storage_path),

  -- [F5]/[F6]: required composite-FK target. Trivially true since id is
  -- already the PK, but Postgres requires the exact constraint declared to
  -- serve as a composite FK target for wedding_details' groom/bride QR
  -- columns (0008) and invitation_version_media (0013b). Intentionally
  -- redundant with the PK — do not remove as "unnecessary."
  CONSTRAINT project_media_id_project_id_unique UNIQUE (id, project_id)
);

COMMENT ON TABLE public.project_media IS
  'Normalized media inventory for a Project (metadata only — no Storage bucket/policy work happens in this migration). See docs/PHYSICAL_DATABASE_PLAN.md §2.9.';
COMMENT ON COLUMN public.project_media.storage_bucket IS
  'V2-only bucket. Never V1''s wedding-photos bucket.';
COMMENT ON COLUMN public.project_media.storage_path IS
  'Non-guessable object key (includes project_id + a random segment). Metadata only in this migration — no Storage workflow.';
COMMENT ON CONSTRAINT project_media_id_project_id_unique ON public.project_media IS
  'Composite-FK target for wedding_details groom/bride QR references (0008) and invitation_version_media (0013b). Intentionally redundant with the PK — required, not dead weight.';

CREATE INDEX project_media_project_type_sort_idx
  ON public.project_media (project_id, media_type, sort_order);

-- ---------------------------------------------------------------------
-- Explicit Data API privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.project_media FROM PUBLIC;
REVOKE ALL ON TABLE public.project_media FROM anon;
REVOKE ALL ON TABLE public.project_media FROM authenticated;
REVOKE ALL ON TABLE public.project_media FROM service_role;

-- authenticated: SELECT, INSERT, UPDATE, DELETE (RLS further restricts to
-- is_staff()). DELETE will later be additionally structurally restricted
-- once invitation_version_media exists with ON DELETE RESTRICT (0013b) —
-- no premature deletion guard is invented here.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_media TO authenticated;

-- No service_role business path in this migration.

ALTER TABLE public.project_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_media FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- updated_at trigger — reuses the shared set_updated_at() function (0001).
-- ---------------------------------------------------------------------
CREATE TRIGGER project_media_set_updated_at
  BEFORE UPDATE ON public.project_media
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS policies (§2.9) — normal STAFF/ADMIN access only. No anon policy.
-- No premature deletion guard: at Task 006 there is no snapshot junction
-- table yet (invitation_version_media arrives in 0013b).
-- ---------------------------------------------------------------------
CREATE POLICY project_media_select_staff
  ON public.project_media
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY project_media_insert_staff
  ON public.project_media
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY project_media_update_staff
  ON public.project_media
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY project_media_delete_staff
  ON public.project_media
  FOR DELETE
  TO authenticated
  USING (public.is_staff());
