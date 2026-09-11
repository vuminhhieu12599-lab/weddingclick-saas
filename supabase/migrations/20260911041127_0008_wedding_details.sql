-- WeddingClick V2 — Foundation Migration 0008
-- wedding_details table.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.7 ([R20]), §16
-- (Migration Order, [F7]), §4/§B (Foreign Key Graph), §M (RLS Matrix).
--
-- ORDERING NOTE — [F7]: this migration is deliberately placed after
-- project_media (0007), not before it. groom_bank_qr_media_id and
-- bride_bank_qr_media_id are composite FKs to project_media(id, project_id),
-- so project_media must already exist.
--
-- COMPOSITE QR FK NOTE — [F6]: a plain single-column FK to
-- project_media(id) cannot prevent a QR image from a *different* Project's
-- media inventory being referenced — application validation alone is not a
-- DB guarantee. Both QR columns are therefore composite FKs to
-- project_media(id, project_id), forcing the referenced media row to belong
-- to the SAME project_id as this wedding_details row. Both columns stay
-- nullable; MATCH SIMPLE (the Postgres default) bypasses the FK check when
-- the QR column is NULL, so a wedding_details row with no QR set is never
-- blocked by this constraint. ON DELETE RESTRICT is used, not SET NULL,
-- because a composite SET NULL would also null wedding_details.project_id,
-- conflicting with that column's own independent NOT NULL/UNIQUE/CASCADE
-- FK to projects. Effect: staff must clear a gift QR reference before
-- deleting that project_media row.
--
-- This migration is purely additive. It does not touch project_events,
-- media upload routes, customer intake, the wedding editor UI, the
-- invitation resolver, or publish/review logic.

CREATE TABLE public.wedding_details (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One canonical wedding-detail record per Project — [R20].
  project_id                  UUID NOT NULL UNIQUE
                                 REFERENCES public.projects (id) ON DELETE CASCADE,

  -- Nullable at the DB level: a project may exist before intake completes.
  -- Required-before-publish is an application publish-validation concern
  -- (docs/PRODUCT.md §10), not a DB NOT NULL.
  groom_name                  TEXT,
  bride_name                  TEXT,

  groom_father                TEXT,
  groom_mother                TEXT,
  bride_father                TEXT,
  bride_mother                TEXT,

  groom_family_address        TEXT,
  bride_family_address        TEXT,

  invitation_message           TEXT,
  love_story                   TEXT,
  lunar_date_display            TEXT,
  additional_note              TEXT,

  -- Groom-side gift/bank info — [R20]. Shown on GROOM invitations and
  -- (alongside bride-side fields) on COMMON.
  groom_bank_name               TEXT,
  groom_bank_account_name       TEXT,
  -- TEXT, not numeric — account numbers may carry leading zeros/non-numeric
  -- formats.
  groom_bank_account_number     TEXT,
  -- QR image is a media reference, never a raw URL. Composite FK below.
  groom_bank_qr_media_id        UUID,

  -- Bride-side gift/bank info — [R20]. Shown on BRIDE invitations and on
  -- COMMON.
  bride_bank_name                TEXT,
  bride_bank_account_name        TEXT,
  bride_bank_account_number      TEXT,
  bride_bank_qr_media_id         UUID,

  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- [F6]: composite FKs force the referenced project_media row to belong to
  -- this same project_id. Requires project_media's UNIQUE (id, project_id)
  -- (0007, [F5]/[F6]). Nullable columns + MATCH SIMPLE (default) means a
  -- NULL QR id is never blocked by this constraint. RESTRICT, not SET NULL:
  -- a composite SET NULL would also null project_id, conflicting with this
  -- table's own separate NOT NULL/UNIQUE/CASCADE FK to projects above.
  CONSTRAINT wedding_details_groom_bank_qr_media_fk
    FOREIGN KEY (groom_bank_qr_media_id, project_id)
    REFERENCES public.project_media (id, project_id)
    ON DELETE RESTRICT,

  CONSTRAINT wedding_details_bride_bank_qr_media_fk
    FOREIGN KEY (bride_bank_qr_media_id, project_id)
    REFERENCES public.project_media (id, project_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.wedding_details IS
  'One canonical wedding-specific detail record per wedding Project. See docs/PHYSICAL_DATABASE_PLAN.md §2.7 ([R20]).';
COMMENT ON COLUMN public.wedding_details.lunar_date_display IS
  'Display-only text; not canonical date data. See docs/PHYSICAL_DATABASE_PLAN.md §E.';
COMMENT ON COLUMN public.wedding_details.groom_bank_account_number IS
  'TEXT, not numeric — account numbers may carry leading zeros/non-numeric formats.';
COMMENT ON COLUMN public.wedding_details.bride_bank_account_number IS
  'TEXT, not numeric — account numbers may carry leading zeros/non-numeric formats.';
COMMENT ON CONSTRAINT wedding_details_groom_bank_qr_media_fk ON public.wedding_details IS
  'Composite FK ([F6]) — structurally prevents referencing project_media owned by a different Project. NULL bypasses via MATCH SIMPLE. RESTRICT: staff must clear the reference before deleting that project_media row.';
COMMENT ON CONSTRAINT wedding_details_bride_bank_qr_media_fk ON public.wedding_details IS
  'Composite FK ([F6]) — structurally prevents referencing project_media owned by a different Project. NULL bypasses via MATCH SIMPLE. RESTRICT: staff must clear the reference before deleting that project_media row.';

-- ---------------------------------------------------------------------
-- Explicit Data API privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.wedding_details FROM PUBLIC;
REVOKE ALL ON TABLE public.wedding_details FROM anon;
REVOKE ALL ON TABLE public.wedding_details FROM authenticated;
REVOKE ALL ON TABLE public.wedding_details FROM service_role;

-- authenticated: SELECT, INSERT, UPDATE only (RLS further restricts to
-- is_staff()). No DELETE grant — the row disappears only via the parent
-- Project's ON DELETE CASCADE, never a direct delete.
GRANT SELECT, INSERT, UPDATE ON TABLE public.wedding_details TO authenticated;

-- No service_role business path in this migration.

ALTER TABLE public.wedding_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wedding_details FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- updated_at trigger — reuses the shared set_updated_at() function (0001).
-- ---------------------------------------------------------------------
CREATE TRIGGER wedding_details_set_updated_at
  BEFORE UPDATE ON public.wedding_details
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS policies (§2.7) — normal STAFF/ADMIN access only. No anon policy,
-- no customer-token policy, no DELETE policy. Customer INTAKE data lands in
-- intake_submissions.payload; staff applies it here (§R5, §M).
-- ---------------------------------------------------------------------
CREATE POLICY wedding_details_select_staff
  ON public.wedding_details
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY wedding_details_insert_staff
  ON public.wedding_details
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY wedding_details_update_staff
  ON public.wedding_details
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());
