-- WeddingClick V2 — Feature Migration 0028 (Invitation Rendering Foundation,
-- portrait media contract checkpoint)
-- project_media.media_type gains exactly two optional image roles:
-- PORTRAIT_GROOM and PORTRAIT_BRIDE.
--
-- FROZEN CONTRACT (docs/DECISIONS.md RF7 "Portrait media roles (Product
-- Owner amendment, 2026-10-01)", docs/PHYSICAL_DATABASE_PLAN.md §2.9):
--   - exactly two new values; COVER and GALLERY are never reused as portrait
--     roles and no other value is added;
--   - both roles are optional: a project may have no portrait for either
--     side, and that stays valid;
--   - "at most one portrait per side" is the EFFECTIVE rule, exactly like
--     COVER: several rows of one portrait role may exist, and the Snapshot
--     builder uses only the first by sort_order ASC, id ASC (RF11 rule C).
--     There is deliberately NO uniqueness constraint: a portrait referenced
--     by a retained snapshot can neither be deleted (invitation_version_media
--     ON DELETE RESTRICT, 0013b) nor change its asset identity
--     (guard_project_media_asset_immutability, 0013b), so replacing it must
--     stay possible by adding a new row ("Upload a new object and create a
--     new project_media row instead").
--
-- Non-destructive: every existing row already satisfies the widened CHECK.
-- Only the media_type CHECK constraint changes. No column, FK, index,
-- trigger, RLS policy, grant, Storage bucket or Storage policy is touched;
-- the existing project-media bucket MIME/size limits already cover these
-- image roles (docs/SECURITY.md §15, migration 0023).
--
-- The 0007 column CHECK was declared inline without a name, so PostgreSQL
-- named it project_media_media_type_check (<table>_<column>_check). It is
-- dropped by that exact name, without IF EXISTS, so a mismatch fails loudly
-- inside this migration's transaction instead of leaving two CHECKs behind.
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL / apply migration.

ALTER TABLE public.project_media
  DROP CONSTRAINT project_media_media_type_check;

ALTER TABLE public.project_media
  ADD CONSTRAINT project_media_media_type_check CHECK (
    media_type IN (
      'COVER',
      'GALLERY',
      'AUDIO',
      'QR_GROOM',
      'QR_BRIDE',
      'QR_COMMON',
      'PORTRAIT_GROOM',
      'PORTRAIT_BRIDE'
    )
  );

COMMENT ON CONSTRAINT project_media_media_type_check ON public.project_media IS
  'Media roles (docs/PHYSICAL_DATABASE_PLAN.md §2.9). PORTRAIT_GROOM/PORTRAIT_BRIDE added in 0028 (docs/DECISIONS.md RF7 PO amendment): optional, one effective row per side chosen by the Snapshot builder (sort_order, id), no uniqueness constraint so a published portrait stays replaceable.';
