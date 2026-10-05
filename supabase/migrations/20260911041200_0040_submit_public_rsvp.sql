-- WeddingClick V2 — Feature Migration 0040 (Task 033A)
-- submit_public_rsvp(): narrow, service_role-exclusive persistence of ONE
-- non-personalized RSVP submitted from the public published invitation
-- /i/[slug].
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.20 (rsvps), §12 (J. RSVP
-- Integrity); docs/DECISIONS.md RF15 "RSVP completion (Product Owner
-- amendment, 2026-10-01)", K15–K20, and "Task 033A — Public RSVP Foundation";
-- docs/SECURITY.md §11; docs/API_CONTRACT.md §20.
--
-- PURPOSE (one): given a public slug and the four canonical RSVP response
-- fields, insert exactly one rsvps row bound to the Project of the
-- invitation that slug CURRENTLY publishes:
--   - the slug must resolve to a project_invitations row whose
--     published_version_id is set and points at a PUBLISHED version of the
--     same invitation and Project (same integrity rule as 0039). Unknown
--     slug or never published -> NULL (nothing written). There is no REVIEW
--     or draft path;
--   - project_id is derived here, never supplied by the caller;
--   - guest_id is always NULL: this is the canonical non-personalized flow
--     (§2.20). No guest token exists on the public route yet, so a typed name
--     can never select, create or update a guests/rsvps row by identity;
--   - guest_display_name_snapshot = the typed response name (0032: required,
--     trimmed, non-blank, <= 200 characters; display data only, never
--     identity).
--
-- DUPLICATES: non-personalized rows are intentionally unbounded (§2.20 / §J,
-- accepted documented limitation): every submission is a new row. The
-- one-current-row rule (rsvps_guest_id_key) applies only to personalized
-- guests, which this function never writes.
--
-- Input is re-validated here (defense-in-depth behind the server use case
-- and the 0018/0032 CHECKs). Malformed input raises RS001 (no detail is
-- surfaced to the guest). A published pointer integrity fault raises PI001.
--
-- EXECUTE for service_role only — called solely by
-- lib/server/supabase/public-rsvp-repository.ts from POST
-- /api/v2/public/rsvp. anon/authenticated get nothing; no table grant or RLS
-- policy is added or changed. Writes nothing else and logs nothing.
--
-- Purely additive: one new function, no table shape change, no change to any
-- earlier migration's object.
--
-- AUTHORING ONLY — not applied by Task 033A. The owner applies it.

CREATE FUNCTION public.submit_public_rsvp(
  p_public_slug text,
  p_attendance  text,
  p_party_size  integer,
  p_message     text,
  p_guest_name  text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invitation_id uuid;
  v_project_id    uuid;
  v_published_id  uuid;
  v_version       public.invitation_versions%ROWTYPE;
  v_rsvp_id       uuid;
BEGIN
  -- A. Canonical input (0032 / RF15 / K16), re-checked before any read.
  IF p_attendance IS NULL
     OR p_attendance NOT IN ('ATTENDING', 'MAYBE', 'NOT_ATTENDING')
     OR p_party_size IS NULL
     OR (p_attendance IN ('ATTENDING', 'MAYBE') AND p_party_size NOT BETWEEN 1 AND 20)
     OR (p_attendance = 'NOT_ATTENDING' AND p_party_size <> 0)
     OR (p_message IS NOT NULL AND char_length(p_message) > 500)
     OR p_guest_name IS NULL
     OR char_length(p_guest_name) NOT BETWEEN 1 AND 200
     OR p_guest_name ~ '^[[:space:]]|[[:space:]]$'
  THEN
    RAISE EXCEPTION 'Invalid RSVP input' USING ERRCODE = 'RS001';
  END IF;

  IF p_public_slug IS NULL THEN
    RETURN NULL;
  END IF;

  -- B. Exactly one invitation by its public slug (UNIQUE, 0012).
  SELECT pi.id, pi.project_id, pi.published_version_id
    INTO v_invitation_id, v_project_id, v_published_id
  FROM public.project_invitations AS pi
  WHERE pi.public_slug = p_public_slug;

  -- C. Unknown slug or never published: fail closed, nothing written.
  IF NOT FOUND OR v_published_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- D. The exact published pointer target, re-checked as in 0039.
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

  -- E. One non-personalized response row for that Project.
  INSERT INTO public.rsvps (
    project_id,
    guest_id,
    guest_display_name_snapshot,
    attendance,
    party_size,
    message
  )
  VALUES (
    v_project_id,
    NULL,
    p_guest_name,
    p_attendance,
    p_party_size,
    p_message
  )
  RETURNING id INTO v_rsvp_id;

  RETURN v_rsvp_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_rsvp(text, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_public_rsvp(text, text, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.submit_public_rsvp(text, text, integer, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.submit_public_rsvp(text, text, integer, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.submit_public_rsvp(text, text, integer, text, text) TO service_role;

COMMENT ON FUNCTION public.submit_public_rsvp(text, text, integer, text, text) IS
  'Public RSVP submit (Task 033A, 0040) — service_role-exclusive, called only by POST /api/v2/public/rsvp. Resolves project_invitations.public_slug to its CURRENT PUBLISHED version (must be PUBLISHED, same invitation, same Project, else PI001) and inserts one non-personalized rsvps row (guest_id NULL, typed name in guest_display_name_snapshot) for that Project. Unknown slug or no publication -> NULL, nothing written. Invalid input -> RS001. Never a REVIEW/draft path, never guest identity from a typed name, never a read of existing RSVPs.';
