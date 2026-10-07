-- WeddingClick V2 — Feature Migration 0045 (Couple Portrait)
-- project_media media_type: allow PORTRAIT_COUPLE.
--
-- PRODUCT OWNER CORRECTION (2026-10-07, docs/DECISIONS.md "VH-M01 — Couple
-- Portrait Media Role"): the approved Vietnamese Heritage portrait
-- composition is three independently managed images, PORTRAIT_GROOM,
-- PORTRAIT_COUPLE and PORTRAIT_BRIDE. PORTRAIT_COUPLE is its own optional
-- media role; COVER, GALLERY, PHOTO_STORY and LOVE_STORY_PHOTO are never
-- reused as the couple portrait.
--
-- Semantics (no new constraint needed), exactly like the other single roles:
--   - project-scoped image media through the existing Task 024 upload /
--     finalize / delete workflow (image MIME/size policy, staff-only RLS);
--   - one effective item per Project, chosen by (sort_order, id); several
--     rows may exist so a portrait referenced by a retained snapshot stays
--     replaceable (0013b). Deliberately no uniqueness constraint.
--
-- Purely additive: the media_type CHECK is recreated with every previously
-- allowed value (0035) plus PORTRAIT_COUPLE. No existing row, column, other
-- constraint, index, trigger, RLS policy, grant or Storage object is
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
      'SOCIAL_SHARE_COVER',
      'PORTRAIT_COUPLE'
    )
  );

COMMENT ON CONSTRAINT project_media_media_type_check ON public.project_media IS
  'Media roles (docs/PHYSICAL_DATABASE_PLAN.md §2.9). PORTRAIT_* (0028; PORTRAIT_COUPLE 0045), PHOTO_STORY / LOVE_STORY_PHOTO (0031) and SOCIAL_SHARE_COVER (0035): no uniqueness constraint; effective rows are picked by (sort_order, id).';
