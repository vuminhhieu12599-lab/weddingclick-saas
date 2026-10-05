-- WeddingClick V2 — Feature Migration 0042 (Task 033B1)
-- Personalized guest link: public resolution of an opaque guest token on
-- /i/[slug]/g/[token], and the guest-bound personalized RSVP upsert.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.19 (guests, token
-- rotation [R14]), §2.20 (rsvps, rsvps_guest_id_key), §11 (I. Personalized
-- Guest Token Model), §12 (J. RSVP Integrity); docs/API_CONTRACT.md §4
-- (guest token resolution), §4.1, §7.3 (NULL invitation_variant rule) and
-- §22; docs/DECISIONS.md "Task 033B1 — Personalized Guest Link Foundation".
--
-- PURPOSE (one): resolve (public slug, SHA-256 token hash) to exactly one
-- guest of the Project the slug CURRENTLY publishes, and let that guest
-- read its display name and insert-or-update its ONE current RSVP.
--
-- Three functions:
--   - resolve_public_guest()        private helper, no EXECUTE for anyone;
--   - get_public_guest_invitation() read-only, service_role only;
--   - submit_public_guest_rsvp()    write, service_role only.
--
-- RESOLUTION (identical for both public functions, via the helper):
--   1. the slug must resolve to a project_invitations row whose
--      published_version_id points at a PUBLISHED row of the same invitation
--      and Project (same integrity rule as 0039/0040, else PI001);
--   2. the presented hash (exactly 32 bytes) must match guests.token_hash
--      (UNIQUE) of a guest whose token_issued_at IS NOT NULL — the raw
--      token never reaches the database, and a dormant never-issued hash
--      never resolves;
--   3. guests.project_id must equal the invitation's project_id;
--   4. the guest's variant must be permitted on this invitation (API §7.3):
--      a non-NULL invitation_variant must equal the invitation's variant; a
--      NULL one resolves to COMMON only for a COMMON-package Project on its
--      COMMON invitation — never guessed for SEPARATE.
--   Any failure of 1–4 is "no row": the callers return NULL, which the
--   application maps to the same not-found as an unknown slug. No answer
--   distinguishes unknown slug / unknown token / other-Project token /
--   wrong-variant token (no cross-project oracle).
--   5. revoked_at is reported only AFTER 1–4 hold (API §4.1: a known guest
--      token that has been revoked -> 410 for the RSVP endpoint; the page
--      renders not-found). Guest tokens have no expiry and no last_used_at.
--
-- RSVP (submit_public_guest_rsvp): guest_id comes ONLY from the resolved
-- token; project_id ONLY from the slug's publication. The typed name is the
-- response snapshot (0032), never identity. One logical RSVP per guest:
-- INSERT ... ON CONFLICT on the existing partial unique index
-- rsvps_guest_id_key (0018: UNIQUE (guest_id) WHERE guest_id IS NOT NULL)
-- DO UPDATE — atomic; attendance, party size, message and name snapshot are
-- replaced; id, project_id, guest_id and created_at are kept. Generic
-- guest_id NULL rows are excluded from that index by PostgreSQL NULL
-- semantics and stay unbounded (0040 unchanged).
--
-- Input re-validated as in 0040 (RS001). Revoked guest -> GT001.
-- Nothing is logged; no error text carries the slug, hash or name.
--
-- ISSUANCE STATE (owner correction): guests.token_issued_at (new, nullable,
-- no default, no backfill — every existing row stays NULL). NULL = no
-- personalized token was ever issued through the staff ISSUE workflow, so
-- the row's token_hash is a dormant placeholder (0017 keeps it NOT NULL)
-- and is NOT a public credential. Set by ISSUE and by REGENERATE. It is
-- the only issuance lifecycle authority; token_hint stays a display hint.
-- Written by the staff issuance path through the existing table-level
-- authenticated UPDATE grant and guests_update_staff RLS (0017).
--
-- No other table, column, constraint, index, grant or policy change: the
-- RSVP uniqueness rule already exists (0018). No earlier object is edited.
--
-- AUTHORING ONLY — not applied by Task 033B1. The owner applies it.

-- ---------------------------------------------------------------------
-- guests.token_issued_at — issuance lifecycle state
-- ---------------------------------------------------------------------
ALTER TABLE public.guests
  ADD COLUMN token_issued_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.guests.token_issued_at IS
  'Task 033B1 (0042): when the current personalized token was issued (ISSUE) or regenerated (REGENERATE) by the staff workflow. NULL = never issued: token_hash is then a dormant placeholder and never resolves publicly. Sole issuance lifecycle authority; token_hint is display-only. Existing rows: NULL (no backfill).';
COMMENT ON COLUMN public.guests.token_hint IS
  'Non-sensitive fragment for staff display only. Never the raw token and never issuance state (see token_issued_at, 0042).';

-- ---------------------------------------------------------------------
-- resolve_public_guest() — private helper
-- ---------------------------------------------------------------------
CREATE FUNCTION public.resolve_public_guest(
  p_public_slug text,
  p_token_hash  bytea,
  OUT project_id   uuid,
  OUT guest_id     uuid,
  OUT display_name text,
  OUT is_revoked   boolean
)
RETURNS SETOF record
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
  v_version       public.invitation_versions%ROWTYPE;
  v_package_code  text;
  v_guest         public.guests%ROWTYPE;
BEGIN
  IF p_public_slug IS NULL OR p_token_hash IS NULL OR octet_length(p_token_hash) <> 32 THEN
    RETURN;
  END IF;

  -- 1. Exactly one invitation by its public slug, currently published.
  SELECT pi.id, pi.project_id, pi.variant, pi.published_version_id
    INTO v_invitation_id, v_project_id, v_variant, v_published_id
  FROM public.project_invitations AS pi
  WHERE pi.public_slug = p_public_slug;

  IF NOT FOUND OR v_published_id IS NULL THEN
    RETURN;
  END IF;

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

  -- 2. Exactly one guest by token hash (UNIQUE, 0017).
  SELECT g.* INTO v_guest
  FROM public.guests AS g
  WHERE g.token_hash = p_token_hash;

  -- Dormant (never issued) hash is not a credential (token_issued_at, 0042).
  IF NOT FOUND OR v_guest.token_issued_at IS NULL THEN
    RETURN;
  END IF;

  -- 3. Project-bound: a token of Project A never opens Project B's slug.
  IF v_guest.project_id IS DISTINCT FROM v_project_id THEN
    RETURN;
  END IF;

  -- 4. Permitted variant (API_CONTRACT §7.3).
  IF v_guest.invitation_variant IS NOT NULL THEN
    IF v_guest.invitation_variant IS DISTINCT FROM v_variant THEN
      RETURN;
    END IF;
  ELSE
    SELECT p.package_code_snapshot INTO v_package_code
    FROM public.projects AS p
    WHERE p.id = v_project_id;

    IF v_package_code IS DISTINCT FROM 'COMMON' OR v_variant IS DISTINCT FROM 'COMMON' THEN
      RETURN;
    END IF;
  END IF;

  project_id   := v_guest.project_id;
  guest_id     := v_guest.id;
  display_name := v_guest.display_name;
  is_revoked   := v_guest.revoked_at IS NOT NULL;
  RETURN NEXT;
END;
$$;

-- Helper only: callable solely from the two owner-run functions below.
REVOKE ALL ON FUNCTION public.resolve_public_guest(text, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_public_guest(text, bytea) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_public_guest(text, bytea) FROM authenticated;
REVOKE ALL ON FUNCTION public.resolve_public_guest(text, bytea) FROM service_role;

COMMENT ON FUNCTION public.resolve_public_guest(text, bytea) IS
  'Task 033B1 (0042) private helper — no EXECUTE grant. Resolves (public slug, guest token SHA-256 hash) to one guest of the Project the slug currently PUBLISHES (PI001 on pointer fault), requiring same Project and a permitted variant (API_CONTRACT §7.3). Zero rows for any mismatch; is_revoked reported only after every binding check holds.';

-- ---------------------------------------------------------------------
-- get_public_guest_invitation() — read-only, service_role only
-- ---------------------------------------------------------------------
CREATE FUNCTION public.get_public_guest_invitation(
  p_public_slug text,
  p_token_hash  bytea
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_display_name text;
  v_is_revoked   boolean;
BEGIN
  SELECT r.display_name, r.is_revoked
    INTO v_display_name, v_is_revoked
  FROM public.resolve_public_guest(p_public_slug, p_token_hash) AS r;

  -- Unresolved or revoked: the page renders not-found either way.
  IF NOT FOUND OR v_is_revoked THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('displayName', v_display_name);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_guest_invitation(text, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_guest_invitation(text, bytea) FROM anon;
REVOKE ALL ON FUNCTION public.get_public_guest_invitation(text, bytea) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_public_guest_invitation(text, bytea) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_public_guest_invitation(text, bytea) TO service_role;

COMMENT ON FUNCTION public.get_public_guest_invitation(text, bytea) IS
  'Personalized public invitation guest read (Task 033B1, 0042) — read-only, service_role-exclusive, called only by the server-rendered /i/[slug]/g/[token] page. Returns {displayName} of the active guest whose token hash resolves on this currently PUBLISHED slug (same Project, permitted variant); NULL otherwise. Never returns the guest id, token hash/hint, contact fields or notes.';

-- ---------------------------------------------------------------------
-- submit_public_guest_rsvp() — write, service_role only
-- ---------------------------------------------------------------------
CREATE FUNCTION public.submit_public_guest_rsvp(
  p_public_slug text,
  p_token_hash  bytea,
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
  v_project_id uuid;
  v_guest_id   uuid;
  v_is_revoked boolean;
  v_rsvp_id    uuid;
BEGIN
  -- A. Canonical input (0032 / 0040), re-checked before any read.
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

  -- B. Guest identity from the token only; Project from the publication.
  SELECT r.project_id, r.guest_id, r.is_revoked
    INTO v_project_id, v_guest_id, v_is_revoked
  FROM public.resolve_public_guest(p_public_slug, p_token_hash) AS r;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_is_revoked THEN
    RAISE EXCEPTION 'Guest link revoked' USING ERRCODE = 'GT001';
  END IF;

  -- C. One logical RSVP per guest (rsvps_guest_id_key, 0018), atomically.
  INSERT INTO public.rsvps AS r (
    project_id,
    guest_id,
    guest_display_name_snapshot,
    attendance,
    party_size,
    message
  )
  VALUES (
    v_project_id,
    v_guest_id,
    p_guest_name,
    p_attendance,
    p_party_size,
    p_message
  )
  ON CONFLICT (guest_id) WHERE guest_id IS NOT NULL
  DO UPDATE SET
    guest_display_name_snapshot = EXCLUDED.guest_display_name_snapshot,
    attendance                  = EXCLUDED.attendance,
    party_size                  = EXCLUDED.party_size,
    message                     = EXCLUDED.message
  RETURNING r.id INTO v_rsvp_id;

  RETURN v_rsvp_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_guest_rsvp(text, bytea, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_public_guest_rsvp(text, bytea, text, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.submit_public_guest_rsvp(text, bytea, text, integer, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.submit_public_guest_rsvp(text, bytea, text, integer, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.submit_public_guest_rsvp(text, bytea, text, integer, text, text) TO service_role;

COMMENT ON FUNCTION public.submit_public_guest_rsvp(text, bytea, text, integer, text, text) IS
  'Personalized public RSVP (Task 033B1, 0042) — service_role-exclusive, called only by POST /api/v2/public/rsvp with a guestToken. guest_id comes only from the token hash resolved on this currently PUBLISHED slug (same Project, permitted variant); project_id only from the publication. Inserts the guest''s one current rsvps row or atomically updates it (ON CONFLICT rsvps_guest_id_key). Unresolved -> NULL, nothing written. Revoked -> GT001. Invalid input -> RS001. The typed name is response data only.';
