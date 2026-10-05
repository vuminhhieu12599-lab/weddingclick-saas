-- WeddingClick V2 — Feature Migration 0039 (Task 032A)
-- get_public_invitation(): narrow, read-only, service_role-exclusive
-- resolution of ONE public invitation slug to its CURRENT immutable
-- PUBLISHED version.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.13 (public_slug is a
-- routing identifier), §2.14/§2.15 (PUBLISHED rows + invitation_version_media
-- pins), §8 "F. Publish Snapshot Model"; docs/DECISIONS.md "Task 031" and
-- "Task 032A — Public Published Invitation"; docs/API_CONTRACT.md §19.
--
-- PURPOSE (one): given a public slug, return ONLY what the public
-- /i/[slug] page needs to render the exact current publication:
--   - the invitation's variant and the Project code (binding checks only);
--   - the exact PUBLISHED invitation_versions row referenced by
--     project_invitations.published_version_id (id, version number, pinned
--     template version + renderer key, published_at, persisted payload);
--   - the project_media storage references pinned to EXACTLY that version
--     through invitation_version_media (for runtime signing only).
--
-- Unknown slug, or an invitation with no published_version_id -> NULL
-- (the page renders not-found). There is no REVIEW fallback, no draft read,
-- no "latest version" inference and no project-wide media listing.
-- A published pointer that does not resolve to a PUBLISHED row of the same
-- invitation and Project is an integrity fault (PI001, generic 500).
--
-- Never returned: draft/canonical tables (wedding_details, events, design),
-- review feedback, source_review_version_id, staff/customer metadata,
-- payment or status fields, unpinned media, signed URLs.
--
-- Read-only (STABLE): writes nothing, logs nothing. EXECUTE for service_role
-- only — called solely by lib/server/supabase/public-invitation-repository.ts
-- from the server-rendered /i/[slug] page. anon/authenticated get nothing;
-- no table grant is added.
--
-- Purely additive: one new function, no table shape change, no change to
-- any earlier migration's object.

CREATE FUNCTION public.get_public_invitation(
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
  v_variant       text;
  v_published_id  uuid;
  v_project_code  text;
  v_version       public.invitation_versions%ROWTYPE;
  v_media         jsonb;
BEGIN
  IF p_public_slug IS NULL THEN
    RETURN NULL;
  END IF;

  -- A. Exactly one invitation by its public slug (UNIQUE, 0012).
  SELECT pi.id, pi.project_id, pi.variant, pi.published_version_id
    INTO v_invitation_id, v_project_id, v_variant, v_published_id
  FROM public.project_invitations AS pi
  WHERE pi.public_slug = p_public_slug;

  -- B. Unknown slug or never published: fail closed (no REVIEW fallback).
  IF NOT FOUND OR v_published_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- C. The exact published pointer target, re-checked (0013b FK + pointer
  -- type guard already guarantee this; fail closed on any mismatch).
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

  SELECT p.project_code INTO v_project_code
  FROM public.projects AS p
  WHERE p.id = v_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published version pointer integrity fault'
      USING ERRCODE = 'PI001';
  END IF;

  -- D. Only media pinned to EXACTLY this PUBLISHED version, same Project.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', pm.id,
    'storageBucket', pm.storage_bucket,
    'storagePath', pm.storage_path,
    'width', pm.width,
    'height', pm.height
  ) ORDER BY pm.id), '[]'::jsonb) INTO v_media
  FROM public.invitation_version_media AS ivm
  JOIN public.project_media AS pm
    ON pm.id = ivm.project_media_id
   AND pm.project_id = v_project_id
  WHERE ivm.invitation_version_id = v_version.id
    AND ivm.project_id = v_project_id;

  RETURN jsonb_build_object(
    'variant', v_variant,
    'projectCode', v_project_code,
    'publishedVersion', jsonb_build_object(
      'id', v_version.id,
      'versionNumber', v_version.version_number,
      'templateVersionId', v_version.template_version_id,
      'rendererKey', v_version.renderer_key_snapshot,
      'publishedAt', v_version.published_at,
      'payload', v_version.payload,
      'media', v_media
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_invitation(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_public_invitation(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_public_invitation(text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_public_invitation(text) TO service_role;

COMMENT ON FUNCTION public.get_public_invitation(text) IS
  'Public invitation read (Task 032A, 0039) — read-only, service_role-exclusive, called only by the server-rendered /i/[slug] page. Resolves project_invitations.public_slug to the exact invitation_versions row referenced by published_version_id (must be PUBLISHED, same invitation, same Project, else PI001) and returns its persisted payload, pinned template version + renderer key, and the project_media storage references pinned to exactly that version via invitation_version_media. Unknown slug or no publication -> NULL. Never a REVIEW fallback, never draft data, never unpinned media, feedback, staff, payment or status data.';
