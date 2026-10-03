-- WeddingClick V2 — Feature Migration 0035 (Social Share Cover)
-- project_media media_type: allow SOCIAL_SHARE_COVER.
--
-- PRODUCT OWNER DECISION (2026-10-03, docs/DECISIONS.md "Social Share
-- Cover"): a staff-chosen, replaceable image used later as the published
-- invitation's social-share / Open Graph image (Zalo, Facebook, ...). It is
-- its own media role, independent of COVER (it may be a completely different
-- image) and is never part of the invitation body or its Snapshot.
--
-- Semantics (no new constraint needed):
--   - project-scoped image media through the existing Task 024 upload /
--     finalize / delete workflow (image MIME/size policy, staff-only RLS);
--   - one effective item per Project, chosen like the other single roles by
--     (sort_order, id); several rows may exist so it stays replaceable.
--
-- Purely additive: the media_type CHECK is recreated with every previously
-- allowed value (0031) plus SOCIAL_SHARE_COVER. No existing row, column,
-- other constraint, index, trigger, RLS policy, grant or Storage object is
-- touched; no data is rewritten.

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
      'LOVE_STORY_PHOTO',
      'SOCIAL_SHARE_COVER'
    )
  );

COMMENT ON CONSTRAINT project_media_media_type_check ON public.project_media IS
  'Media roles (docs/PHYSICAL_DATABASE_PLAN.md §2.9). PORTRAIT_* (0028), PHOTO_STORY / LOVE_STORY_PHOTO (0031) and SOCIAL_SHARE_COVER (0035): no uniqueness constraint; effective rows are picked by (sort_order, id).';
