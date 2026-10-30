-- WeddingClick V2 — Feature Migration 0056 (RSVP-P0-03)
-- Correcting a generic RSVP instead of duplicating it: rsvps.response_key_hash
-- plus ONE new narrow write function, submit_public_rsvp_keyed().
--
-- Source of truth: docs/DECISIONS.md "RSVP-P0-03 — Generic RSVP Correction
-- Key"; docs/API_CONTRACT.md §20, §41; docs/PHYSICAL_DATABASE_PLAN.md §2.20
-- (rsvps), §12 (J. RSVP Integrity); docs/DATABASE.md §21; docs/SECURITY.md §11.
--
-- AUTHORING ONLY — not applied. Applying it to DEV (then Production) is an
-- explicit Product Owner decision; nothing in this task applies it.
--
-- THE DEFECT. A guest submits a generic (non-personalized) RSVP, presses
-- "Sửa lại hồi âm", changes their answer and submits again. 0040 has no way
-- to recognize the second request as the same response, so it inserts a
-- SECOND row: the Customer Portal then shows one guest twice, with two
-- different party sizes, and the later correction does not replace the
-- earlier mistake. A retried or double-tapped request duplicates the same way.
--
-- PURPOSE (one): let the generic flow carry an opaque, page-instance-scoped
-- response key so a correction UPDATES the row that key already created,
-- atomically, and a repeat can never create a second row for that key.
--
-- WHAT A RESPONSE KEY IS, AND IS NOT
--   * It is 32 CSPRNG bytes generated in the browser when the public
--     invitation page mounts, kept in memory for that one mounted page only
--     (never a cookie, never localStorage/sessionStorage, never a URL).
--   * Only its SHA-256 digest is stored, in response_key_hash. The raw key
--     never reaches the database, a log or the Portal.
--   * It is NOT identity and NOT authorization. It authorizes nothing by
--     itself: every keyed write is still authorized exactly as 0040 is — by
--     the slug's currently PUBLISHED invitation — and the key can only ever
--     reach the one row it itself created, inside that same invitation and
--     Project. It is never derived from a guest name, an IP or a device.
--   * Two page instances (two visits, two devices, two tabs) hold different
--     keys and therefore produce independent responses, even for an
--     identical typed name. That is intentional: this migration deduplicates
--     ONE page's corrections, never people.
--
-- WHAT THIS MIGRATION DOES
--   1. rsvps.response_key_hash — nullable BYTEA, with a 32-byte length CHECK
--      and a CHECK restricting it to generic rows (guest_id IS NULL), plus a
--      partial UNIQUE index so one key owns at most one row anywhere.
--   2. submit_public_rsvp_keyed() — a NEW function (0040's
--      submit_public_rsvp is NOT replaced and NOT dropped) performing one
--      atomic INSERT ... ON CONFLICT DO UPDATE on that index.
--
-- LEGACY WRITERS ARE PRESERVED. submit_public_rsvp (0040/0055) and
-- submit_public_guest_rsvp (0042/0055) are untouched, so the currently
-- deployed application keeps working unchanged while 0056 is applied ahead of
-- the new code, and a browser still running an older cached bundle (which
-- sends no response key) keeps submitting through 0040. The personalized
-- guest-token upsert is not touched in any way.
--
-- HISTORICAL ROWS ARE LEFT ALONE. No DEFAULT, no backfill, no deduplication
-- and no inference: every existing row keeps response_key_hash NULL, so no
-- past duplicate pair is merged and no past row can ever be edited by a key.
--
-- UNCHANGED. Table grants (0018: staff SELECT/DELETE, service_role
-- SELECT/INSERT/UPDATE — column-level grants are not used, so the new column
-- needs none), both RLS policies, forced RLS, every existing CHECK, the
-- rsvps_project_id_idx index, the personalized one-current-row partial unique
-- index rsvps_guest_id_key, rsvps_invitation_fk (0055),
-- guard_rsvp_guest_same_project() and its trigger, set_updated_at,
-- resolve_public_guest() and get_public_guest_invitation() (0042). No new
-- role, policy or activity type, and no change to any Portal read: the
-- Portal never selects this column.

-- ===========================================================================
-- 1. rsvps.response_key_hash — the correction key's digest
-- ===========================================================================
ALTER TABLE public.rsvps
  ADD COLUMN response_key_hash BYTEA NULL;

-- Exactly a SHA-256 digest, so a short or truncated value cannot be stored.
ALTER TABLE public.rsvps
  ADD CONSTRAINT rsvps_response_key_hash_length_check
    CHECK (response_key_hash IS NULL OR octet_length(response_key_hash) = 32);

-- Generic rows only. Personalized responses are already deduplicated by
-- guest identity (rsvps_guest_id_key, 0018); giving them a second,
-- browser-held correction channel would be a competing identity.
ALTER TABLE public.rsvps
  ADD CONSTRAINT rsvps_response_key_generic_only_check
    CHECK (response_key_hash IS NULL OR guest_id IS NULL);

-- One key owns at most ONE row, anywhere in the table. This is what makes a
-- retried or concurrent duplicate request impossible, and what makes a key
-- presented against another invitation or Project fail closed: the INSERT
-- conflicts, and the DO UPDATE below refuses the row.
CREATE UNIQUE INDEX rsvps_response_key_hash_key
  ON public.rsvps (response_key_hash)
  WHERE response_key_hash IS NOT NULL;

COMMENT ON COLUMN public.rsvps.response_key_hash IS
  'RSVP-P0-03 (0056): SHA-256 digest (32 bytes) of the opaque, page-instance-scoped response key a generic public invitation page generates in the browser and holds only in memory. Lets "Sửa lại hồi âm" UPDATE this same row instead of inserting a duplicate. NOT identity and NOT authorization: the write is authorized by the currently PUBLISHED public_slug exactly as in 0040, and the key reaches only the row it created, in that same invitation and Project. The raw key is never stored, logged or shown. NULL = generic row written without a key (every pre-0056 row, and any request from an older client bundle) or a personalized row. No backfill, never inferred from a name, IP or device.';

COMMENT ON CONSTRAINT rsvps_response_key_hash_length_check ON public.rsvps IS
  'RSVP-P0-03 (0056): response_key_hash, when present, is exactly a 32-byte SHA-256 digest.';

COMMENT ON CONSTRAINT rsvps_response_key_generic_only_check ON public.rsvps IS
  'RSVP-P0-03 (0056): a response key may only appear on a generic row (guest_id IS NULL). Personalized responses are deduplicated by guest identity via rsvps_guest_id_key (0018), which this must never compete with.';

COMMENT ON INDEX public.rsvps_response_key_hash_key IS
  'RSVP-P0-03 (0056): one response key owns at most one rsvps row anywhere. The conflict target of submit_public_rsvp_keyed: makes a repeated/retried/concurrent keyed submission an UPDATE of that same row, and makes a key presented against another invitation or Project fail closed with nothing written.';

-- ===========================================================================
-- 2. submit_public_rsvp_keyed() — generic submit-or-correct, atomically
-- ===========================================================================
-- Identical to submit_public_rsvp (0040 + 0055 source attribution) in
-- signature discipline, validation, slug resolution, PUBLISHED pointer
-- integrity (PI001), guest_id NULL semantics and RS001 contract. It differs
-- in exactly two ways: it REQUIRES a 32-byte response key hash, and its
-- single statement is an INSERT ... ON CONFLICT DO UPDATE on
-- rsvps_response_key_hash_key instead of a plain INSERT.
--
-- Atomicity. One statement decides insert-or-update under the unique index,
-- so two concurrent requests carrying the same key cannot both insert: the
-- loser conflicts and updates. There is no read of existing RSVPs anywhere
-- in this function, and therefore no read-then-write race to lose.
--
-- Fail closed on a foreign key value. The DO UPDATE is guarded by
-- project_id + invitation_id + guest_id IS NULL. A key that already belongs
-- to another invitation or another Project (or, impossibly, to a
-- personalized row) matches the index but not the guard, so NO row is
-- inserted and NO row is updated; the statement affects nothing and the
-- function raises RK001. invitation_id is deliberately NOT in the SET list:
-- a stored response keeps the invitation source 0055 recorded for it, and
-- the guard already requires that source to be the invitation being
-- submitted through.
CREATE FUNCTION public.submit_public_rsvp_keyed(
  p_public_slug       text,
  p_response_key_hash bytea,
  p_attendance        text,
  p_party_size        integer,
  p_message           text,
  p_guest_name        text
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
  -- A. Canonical input (0032 / RF15 / K16), re-checked before any read, plus
  --    the response key's own shape. A missing or wrong-length key is
  --    invalid input, never a silent fall back to an unkeyed insert.
  IF p_attendance IS NULL
     OR p_attendance NOT IN ('ATTENDING', 'MAYBE', 'NOT_ATTENDING')
     OR p_party_size IS NULL
     OR (p_attendance IN ('ATTENDING', 'MAYBE') AND p_party_size NOT BETWEEN 1 AND 20)
     OR (p_attendance = 'NOT_ATTENDING' AND p_party_size <> 0)
     OR (p_message IS NOT NULL AND char_length(p_message) > 500)
     OR p_guest_name IS NULL
     OR char_length(p_guest_name) NOT BETWEEN 1 AND 200
     OR p_guest_name ~ '^[[:space:]]|[[:space:]]$'
     OR p_response_key_hash IS NULL
     OR octet_length(p_response_key_hash) <> 32
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

  -- D. The exact published pointer target, re-checked as in 0039/0040.
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

  -- E. ONE logical generic response per key, atomically: the first
  --    submission inserts, every later submission of the same key through
  --    the same invitation updates that same row.
  INSERT INTO public.rsvps AS r (
    project_id,
    invitation_id,
    guest_id,
    guest_display_name_snapshot,
    attendance,
    party_size,
    message,
    response_key_hash
  )
  VALUES (
    v_project_id,
    v_invitation_id,
    NULL,
    p_guest_name,
    p_attendance,
    p_party_size,
    p_message,
    p_response_key_hash
  )
  ON CONFLICT (response_key_hash) WHERE response_key_hash IS NOT NULL
  DO UPDATE SET
    guest_display_name_snapshot = EXCLUDED.guest_display_name_snapshot,
    attendance                  = EXCLUDED.attendance,
    party_size                  = EXCLUDED.party_size,
    message                     = EXCLUDED.message
  WHERE r.project_id    = v_project_id
    AND r.invitation_id = v_invitation_id
    AND r.guest_id IS NULL
  RETURNING r.id INTO v_rsvp_id;

  -- F. The key exists but belongs elsewhere: nothing was inserted and
  --    nothing was updated. Never a duplicate row, never a false success.
  IF v_rsvp_id IS NULL THEN
    RAISE EXCEPTION 'Response key does not belong to this published invitation'
      USING ERRCODE = 'RK001';
  END IF;

  RETURN v_rsvp_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_rsvp_keyed(text, bytea, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_public_rsvp_keyed(text, bytea, text, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.submit_public_rsvp_keyed(text, bytea, text, integer, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.submit_public_rsvp_keyed(text, bytea, text, integer, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.submit_public_rsvp_keyed(text, bytea, text, integer, text, text) TO service_role;

COMMENT ON FUNCTION public.submit_public_rsvp_keyed(text, bytea, text, integer, text, text) IS
  'Generic public RSVP submit-or-correct (RSVP-P0-03, 0056) — service_role-exclusive, called only by POST /api/v2/public/rsvp when the request carries a responseKey. Authorized exactly like submit_public_rsvp (0040): resolves project_invitations.public_slug to its CURRENT PUBLISHED version (must be PUBLISHED, same invitation, same Project, else PI001) and derives project_id and invitation_id (0055) from it alone. One atomic INSERT ... ON CONFLICT (rsvps_response_key_hash_key) DO UPDATE writes the guest''s one row for that key: the first submission inserts (guest_id NULL, typed name in guest_display_name_snapshot), later submissions update the SAME row, and a retried or concurrent repeat can never insert a second one. The recorded invitation source is never rewritten. A key belonging to another invitation/Project updates nothing and raises RK001. Unknown slug or no publication -> NULL, nothing written. Invalid input or a non-32-byte key -> RS001. The key hash is not identity and not authorization; the typed name is still never identity; existing RSVPs are never read. 0040 and 0042/0055 are untouched.';

-- ===========================================================================
-- 3. Post-conditions
-- ===========================================================================
DO $$
DECLARE
  v_keyed        regprocedure := 'public.submit_public_rsvp_keyed(text, bytea, text, integer, text, text)'::regprocedure;
  v_generic      regprocedure := 'public.submit_public_rsvp(text, text, integer, text, text)'::regprocedure;
  v_personalized regprocedure := 'public.submit_public_guest_rsvp(text, bytea, text, integer, text, text)'::regprocedure;
  v_fn           regprocedure;
BEGIN
  -- The column is additive and optional: no DEFAULT, no NOT NULL, no backfill.
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute AS a
    WHERE a.attrelid = 'public.rsvps'::regclass
      AND a.attname = 'response_key_hash'
      AND a.atttypid = 'bytea'::regtype
      AND NOT a.attnotnull
      AND NOT a.atthasdef
  ) THEN
    RAISE EXCEPTION '0056: rsvps.response_key_hash must exist as nullable BYTEA with no default';
  END IF;

  -- Both shape rules are real constraints.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint AS c
    WHERE c.conrelid = 'public.rsvps'::regclass
      AND c.conname = 'rsvps_response_key_hash_length_check'
      AND c.contype = 'c'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint AS c
    WHERE c.conrelid = 'public.rsvps'::regclass
      AND c.conname = 'rsvps_response_key_generic_only_check'
      AND c.contype = 'c'
  ) THEN
    RAISE EXCEPTION '0056: both response-key CHECK constraints must exist';
  END IF;

  -- One key, at most one row: a PARTIAL UNIQUE index on exactly that column.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS i
    JOIN pg_class AS c ON c.oid = i.indexrelid
    WHERE i.indrelid = 'public.rsvps'::regclass
      AND c.relname = 'rsvps_response_key_hash_key'
      AND i.indisunique
      AND i.indpred IS NOT NULL
      AND i.indnatts = 1
      AND i.indkey[0] = (
        SELECT a.attnum FROM pg_attribute AS a
        WHERE a.attrelid = 'public.rsvps'::regclass AND a.attname = 'response_key_hash'
      )
  ) THEN
    RAISE EXCEPTION '0056: rsvps_response_key_hash_key must be a partial unique index on response_key_hash alone';
  END IF;

  -- Nothing historical was keyed, merged or deduplicated.
  IF EXISTS (SELECT 1 FROM public.rsvps WHERE response_key_hash IS NOT NULL) THEN
    RAISE EXCEPTION '0056: no existing rsvps row may be given a response_key_hash by this migration';
  END IF;

  -- The legacy writers survive, so 0056 can be applied before the new code.
  FOREACH v_fn IN ARRAY ARRAY[v_keyed, v_generic, v_personalized] LOOP
    IF NOT (SELECT p.prosecdef FROM pg_proc AS p WHERE p.oid = v_fn) THEN
      RAISE EXCEPTION '0056: % must be SECURITY DEFINER', v_fn;
    END IF;
    IF NOT coalesce((SELECT 'search_path=""' = ANY (p.proconfig) FROM pg_proc AS p WHERE p.oid = v_fn), false) THEN
      RAISE EXCEPTION '0056: % must have an empty search_path', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE')
    THEN
      RAISE EXCEPTION '0056: % EXECUTE grants are not as designed', v_fn;
    END IF;
  END LOOP;

  -- 0018 / 0055 integrity and privileges are untouched.
  IF NOT EXISTS (SELECT 1 FROM pg_class AS c WHERE c.relname = 'rsvps_guest_id_key' AND c.relkind = 'i') THEN
    RAISE EXCEPTION '0056: the personalized one-current-row index rsvps_guest_id_key must still exist';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint AS c
    WHERE c.conrelid = 'public.rsvps'::regclass AND c.conname = 'rsvps_invitation_fk' AND c.contype = 'f'
  ) THEN
    RAISE EXCEPTION '0056: the 0055 composite invitation FK must still exist';
  END IF;
  IF NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class AS c WHERE c.oid = 'public.rsvps'::regclass) THEN
    RAISE EXCEPTION '0056: rsvps must keep forced RLS';
  END IF;
  IF has_table_privilege('anon', 'public.rsvps', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('authenticated', 'public.rsvps', 'INSERT, UPDATE')
     OR has_table_privilege('service_role', 'public.rsvps', 'DELETE')
  THEN
    RAISE EXCEPTION '0056: rsvps table privileges are not as designed';
  END IF;

  RAISE NOTICE '0056 post-conditions verified: rsvps.response_key_hash is optional, generic-only and uniquely owned; submit_public_rsvp_keyed is service_role-only; 0040/0042/0055 writers, 0018 integrity, RLS and privileges unchanged.';
END;
$$;
