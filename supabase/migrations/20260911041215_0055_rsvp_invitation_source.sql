-- WeddingClick V2 — Feature Migration 0055 (RSVP-P0-02)
-- True invitation source on every new RSVP: rsvps.invitation_id, plus the
-- two existing public RSVP write functions recording it.
--
-- Source of truth: docs/DECISIONS.md "RSVP-P0-02 — RSVP Invitation Source
-- Attribution"; docs/API_CONTRACT.md §20, §22.3, §24, §40;
-- docs/PHYSICAL_DATABASE_PLAN.md §2.20 (rsvps), §12 (J. RSVP Integrity);
-- docs/DATABASE.md §21.
--
-- AUTHORING ONLY — not applied. Applying it to DEV (then Production) is an
-- explicit Product Owner decision; nothing in this task applies it.
--
-- THE DEFECT. `rsvps` stored only `project_id`. A SEPARATE Project publishes
-- two public invitations (GROOM and BRIDE) whose RSVPs therefore landed in
-- one undifferentiated pile, and the Customer Portal could only label every
-- non-personalized row "Phản hồi từ link chung". 0040 already resolved the
-- invitation from the slug and then discarded its identity; 0042 resolved it
-- inside resolve_public_guest() and did the same.
--
-- PURPOSE (one): persist the invitation each RSVP was actually submitted
-- through, derived server-side from the same validated currently PUBLISHED
-- slug that already authorizes the write.
--
-- WHAT THIS MIGRATION DOES
--   1. rsvps.invitation_id — nullable, with a COMPOSITE FK
--      (invitation_id, project_id) -> project_invitations (id, project_id)
--      (the 0012 UNIQUE (id, project_id) target, the same shape 0049 uses).
--      Same-Project integrity is therefore structural: an RSVP can never
--      name an invitation of another Project, whatever the caller does.
--   2. CREATE OR REPLACE of exactly the two public write functions, which
--      now insert that derived id. No earlier migration file is edited.
--
-- ON DELETE NO ACTION (not RESTRICT). rsvps.project_id and
-- project_invitations.project_id both cascade from projects. NO ACTION is
-- checked at end of statement, so deleting a Project still cascades both
-- tables in one statement; RESTRICT would abort it. A direct delete of a
-- project_invitations row that still has RSVPs is rejected either way.
--
-- HISTORICAL ROWS ARE LEFT ALONE. No DEFAULT, no backfill, no inference:
-- every existing row keeps invitation_id NULL, which means "source not
-- recorded". Attribution is never guessed from a guest's side, a name or a
-- row's age — the Portal shows such rows as "Chưa xác định nguồn" and never
-- assigns them to a family (docs/API_CONTRACT.md §40).
--
-- UNCHANGED. Table grants (0018: staff SELECT/DELETE, service_role
-- SELECT/INSERT/UPDATE — column-level grants are not used, so the new column
-- needs none), both RLS policies, forced RLS, every CHECK, the
-- rsvps_project_id_idx index, the personalized one-current-row partial
-- unique index rsvps_guest_id_key, guard_rsvp_guest_same_project() and its
-- trigger, set_updated_at, resolve_public_guest() (0042) and
-- get_public_guest_invitation() (0042). No new index: the Portal reads by
-- project_id (0018 index) and groups in the application. No new grant, role,
-- policy, RPC or activity type.

-- ===========================================================================
-- 1. rsvps.invitation_id — the recorded submission source
-- ===========================================================================
ALTER TABLE public.rsvps
  ADD COLUMN invitation_id UUID NULL;

ALTER TABLE public.rsvps
  ADD CONSTRAINT rsvps_invitation_fk
    FOREIGN KEY (invitation_id, project_id)
    REFERENCES public.project_invitations (id, project_id)
    ON DELETE NO ACTION;

COMMENT ON COLUMN public.rsvps.invitation_id IS
  'RSVP-P0-02 (0055): the project_invitations row this response was actually submitted through, derived server-side by submit_public_rsvp / submit_public_guest_rsvp from the validated currently PUBLISHED public_slug — never from client input. NULL = source not recorded (every pre-0055 row; no backfill, never inferred). Same-Project integrity is structural via the composite FK rsvps_invitation_fk.';

COMMENT ON CONSTRAINT rsvps_invitation_fk ON public.rsvps IS
  'RSVP-P0-02 (0055): composite FK (invitation_id, project_id) -> project_invitations (id, project_id), so a response can only name an invitation of its own Project. ON DELETE NO ACTION (end-of-statement) keeps the projects CASCADE delete of both tables working.';

-- ===========================================================================
-- 2. submit_public_rsvp() — generic flow (0040), now recording its source
-- ===========================================================================
-- Identical to 0040 except for the two marked lines: the invitation id it
-- already resolved in step B is now persisted. Same signature, same
-- validation, same PI001/RS001 contract, same guest_id NULL semantics, same
-- unbounded-duplicates rule, still no read of guests or of existing RSVPs.
CREATE OR REPLACE FUNCTION public.submit_public_rsvp(
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

  -- E. One non-personalized response row for that Project, carrying the
  --    invitation it was submitted through (0055).
  INSERT INTO public.rsvps (
    project_id,
    invitation_id,
    guest_id,
    guest_display_name_snapshot,
    attendance,
    party_size,
    message
  )
  VALUES (
    v_project_id,
    v_invitation_id,
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

COMMENT ON FUNCTION public.submit_public_rsvp(text, text, integer, text, text) IS
  'Public RSVP submit (Task 033A 0040, source attribution RSVP-P0-02 0055) — service_role-exclusive, called only by POST /api/v2/public/rsvp. Resolves project_invitations.public_slug to its CURRENT PUBLISHED version (must be PUBLISHED, same invitation, same Project, else PI001) and inserts one non-personalized rsvps row (guest_id NULL, typed name in guest_display_name_snapshot) for that Project, with invitation_id set to that same server-derived invitation — never a client-supplied id or variant. Unknown slug or no publication -> NULL, nothing written. Invalid input -> RS001. Never a REVIEW/draft path, never guest identity from a typed name, never a read of existing RSVPs.';

-- ===========================================================================
-- 3. submit_public_guest_rsvp() — personalized flow (0042), same source
-- ===========================================================================
-- Identical to 0042 except for step C and the two invitation_id lines in the
-- upsert. resolve_public_guest() is untouched (it has no OUT parameter for
-- the invitation), so the invitation is re-derived here from the same slug
-- and PINNED to the Project the helper resolved: the row cannot name another
-- Project's invitation even if the slug lookup were to change under us, and
-- the composite FK is the structural backstop. The helper has already proved
-- the slug resolves, is currently PUBLISHED and belongs to v_project_id, so
-- a miss here is a genuine integrity fault (PI001), not a guest-visible
-- not-found.
--
-- One current row per guest is preserved exactly: the same ON CONFLICT on
-- rsvps_guest_id_key, with invitation_id replaced like the other response
-- fields so a resubmission records the link actually used last.
CREATE OR REPLACE FUNCTION public.submit_public_guest_rsvp(
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
  v_project_id    uuid;
  v_guest_id      uuid;
  v_is_revoked    boolean;
  v_invitation_id uuid;
  v_rsvp_id       uuid;
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

  -- C. The invitation that same validated slug currently publishes (0055),
  --    pinned to the resolved Project. Never a client-supplied id.
  SELECT pi.id INTO v_invitation_id
  FROM public.project_invitations AS pi
  WHERE pi.public_slug = p_public_slug
    AND pi.project_id = v_project_id
    AND pi.published_version_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published version pointer integrity fault'
      USING ERRCODE = 'PI001';
  END IF;

  -- D. One logical RSVP per guest (rsvps_guest_id_key, 0018), atomically.
  INSERT INTO public.rsvps AS r (
    project_id,
    invitation_id,
    guest_id,
    guest_display_name_snapshot,
    attendance,
    party_size,
    message
  )
  VALUES (
    v_project_id,
    v_invitation_id,
    v_guest_id,
    p_guest_name,
    p_attendance,
    p_party_size,
    p_message
  )
  ON CONFLICT (guest_id) WHERE guest_id IS NOT NULL
  DO UPDATE SET
    invitation_id               = EXCLUDED.invitation_id,
    guest_display_name_snapshot = EXCLUDED.guest_display_name_snapshot,
    attendance                  = EXCLUDED.attendance,
    party_size                  = EXCLUDED.party_size,
    message                     = EXCLUDED.message
  RETURNING r.id INTO v_rsvp_id;

  RETURN v_rsvp_id;
END;
$$;

COMMENT ON FUNCTION public.submit_public_guest_rsvp(text, bytea, text, integer, text, text) IS
  'Personalized public RSVP (Task 033B1 0042, source attribution RSVP-P0-02 0055) — service_role-exclusive, called only by POST /api/v2/public/rsvp with a guestToken. guest_id comes only from the token hash resolved on this currently PUBLISHED slug (same Project, permitted variant); project_id and invitation_id only from that same validated publication, pinned to the resolved Project. Inserts the guest''s one current rsvps row or atomically updates it (ON CONFLICT rsvps_guest_id_key), replacing the recorded invitation source with the link actually used. Unresolved -> NULL, nothing written. Revoked -> GT001. Invalid input -> RS001. The typed name is response data only.';

-- ===========================================================================
-- 4. Post-conditions
-- ===========================================================================
DO $$
DECLARE
  v_generic      regprocedure := 'public.submit_public_rsvp(text, text, integer, text, text)'::regprocedure;
  v_personalized regprocedure := 'public.submit_public_guest_rsvp(text, bytea, text, integer, text, text)'::regprocedure;
  v_fn           regprocedure;
BEGIN
  -- The column is additive and optional: no DEFAULT, no NOT NULL, no backfill.
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute AS a
    WHERE a.attrelid = 'public.rsvps'::regclass
      AND a.attname = 'invitation_id'
      AND NOT a.attnotnull
      AND NOT a.atthasdef
  ) THEN
    RAISE EXCEPTION '0055: rsvps.invitation_id must exist, be nullable and have no default';
  END IF;

  -- Same-Project integrity is structural, on both columns together.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint AS c
    WHERE c.conrelid = 'public.rsvps'::regclass
      AND c.conname = 'rsvps_invitation_fk'
      AND c.contype = 'f'
      AND c.confrelid = 'public.project_invitations'::regclass
      AND c.confdeltype = 'a'
      AND c.conkey = ARRAY[
            (SELECT a.attnum FROM pg_attribute AS a WHERE a.attrelid = 'public.rsvps'::regclass AND a.attname = 'invitation_id'),
            (SELECT a.attnum FROM pg_attribute AS a WHERE a.attrelid = 'public.rsvps'::regclass AND a.attname = 'project_id')
          ]::int2[]
  ) THEN
    RAISE EXCEPTION '0055: rsvps_invitation_fk must be a composite (invitation_id, project_id) FK with ON DELETE NO ACTION';
  END IF;

  -- Nothing historical was attributed.
  IF EXISTS (SELECT 1 FROM public.rsvps WHERE invitation_id IS NOT NULL) THEN
    RAISE EXCEPTION '0055: no existing rsvps row may be given an invitation_id by this migration';
  END IF;

  -- 0018 integrity and privileges are untouched.
  IF NOT EXISTS (SELECT 1 FROM pg_class AS c WHERE c.relname = 'rsvps_guest_id_key' AND c.relkind = 'i') THEN
    RAISE EXCEPTION '0055: the personalized one-current-row index rsvps_guest_id_key must still exist';
  END IF;
  IF NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class AS c WHERE c.oid = 'public.rsvps'::regclass) THEN
    RAISE EXCEPTION '0055: rsvps must keep forced RLS';
  END IF;
  IF has_table_privilege('anon', 'public.rsvps', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('authenticated', 'public.rsvps', 'INSERT, UPDATE')
     OR has_table_privilege('service_role', 'public.rsvps', 'DELETE')
  THEN
    RAISE EXCEPTION '0055: rsvps table privileges are not as designed';
  END IF;

  -- Both replaced functions keep their 0040/0042 hardening and grants.
  FOREACH v_fn IN ARRAY ARRAY[v_generic, v_personalized] LOOP
    IF NOT (SELECT p.prosecdef FROM pg_proc AS p WHERE p.oid = v_fn) THEN
      RAISE EXCEPTION '0055: % must be SECURITY DEFINER', v_fn;
    END IF;
    IF NOT coalesce((SELECT 'search_path=""' = ANY (p.proconfig) FROM pg_proc AS p WHERE p.oid = v_fn), false) THEN
      RAISE EXCEPTION '0055: % must have an empty search_path', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE')
    THEN
      RAISE EXCEPTION '0055: % EXECUTE grants are not as designed', v_fn;
    END IF;
  END LOOP;

  RAISE NOTICE '0055 post-conditions verified: rsvps.invitation_id is optional and Project-pinned; both public RSVP writers record it; 0018 integrity, RLS and privileges unchanged.';
END;
$$;
