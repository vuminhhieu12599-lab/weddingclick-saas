-- WeddingClick V2 — Feature Migration 0031 (Invitation Rendering Foundation,
-- media restoration batch)
-- project_media.media_type gains exactly two image roles: PHOTO_STORY and
-- LOVE_STORY_PHOTO.
--
-- FROZEN CONTRACT (docs/DECISIONS.md RF7 "Photo Story / Love Story photo
-- (Product Owner amendment, 2026-10-01)", docs/PHYSICAL_DATABASE_PLAN.md §2.9):
--   - PHOTO_STORY: the Task029 editorial photo cluster; many ordered rows
--     (sort_order ASC, id ASC); a separate semantic role, never GALLERY;
--   - LOVE_STORY_PHOTO: the optional Love Story photo; one EFFECTIVE row like
--     COVER (first by sort_order, id), several rows may coexist so a
--     published one stays replaceable — deliberately no uniqueness constraint;
--   - COVER / GALLERY / PORTRAIT_* are never reused for either role.
--
-- Non-destructive: every existing row already satisfies the widened CHECK.
-- Only project_media_media_type_check changes (redefined by name, as in
-- 0028; no IF EXISTS so a mismatch fails loudly). Nothing else is touched;
-- the project-media bucket's image MIME/size limits already cover both.
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
      'PORTRAIT_BRIDE',
      'PHOTO_STORY',
      'LOVE_STORY_PHOTO'
    )
  );

COMMENT ON CONSTRAINT project_media_media_type_check ON public.project_media IS
  'Media roles (docs/PHYSICAL_DATABASE_PLAN.md §2.9). PORTRAIT_* (0028) and PHOTO_STORY / LOVE_STORY_PHOTO (0031): no uniqueness constraint; the Snapshot builder picks effective rows by (sort_order, id).';
