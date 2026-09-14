-- WeddingClick V2 — Feature Migration 0021 (Task 022)
-- save_wedding_details(): one narrowly-scoped TRUSTED BUSINESS ACTION
-- function for "save canonical wedding details" — the audited create/
-- update/upsert Save described by docs/API_CONTRACT.md §3.1/§9.
--
-- This migration does NOT alter any frozen table shape or RLS policy.
-- wedding_details (0008) keeps its exact columns, constraints, indexes, and
-- RLS policies; activity_logs/log_activity() (0020) are consumed exactly as
-- they already exist and are entirely untouched here. It creates exactly
-- one new function, and additionally tightens wedding_details' table-level
-- privileges — REVOKE INSERT, UPDATE ON TABLE public.wedding_details FROM
-- authenticated — so the audited Save below is the only executable write
-- path, per docs/API_CONTRACT.md §3.1 (Task 022 SQL-review patch; see the
-- TABLE PRIVILEGE TIGHTENING section near the end of this file).
--
-- AUTHORING ONLY — not applied. See task instructions §14/§15: do not run
-- `supabase db push` / migration up / db reset / remote SQL / apply
-- migration. External review happens before preflight/apply.
--
-- ---------------------------------------------------------------------
-- WHY THIS IS A BUSINESS ACTION, NOT A PLAIN RLS UPSERT
-- ---------------------------------------------------------------------
-- docs/API_CONTRACT.md §3.1: a deliberate staff Save that changes canonical,
-- audited domain data must call log_activity('CANONICAL_DATA_APPLIED', ...)
-- atomically with the mutation. log_activity() is private (0020) — not
-- granted EXECUTE to any externally-reachable role — so it is only
-- reachable from inside another SECURITY DEFINER business-action function
-- owned by the same schema-owner role. This function is that function.
--
-- ---------------------------------------------------------------------
-- SECURITY MODEL — SECURITY DEFINER, self-authorizing
-- ---------------------------------------------------------------------
-- Runs as the schema-owner role (BYPASSRLS), so RLS does not protect it —
-- this function protects itself:
--   - requires auth.uid() IS NOT NULL
--   - locks the caller's own public.profiles row (existence required), then
--     — while that lock is still held — requires public.is_staff() IS TRUE
--     — see AUTHORIZATION STABILITY below for why the lock comes first and
--     why is_staff() remains the single authorization predicate rather
--     than a duplicated local role/is_active check
--   - all three checked before any other data access; anything else raises
--     WD001
--
-- SET search_path = '' — every reference below is fully schema-qualified
-- (public.wedding_details, public.projects, public.profiles, public.is_staff(),
-- public.log_activity(), auth.uid()); built-in types (uuid, text,
-- timestamptz, boolean) resolve via the always-implicit pg_catalog search.
--
-- ---------------------------------------------------------------------
-- AUTHORIZATION STABILITY — profile row lock, is_staff() stays authoritative
-- (Task 022 SQL-review patch, final revision)
-- ---------------------------------------------------------------------
-- SECURITY DEFINER (BYPASSRLS) removes RLS as a concern for this function's
-- own data access, but it does NOT by itself close a plain TOCTOU window on
-- the *caller's own authority*: without an explicit lock, nothing prevents
-- an admin from deactivating/demoting the calling staff member (or
-- deleting their profile) in a concurrent transaction that commits
-- somewhere between this function's authorization check and its later
-- mutation/log_activity() call. A previous revision of this migration
-- claimed no such concern existed because the function is SECURITY
-- DEFINER — that claim conflated "RLS doesn't gate this function's reads"
-- with "the caller's authority can't change mid-transaction," which are
-- different properties.
--
-- This revision closes that window WITHOUT duplicating is_staff()'s
-- role/is_active predicate locally. Immediately after confirming
-- auth.uid() IS NOT NULL, it takes `PERFORM 1 FROM public.profiles AS p
-- WHERE p.id = auth.uid() FOR UPDATE` — a single-row existence-and-lock
-- check, not the whole-table SHARE-mode approach 0006b uses, since only
-- one specific row (the caller's own) needs protecting here. FOR UPDATE
-- conflicts with any concurrent UPDATE or DELETE of that row, and the lock
-- is held until this transaction commits or rolls back — i.e. through the
-- target-Project lock below, the upsert/no-op decision, and the
-- log_activity() call — so no concurrent deactivation/demotion/deletion of
-- the caller's profile can apply while this action is in flight; any such
-- concurrent statement blocks until this transaction ends. If no row is
-- locked (NOT FOUND), the caller has no profile at all: WD001.
--
-- Only once that lock is held does this function ask, once,
-- `public.is_staff() IS TRUE` — the centralized, single source of truth
-- for STAFF/ADMIN authorization (migration 0002), never re-implemented
-- here as a local `role IN ('ADMIN','STAFF') AND is_active` check. Because
-- the caller's profiles row is already locked in this same transaction by
-- the time is_staff() runs its own internal (unlocked) read of that same
-- row, no concurrent writer can have changed it out from under this
-- check — the lock stabilizes what is_staff() observes without this
-- function needing to inspect role/is_active itself. is_staff()/is_admin()
-- are otherwise completely untouched and remain the correct, unweakened,
-- authoritative mechanism everywhere else (RLS policies, other business
-- actions) — no new role is introduced, and no authorization logic is
-- duplicated.
--
-- ---------------------------------------------------------------------
-- CONCURRENCY — lock the target Project row FOR UPDATE first
-- ---------------------------------------------------------------------
-- `SELECT ... FROM public.projects WHERE id = p_project_id FOR UPDATE`
-- is the very first data access after the caller check. Because this
-- function is SECURITY DEFINER (owner, BYPASSRLS), the row-locking SELECT
-- is not subject to any RLS UPDATE-policy visibility restriction — unlike
-- 0006b's SECURITY INVOKER design, a plain per-row FOR UPDATE is safe and
-- sufficient here. Holding this lock until commit/rollback serializes any
-- two concurrent save_wedding_details calls for the same Project — the
-- second waits for the first to finish before it can read/compare/upsert.
-- Concurrent saves for *different* Projects proceed independently (only
-- that one row's lock is taken, not a whole-table lock).
--
-- ---------------------------------------------------------------------
-- ERROR CONTRACT
-- ---------------------------------------------------------------------
-- Expected business-validation failures raise a custom, stable SQLSTATE
-- from the WDxxx range (not a standard PostgreSQL class, not shared with
-- create_project_with_addons()'s WCxxx range):
--   WD001  caller is not an active WeddingClick STAFF/ADMIN — raised when
--          auth.uid() is null, when the caller has no profiles row (after
--          it is locked FOR UPDATE), or when public.is_staff() — evaluated
--          while that lock is held — is not true (see AUTHORIZATION
--          STABILITY above); is_staff() remains the sole authorization
--          predicate, never duplicated locally
--   WD002  Project not found
--   WD003  Project is not a WEDDING Project — defense-in-depth only.
--          projects.event_type currently carries a DB CHECK restricting it
--          to ('WEDDING') alone (migration 0005), so this branch is
--          unreachable today; kept so a future additional event_type does
--          not silently let this action apply wedding-shaped canonical
--          data to a non-wedding Project without this function being
--          revisited. Mapped in
--          lib/server/wedding-details/wedding-details-rpc-error-codes.ts to
--          ApiError kind INVARIANT (HTTP 422) — a well-formed Project id
--          that violates this business invariant, not malformed input —
--          rather than left to fall through to a generic HTTP 500, so the
--          RPC's contract stays correct if EventType expands later
--          (Task 022 error-contract patch).
--   WD004  groom/bride gift QR media reference does not belong to this
--          Project (translates the wedding_details composite FK's
--          foreign_key_violation into a stable, safe code instead of
--          forwarding raw constraint-name/Postgres error text). Mapped in
--          wedding-details-rpc-error-codes.ts to ApiError kind INVARIANT
--          (HTTP 422) — the referenced media id is well-formed, but the
--          request violates the same-Project business invariant (Task 022
--          error-contract patch).
-- Every RAISE EXCEPTION message below is a fixed, safe string — never a
-- forwarded raw Postgres/Supabase error. Any OTHER database failure is left
-- unhandled and propagates as a normal Postgres error with its own native
-- SQLSTATE; application code maps any SQLSTATE it does not recognize to a
-- generic HTTP 500 and never forwards the raw message.
--
-- ---------------------------------------------------------------------
-- NO-OP SAVE RULE (task §6)
-- ---------------------------------------------------------------------
-- If the row does not yet exist, this is always a create (changed=true,
-- operation='CREATED'). If it exists, the 20 submitted canonical columns
-- are compared against the persisted row using a row-constructor
-- `IS DISTINCT FROM` comparison (correct NULL-safe equality across every
-- column at once). Identical values -> changed=false, operation=NULL, no
-- UPDATE statement is issued (so wedding_details.updated_at does not move
-- and no activity_logs row is written) — this is what prevents
-- activity_logs from becoming Save-button telemetry (API_CONTRACT.md §6).
-- Different values -> changed=true, operation='UPDATED', ordinary UPDATE
-- fires the existing wedding_details_set_updated_at trigger (0008) to stamp
-- updated_at — this function never writes updated_at itself.
-- project_id is never included in the UPDATE's SET list, so an existing
-- row's project_id can never be mutated by this function.
--
-- ---------------------------------------------------------------------
-- RETURN CONTRACT
-- ---------------------------------------------------------------------
-- RETURNS TABLE of the full wedding_details row (flattened columns, not a
-- composite type — simplest, most predictable shape for a PostgREST RPC
-- caller) plus `changed boolean` and `operation text` ('CREATED'/'UPDATED'/
-- NULL). Deliberately does not return the activity_logs id (task §8).
-- ---------------------------------------------------------------------

CREATE FUNCTION public.save_wedding_details(
  p_project_id uuid,
  p_groom_name text,
  p_bride_name text,
  p_groom_father text,
  p_groom_mother text,
  p_bride_father text,
  p_bride_mother text,
  p_groom_family_address text,
  p_bride_family_address text,
  p_invitation_message text,
  p_love_story text,
  p_lunar_date_display text,
  p_additional_note text,
  p_groom_bank_name text,
  p_groom_bank_account_name text,
  p_groom_bank_account_number text,
  p_groom_bank_qr_media_id uuid,
  p_bride_bank_name text,
  p_bride_bank_account_name text,
  p_bride_bank_account_number text,
  p_bride_bank_qr_media_id uuid
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  groom_name text,
  bride_name text,
  groom_father text,
  groom_mother text,
  bride_father text,
  bride_mother text,
  groom_family_address text,
  bride_family_address text,
  invitation_message text,
  love_story text,
  lunar_date_display text,
  additional_note text,
  groom_bank_name text,
  groom_bank_account_name text,
  groom_bank_account_number text,
  groom_bank_qr_media_id uuid,
  bride_bank_name text,
  bride_bank_account_name text,
  bride_bank_account_number text,
  bride_bank_qr_media_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  changed boolean,
  operation text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_event_type text;
  v_existing            public.wedding_details%ROWTYPE;
  v_result              public.wedding_details%ROWTYPE;
  v_changed             boolean;
  v_operation           text;
BEGIN
  -- ---------------------------------------------------------------------
  -- A. Caller — must be an active WeddingClick STAFF/ADMIN right now,
  -- independent of whatever the calling application layer already checked
  -- before invoking this RPC. See AUTHORIZATION STABILITY (header): the
  -- profile row lock stabilizes caller authorization against a concurrent
  -- deactivation/update, but public.is_staff() — the centralized,
  -- authoritative authorization helper — remains the sole predicate that
  -- decides STAFF/ADMIN status. No role/is_active check is duplicated
  -- locally.
  -- ---------------------------------------------------------------------
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'WD001';
  END IF;

  -- Lock the caller's own profiles row first (existence + concurrency
  -- guard only — no role/is_active inspection here).
  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'WD001';
  END IF;

  -- While that lock is still held, ask the one authoritative question.
  IF public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'WD001';
  END IF;

  -- ---------------------------------------------------------------------
  -- B. Lock the target Project row FOR UPDATE first, so concurrent saves
  -- for one Project serialize (see header). SECURITY DEFINER means this is
  -- not subject to any RLS UPDATE-policy visibility restriction.
  -- ---------------------------------------------------------------------
  SELECT p.event_type INTO v_project_event_type
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'WD002';
  END IF;

  -- ---------------------------------------------------------------------
  -- C. Defense-in-depth only — see header WD003 note. Unreachable under
  -- the current projects.event_type CHECK ('WEDDING' is the only value).
  -- ---------------------------------------------------------------------
  IF v_project_event_type <> 'WEDDING' THEN
    RAISE EXCEPTION 'Target Project is not a WEDDING project'
      USING ERRCODE = 'WD003';
  END IF;

  -- ---------------------------------------------------------------------
  -- D. Read the existing wedding_details row, if any. No separate row lock
  -- needed: the projects-row FOR UPDATE above already serializes concurrent
  -- save_wedding_details calls for this same Project.
  --
  -- Table alias + qualified columns (Task 022 SQL-review patch): this
  -- function's RETURNS TABLE declares an output column named project_id
  -- (among others), which is also a real wedding_details column name. Left
  -- unqualified, `WHERE project_id = ...` is ambiguous between the OUT
  -- parameter and the table column under plpgsql's variable-resolution
  -- rules — previously an unqualified reference here, which would raise a
  -- runtime "column reference is ambiguous" error on every invocation.
  -- Qualifying with the `wd` alias resolves it to the table column.
  -- ---------------------------------------------------------------------
  SELECT wd.* INTO v_existing
  FROM public.wedding_details AS wd
  WHERE wd.project_id = p_project_id;

  BEGIN
    IF NOT FOUND THEN
      -- ---------------------------------------------------------------
      -- E1. No existing row — always a create.
      -- ---------------------------------------------------------------
      INSERT INTO public.wedding_details (
        project_id,
        groom_name, bride_name,
        groom_father, groom_mother, bride_father, bride_mother,
        groom_family_address, bride_family_address,
        invitation_message, love_story, lunar_date_display, additional_note,
        groom_bank_name, groom_bank_account_name, groom_bank_account_number,
        groom_bank_qr_media_id,
        bride_bank_name, bride_bank_account_name, bride_bank_account_number,
        bride_bank_qr_media_id
      ) VALUES (
        p_project_id,
        p_groom_name, p_bride_name,
        p_groom_father, p_groom_mother, p_bride_father, p_bride_mother,
        p_groom_family_address, p_bride_family_address,
        p_invitation_message, p_love_story, p_lunar_date_display, p_additional_note,
        p_groom_bank_name, p_groom_bank_account_name, p_groom_bank_account_number,
        p_groom_bank_qr_media_id,
        p_bride_bank_name, p_bride_bank_account_name, p_bride_bank_account_number,
        p_bride_bank_qr_media_id
      )
      RETURNING * INTO v_result;

      v_changed := true;
      v_operation := 'CREATED';
    ELSE
      -- ---------------------------------------------------------------
      -- E2. Existing row — NULL-safe row-constructor comparison across all
      -- 20 editable columns decides changed vs. no-op (task §6).
      -- ---------------------------------------------------------------
      v_changed := (
        v_existing.groom_name, v_existing.bride_name,
        v_existing.groom_father, v_existing.groom_mother,
        v_existing.bride_father, v_existing.bride_mother,
        v_existing.groom_family_address, v_existing.bride_family_address,
        v_existing.invitation_message, v_existing.love_story,
        v_existing.lunar_date_display, v_existing.additional_note,
        v_existing.groom_bank_name, v_existing.groom_bank_account_name,
        v_existing.groom_bank_account_number, v_existing.groom_bank_qr_media_id,
        v_existing.bride_bank_name, v_existing.bride_bank_account_name,
        v_existing.bride_bank_account_number, v_existing.bride_bank_qr_media_id
      ) IS DISTINCT FROM (
        p_groom_name, p_bride_name,
        p_groom_father, p_groom_mother,
        p_bride_father, p_bride_mother,
        p_groom_family_address, p_bride_family_address,
        p_invitation_message, p_love_story,
        p_lunar_date_display, p_additional_note,
        p_groom_bank_name, p_groom_bank_account_name,
        p_groom_bank_account_number, p_groom_bank_qr_media_id,
        p_bride_bank_name, p_bride_bank_account_name,
        p_bride_bank_account_number, p_bride_bank_qr_media_id
      );

      IF v_changed THEN
        -- project_id is deliberately never in this SET list — an existing
        -- row's project_id can never be mutated by this function.
        -- updated_at is deliberately never set here — the existing
        -- wedding_details_set_updated_at BEFORE UPDATE trigger (0008)
        -- stamps it.
        -- Table alias + qualified WHERE/RETURNING (Task 022 SQL-review
        -- patch): same ambiguity class as the SELECT above — `project_id`
        -- (and every other bare column name here) collides with this
        -- function's RETURNS TABLE output column names. The SET clause's
        -- target column names (LHS of each `=`) are unaffected — Postgres
        -- always resolves an UPDATE's SET target as a column of the named
        -- table, never as a plpgsql variable, so they are deliberately
        -- left unqualified (bare `groom_name`, not `wd.groom_name`, which
        -- is not valid syntax for a SET target). Only the WHERE clause and
        -- RETURNING list needed qualification.
        UPDATE public.wedding_details AS wd SET
          groom_name = p_groom_name,
          bride_name = p_bride_name,
          groom_father = p_groom_father,
          groom_mother = p_groom_mother,
          bride_father = p_bride_father,
          bride_mother = p_bride_mother,
          groom_family_address = p_groom_family_address,
          bride_family_address = p_bride_family_address,
          invitation_message = p_invitation_message,
          love_story = p_love_story,
          lunar_date_display = p_lunar_date_display,
          additional_note = p_additional_note,
          groom_bank_name = p_groom_bank_name,
          groom_bank_account_name = p_groom_bank_account_name,
          groom_bank_account_number = p_groom_bank_account_number,
          groom_bank_qr_media_id = p_groom_bank_qr_media_id,
          bride_bank_name = p_bride_bank_name,
          bride_bank_account_name = p_bride_bank_account_name,
          bride_bank_account_number = p_bride_bank_account_number,
          bride_bank_qr_media_id = p_bride_bank_qr_media_id
        WHERE wd.project_id = p_project_id
        RETURNING wd.* INTO v_result;

        v_operation := 'UPDATED';
      ELSE
        v_result := v_existing;
        v_operation := NULL;
      END IF;
    END IF;
  EXCEPTION
    WHEN foreign_key_violation THEN
      -- Translates the wedding_details_groom_bank_qr_media_fk /
      -- wedding_details_bride_bank_qr_media_fk composite FK violation
      -- (0008) into a stable, safe application error rather than
      -- forwarding the raw constraint name/Postgres message.
      RAISE EXCEPTION 'Gift QR media reference must belong to the same Project'
        USING ERRCODE = 'WD004';
  END;

  -- ---------------------------------------------------------------------
  -- F. Activity log — only when a real change happened (task §6/§7). Fires
  -- inside this same transaction as the mutation above, so the mutation and
  -- the audit row commit or roll back together.
  -- ---------------------------------------------------------------------
  IF v_changed THEN
    PERFORM public.log_activity(
      p_project_id,
      'STAFF',
      'CANONICAL_DATA_APPLIED',
      'Canonical wedding details saved',
      jsonb_build_object('domain', 'wedding_details', 'operation', v_operation)
    );
  END IF;

  RETURN QUERY SELECT
    v_result.id, v_result.project_id,
    v_result.groom_name, v_result.bride_name,
    v_result.groom_father, v_result.groom_mother,
    v_result.bride_father, v_result.bride_mother,
    v_result.groom_family_address, v_result.bride_family_address,
    v_result.invitation_message, v_result.love_story,
    v_result.lunar_date_display, v_result.additional_note,
    v_result.groom_bank_name, v_result.groom_bank_account_name,
    v_result.groom_bank_account_number, v_result.groom_bank_qr_media_id,
    v_result.bride_bank_name, v_result.bride_bank_account_name,
    v_result.bride_bank_account_number, v_result.bride_bank_qr_media_id,
    v_result.created_at, v_result.updated_at,
    v_changed, v_operation;
END;
$$;

-- ---------------------------------------------------------------------
-- Explicit Data API privileges — locked down immediately after creation,
-- before COMMENT ON FUNCTION (Task 022 preflight statement-order hardening
-- — no privilege change, purely a reordering so the function never has an
-- instant of undefined/default privilege between CREATE FUNCTION and its
-- REVOKE/GRANT block). PUBLIC: no execute. anon: no execute. authenticated:
-- execute (self-authorizes internally by locking its own profiles row,
-- then requiring public.is_staff() IS TRUE — the centralized, authoritative
-- authorization helper — while that lock is held; see AUTHORIZATION
-- STABILITY above). service_role: no execute (Task 022 must never use
-- service_role anywhere). No overloads.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.save_wedding_details(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, uuid, text, text, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_wedding_details(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, uuid, text, text, text, uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.save_wedding_details(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, uuid, text, text, text, uuid
) FROM authenticated;
REVOKE ALL ON FUNCTION public.save_wedding_details(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, uuid, text, text, text, uuid
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.save_wedding_details(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, uuid, text, text, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.save_wedding_details(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, uuid, text, text, text, uuid
) IS
  'Audited canonical wedding_details Save/upsert (Task 022) — TRUSTED BUSINESS ACTION per docs/API_CONTRACT.md §3.1. Self-authorizes by locking the caller''s own profiles row FOR UPDATE (stabilizes caller authorization against concurrent deactivation/update) then requiring public.is_staff() IS TRUE — the centralized, authoritative authorization helper, never duplicated locally (see AUTHORIZATION STABILITY in this file''s header); locks the target Project row FOR UPDATE; no-op when submitted values match the persisted row (no UPDATE, no activity log); calls log_activity(''CANONICAL_DATA_APPLIED'') atomically on real change. See supabase/migrations/20260911041141_0021_save_wedding_details.sql header for the full contract.';

-- No direct GRANT EXECUTE on public.log_activity() is added anywhere in this
-- migration — it remains reachable only from inside this and other existing
-- SECURITY DEFINER business-action functions (0020's own REVOKE block is
-- untouched and unaffected by this migration).

-- ---------------------------------------------------------------------
-- TABLE PRIVILEGE TIGHTENING (Task 022 SQL-review patch)
-- ---------------------------------------------------------------------
-- Enforces docs/API_CONTRACT.md §3.1: wedding_details create/update Save
-- must be the audited business action above, never a plain RLS write.
-- Migration 0008 granted `authenticated` SELECT, INSERT, UPDATE on
-- wedding_details (RLS-scoped to is_staff()). That INSERT/UPDATE grant
-- predates this business action and, left in place, would let any staff
-- JWT bypass save_wedding_details() entirely via a direct PostgREST
-- `.from("wedding_details").insert/update(...)` call — silently skipping
-- the no-op/upsert semantics, the target-Project/profile locking, and
-- CANONICAL_DATA_APPLIED activity logging this migration exists to
-- guarantee. This migration does not touch wedding_details' table shape,
-- RLS policies, or SELECT privilege — `authenticated` SELECT remains
-- exactly as migration 0008 granted it. It revokes only the INSERT/UPDATE
-- table privileges that made a direct bypass possible:
REVOKE INSERT, UPDATE ON TABLE public.wedding_details FROM authenticated;

-- The wedding_details_insert_staff / wedding_details_update_staff RLS
-- policies (migration 0008) are deliberately left in place, unmodified —
-- this is a privilege change, not an RLS/table-shape change. Without the
-- underlying INSERT/UPDATE table privilege, those policies have nothing
-- left to authorize: Postgres checks table-level privilege before RLS is
-- ever consulted, so INSERT/UPDATE is rejected at the privilege check,
-- regardless of policy content. `anon` and `service_role` already carry no
-- INSERT/UPDATE (or any) privilege on wedding_details from migration 0008
-- (`REVOKE ALL ... FROM anon/service_role`, never re-granted) — this
-- migration does not grant either role any write access here, and there is
-- nothing further to revoke from them.
