-- WeddingClick V2 — Feature Migration 0041 (Task 032B)
-- get_public_social_share_cover(): narrow, read-only, service_role-exclusive
-- resolution of ONE public invitation slug to its Project's CURRENT
-- effective SOCIAL_SHARE_COVER storage reference, for Open Graph metadata.
--
-- Source of truth: docs/DECISIONS.md "Social Share Cover" and "Task 032B —
-- Open Graph + Social Share Cover"; docs/PHYSICAL_DATABASE_PLAN.md §2.9;
-- docs/API_CONTRACT.md §21.
--
-- PURPOSE (one): given a public slug,
--   - require the invitation to have a current publication
--     (published_version_id -> a PUBLISHED row of the same invitation and
--     Project, else PI001 — the same integrity rule as 0039). Unknown slug or
--     never published -> NULL;
--   - derive project_id from the invitation (never from the caller);
--   - return ONLY the effective SOCIAL_SHARE_COVER row of that Project, chosen
--     by the single-role rule (sort_order, then id): storage bucket/path,
--     mime type, width, height, alt text. No row chosen -> {"cover": null}.
--
-- SOCIAL_SHARE_COVER is project-level publication metadata: it is read at
-- request time (not pinned to the PUBLISHED version), so staff can replace it
-- without republishing. There is NO fallback to COVER or any other role.
--
-- Never returned: Snapshot payload, draft/canonical tables, review data,
-- staff/customer/payment/status fields, any other project_media row, signed
-- URLs.
--
-- Read-only (STABLE): writes nothing, logs nothing. EXECUTE for service_role
-- only — called solely by lib/server/supabase/public-social-share-repository.ts
-- from the server-rendered /i/[slug] metadata. anon/authenticated get
-- nothing; no table grant or RLS policy is added or changed.
--
-- Purely additive: one new function, no table shape change, no change to any
-- earlier migration's object.
--
-- AUTHORING ONLY — not applied by Task 032B. The owner applies it.

CREATE FUNCTION public.get_public_social_share_cover(
  p_public_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invitation_id uuid;
  v_project_id    uuid;
  v_published_id  uuid;
  v_version       public.invitation_versions%ROWTYPE;
  v_cover         jsonb;
BEGIN
  IF p_public_slug IS NULL THEN
    RETURN NULL;
  END IF;

  -- A. Exactly one invitation by its public slug (UNIQUE, 0012).
  SELECT pi.id, pi.project_id, pi.published_version_id
    INTO v_invitation_id, v_project_id, v_published_id
  FROM public.project_invitations AS pi
  WHERE pi.public_slug = p_public_slug;

  -- B. Unknown slug or never published: fail closed (no REVIEW/draft path).
  IF NOT FOUND OR v_published_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- C. The exact published pointer target, re-checked as in 0039.
  SELECT iv.* INTO v_version
  FROM public.invitation_versions AS iv
  WHERE iv.id = v_published_id;

  IF NOT FOUND
     OR v_version.version_type IS DISTINCT FROM 'PUBLISHED'
     OR v_version.invitation_id IS DISTINCT FROM v_invitation_id
     OR v_version.project_id IS DISTINCT FROM v_project_id
  THEN
    RAISE EXCEPTION 'Published version pointer integrity fault'
      USING ERRCODE = 'PI001';
  END IF;

  -- D. The one effective SOCIAL_SHARE_COVER of that Project (sort_order, id).
  SELECT jsonb_build_object(
    'storageBucket', pm.storage_bucket,
    'storagePath', pm.storage_path,
    'mimeType', pm.mime_type,
    'width', pm.width,
    'height', pm.height,
    'altText', pm.alt_text
  ) INTO v_cover
  FROM public.project_media AS pm
  WHERE pm.project_id = v_project_id
    AND pm.media_type = 'SOCIAL_SHARE_COVER'
  ORDER BY pm.sort_order, pm.id
  LIMIT 1;

  RETURN jsonb_build_object('cover', v_cover);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_social_share_cover(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_social_share_cover(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_public_social_share_cover(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_public_social_share_cover(text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_public_social_share_cover(text) TO service_role;

COMMENT ON FUNCTION public.get_public_social_share_cover(text) IS
  'Public social-share cover read (Task 032B, 0041) — read-only, service_role-exclusive, called only by the /i/[slug] metadata. Requires the slug''s CURRENT PUBLISHED version (same invitation + Project, else PI001), derives the Project, and returns only its effective SOCIAL_SHARE_COVER storage reference (sort_order, id) as {"cover": {...}|null}. Unknown slug or no publication -> NULL. Never COVER or any other role, never Snapshot/draft/review/staff/payment data, never a signed URL.';
