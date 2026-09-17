-- WeddingClick V2 — Feature Migration 0022 (Task 023)
-- create_project_event() / update_project_event() / delete_project_event():
-- three narrowly-scoped TRUSTED BUSINESS ACTION functions for the audited
-- Project Events canonical mutations described by docs/API_CONTRACT.md
-- §3.1/§9 ("project_events create/update/delete — TRUSTED BUSINESS ACTION —
-- same pattern, same CANONICAL_DATA_APPLIED action type").
--
-- This migration does NOT alter any frozen table shape, CHECK constraint, or
-- RLS policy. project_events (0009) keeps its exact columns, constraints,
-- indexes, and RLS policies; activity_logs/log_activity() (0020) are
-- consumed exactly as they already exist and are entirely untouched here. It
-- creates exactly three new functions, and additionally tightens
-- project_events' table-level privileges — REVOKE INSERT, UPDATE, DELETE ON
-- TABLE public.project_events FROM authenticated — so the three audited
-- business actions below are the only executable write path, mirroring
-- migration 0021's (Task 022) wedding_details privilege tightening.
--
-- AUTHORING ONLY — not applied. See task instructions §13/§14: do not run
-- `supabase db push` / migration up / db reset / remote SQL / apply
-- migration. External review happens before preflight/apply.
--
-- ---------------------------------------------------------------------
-- WHY THESE ARE BUSINESS ACTIONS, NOT PLAIN RLS WRITES
-- ---------------------------------------------------------------------
-- docs/API_CONTRACT.md §3.1's classification table lists
-- "project_events create/update/delete" explicitly as TRUSTED BUSINESS
-- ACTION, same CANONICAL_DATA_APPLIED action type as save_wedding_details.
-- log_activity() is private (0020) — not granted EXECUTE to any
-- externally-reachable role — so it is only reachable from inside another
-- SECURITY DEFINER business-action function owned by the same schema-owner
-- role. These three functions are those functions.
--
-- ---------------------------------------------------------------------
-- SECURITY MODEL — SECURITY DEFINER, self-authorizing (mirrors 0021 exactly)
-- ---------------------------------------------------------------------
-- Each function runs as the schema-owner role (BYPASSRLS), so RLS does not
-- protect it — each function protects itself, identically to
-- save_wedding_details (0021):
--   - requires auth.uid() IS NOT NULL
--   - locks the caller's own public.profiles row (existence required), then
--     — while that lock is still held — requires public.is_staff() IS TRUE
--     (see 0021's AUTHORIZATION STABILITY note — the same reasoning applies
--     here verbatim and is not re-derived in this header)
--   - all checked before any other data access; anything else raises PE001
--
-- SET search_path = '' — every reference below is fully schema-qualified
-- (public.project_events, public.projects, public.profiles, public.is_staff(),
-- public.log_activity(), auth.uid()); built-in types (uuid, text, timestamptz,
-- integer, boolean) resolve via the always-implicit pg_catalog search.
--
-- ---------------------------------------------------------------------
-- CONCURRENCY — lock the target Project row FOR UPDATE first, then (for
-- update/delete) the target Event row FOR UPDATE
-- ---------------------------------------------------------------------
-- Every one of the three functions locks the target Project row
-- (`SELECT ... FROM public.projects WHERE id = p_project_id FOR UPDATE`)
-- immediately after caller authorization, exactly like save_wedding_details.
-- This serializes concurrent create/update/delete calls for the same
-- Project — including races around the partial-unique "one primary event
-- per (project_id, side)" index (0009) — while concurrent calls for
-- *different* Projects proceed independently.
--
-- update_project_event and delete_project_event additionally lock the
-- target Event row FOR UPDATE, scoped by *both* `id = p_event_id AND
-- project_id = p_project_id` in the same statement — this single query does
-- double duty as the existence check, the cross-Project-ownership check, and
-- the concurrency lock (task §9/§10). If no row matches, PE004 is raised
-- without distinguishing "event does not exist at all" from "event exists
-- but belongs to a different Project" — the same anti-enumeration principle
-- API_CONTRACT.md §4.1 applies to token failures.
--
-- ---------------------------------------------------------------------
-- ERROR CONTRACT
-- ---------------------------------------------------------------------
-- Expected business-validation failures raise a custom, stable SQLSTATE from
-- the PExxx range (not a standard PostgreSQL class, not shared with
-- create_project_with_addons()'s WCxxx range or save_wedding_details()'s
-- WDxxx range):
--   PE001  caller is not an active WeddingClick STAFF/ADMIN — same
--          three-branch check as WD001 (auth.uid() null, no profiles row,
--          or public.is_staff() not true while the profile lock is held)
--   PE002  Project not found
--   PE003  Project is not a WEDDING Project — defense-in-depth only,
--          mirrors WD003 exactly (unreachable today under the current
--          projects.event_type CHECK, kept so a future additional
--          event_type does not silently let this action apply
--          wedding-occasion-shaped canonical data to a non-wedding Project
--          without these functions being revisited). Raised by
--          create_project_event and update_project_event only —
--          delete_project_event does not write any wedding-occasion-shaped
--          data, so this check does not apply to it.
--   PE004  target Event not found for the target Project (covers both
--          "no such event id" and "event id exists but belongs to a
--          different Project" — deliberately not distinguished, see
--          CONCURRENCY above). Raised by update_project_event and
--          delete_project_event only.
--   PE005  another event row already holds is_primary = true for the same
--          (project_id, side) — translates ONLY a unique_violation whose
--          GET STACKED DIAGNOSTICS ... = CONSTRAINT_NAME equals the exact
--          name of the project_events_one_primary_per_project_side_idx
--          partial unique index (0009) into a stable, safe code instead of
--          forwarding raw index-name/Postgres error text. Any other
--          unique_violation on project_events (none exist under the
--          current 0009 schema) is deliberately re-raised unchanged by a
--          bare RAISE, so it is never mistranslated as PE005 and instead
--          falls through to the generic unrecognized-SQLSTATE -> HTTP 500
--          path. Raised by create_project_event and update_project_event
--          only.
-- Every RAISE EXCEPTION message below is a fixed, safe string — never a
-- forwarded raw Postgres/Supabase error. Any OTHER database failure is left
-- unhandled and propagates as a normal Postgres error with its own native
-- SQLSTATE; application code maps any SQLSTATE it does not recognize to a
-- generic HTTP 500 and never forwards the raw message.
--
-- ---------------------------------------------------------------------
-- FULL-RESOURCE INPUT CONTRACT (task §4 — "determine full vs. partial")
-- ---------------------------------------------------------------------
-- Both create_project_event and update_project_event accept the complete
-- set of 11 editable columns (everything except the server-owned id,
-- project_id, created_at, updated_at) as required parameters — mirroring
-- save_wedding_details' "full canonical Save, not field-level autosave"
-- convention (0021/Task 022 §4). This function layer does not itself decide
-- "missing key -> reject"; that request-shape validation lives in the
-- application layer (lib/server/project-events/validate-project-event-input.ts),
-- exactly as validate-save-wedding-details-input.ts owns that decision for
-- wedding_details. Every parameter here is NOT NULL at the SQL level except
-- the four genuinely-nullable columns (venue_name, address, map_url,
-- description), matching the table's own NULL/NOT NULL shape (0009).
--
-- ---------------------------------------------------------------------
-- NO-OP UPDATE RULE (task §7, mirrors 0021's NO-OP SAVE RULE)
-- ---------------------------------------------------------------------
-- update_project_event compares the 11 submitted editable columns against
-- the locked, persisted row using a row-constructor `IS DISTINCT FROM`
-- comparison. Identical values -> changed=false, operation=NULL, no UPDATE
-- statement is issued (so project_events.updated_at does not move and no
-- activity_logs row is written). Different values -> changed=true,
-- operation='UPDATED', ordinary UPDATE fires the existing
-- project_events_set_updated_at trigger (0009) to stamp updated_at — this
-- function never writes updated_at itself. create_project_event has no
-- no-op concept — a create is always a real change (task §7 only defines
-- no-op semantics for UPDATE). delete_project_event has no no-op concept
-- either — deletion is always meaningful and always audited (task §7).
--
-- ---------------------------------------------------------------------
-- RETURN CONTRACT
-- ---------------------------------------------------------------------
-- create_project_event RETURNS TABLE of the full project_events row
-- (flattened columns, matching save_wedding_details' PostgREST-friendly
-- shape). update_project_event RETURNS the same row shape plus `changed
-- boolean` and `operation text` ('UPDATED'/NULL). delete_project_event
-- RETURNS void — a successful call with no exception is the only success
-- signal needed; there is nothing meaningful to return for a deleted row.
-- ---------------------------------------------------------------------

CREATE FUNCTION public.create_project_event(
  p_project_id uuid,
  p_occasion_type text,
  p_side text,
  p_title text,
  p_starts_at timestamptz,
  p_timezone text,
  p_venue_name text,
  p_address text,
  p_map_url text,
  p_description text,
  p_sort_order integer,
  p_is_primary boolean
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  occasion_type text,
  side text,
  title text,
  starts_at timestamptz,
  timezone text,
  venue_name text,
  address text,
  map_url text,
  description text,
  sort_order integer,
  is_primary boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_event_type text;
  v_result              public.project_events%ROWTYPE;
  v_constraint_name     text;
BEGIN
  -- A. Caller — see header SECURITY MODEL / 0021's AUTHORIZATION STABILITY.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PE001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PE001';
  END IF;

  IF public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PE001';
  END IF;

  -- B. Lock the target Project row FOR UPDATE first (header CONCURRENCY).
  SELECT p.event_type INTO v_project_event_type
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'PE002';
  END IF;

  -- C. Defense-in-depth only — see header PE003 note. Unreachable under the
  -- current projects.event_type CHECK ('WEDDING' is the only value).
  IF v_project_event_type <> 'WEDDING' THEN
    RAISE EXCEPTION 'Target Project is not a WEDDING project'
      USING ERRCODE = 'PE003';
  END IF;

  -- D. Insert. Always a real change — no no-op concept for create.
  BEGIN
    INSERT INTO public.project_events (
      project_id, occasion_type, side, title, starts_at, timezone,
      venue_name, address, map_url, description, sort_order, is_primary
    ) VALUES (
      p_project_id, p_occasion_type, p_side, p_title, p_starts_at, p_timezone,
      p_venue_name, p_address, p_map_url, p_description, p_sort_order, p_is_primary
    )
    RETURNING * INTO v_result;
  EXCEPTION
    WHEN unique_violation THEN
      -- Translates ONLY project_events_one_primary_per_project_side_idx
      -- (0009) into a stable, safe application error rather than
      -- forwarding the raw index name/Postgres message. Any OTHER
      -- unique_violation on this table (none exist today, but this must
      -- not silently swallow one introduced by a future migration) is
      -- re-raised unchanged so it falls through to the generic
      -- unrecognized-SQLSTATE -> HTTP 500 path (header ERROR CONTRACT).
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

      IF v_constraint_name = 'project_events_one_primary_per_project_side_idx' THEN
        RAISE EXCEPTION 'Another event is already marked primary for this Project/side'
          USING ERRCODE = 'PE005';
      END IF;

      RAISE;
  END;

  -- E. Activity log — atomic with the insert above (task §5/§7).
  PERFORM public.log_activity(
    p_project_id,
    'STAFF',
    'CANONICAL_DATA_APPLIED',
    'Project event created',
    jsonb_build_object('domain', 'project_events', 'operation', 'CREATED')
  );

  RETURN QUERY SELECT
    v_result.id, v_result.project_id, v_result.occasion_type, v_result.side,
    v_result.title, v_result.starts_at, v_result.timezone, v_result.venue_name,
    v_result.address, v_result.map_url, v_result.description, v_result.sort_order,
    v_result.is_primary, v_result.created_at, v_result.updated_at;
END;
$$;

COMMENT ON FUNCTION public.create_project_event(
  uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
) IS
  'Audited canonical project_events create (Task 023) — TRUSTED BUSINESS ACTION per docs/API_CONTRACT.md §3.1. Self-authorizes by locking the caller''s own profiles row FOR UPDATE then requiring public.is_staff() IS TRUE (mirrors save_wedding_details, 0021); locks the target Project row FOR UPDATE; always calls log_activity(''CANONICAL_DATA_APPLIED'') atomically. See supabase/migrations/20260911041142_0022_project_events_actions.sql header for the full contract.';

REVOKE ALL ON FUNCTION public.create_project_event(
  uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_project_event(
  uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
) FROM anon;
REVOKE ALL ON FUNCTION public.create_project_event(
  uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_project_event(
  uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.create_project_event(
  uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
) TO authenticated;

-- ---------------------------------------------------------------------

CREATE FUNCTION public.update_project_event(
  p_project_id uuid,
  p_event_id uuid,
  p_occasion_type text,
  p_side text,
  p_title text,
  p_starts_at timestamptz,
  p_timezone text,
  p_venue_name text,
  p_address text,
  p_map_url text,
  p_description text,
  p_sort_order integer,
  p_is_primary boolean
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  occasion_type text,
  side text,
  title text,
  starts_at timestamptz,
  timezone text,
  venue_name text,
  address text,
  map_url text,
  description text,
  sort_order integer,
  is_primary boolean,
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
  v_existing            public.project_events%ROWTYPE;
  v_result              public.project_events%ROWTYPE;
  v_changed             boolean;
  v_operation           text;
  v_constraint_name     text;
BEGIN
  -- A. Caller.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PE001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PE001';
  END IF;

  IF public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PE001';
  END IF;

  -- B. Lock the target Project row FOR UPDATE first.
  SELECT p.event_type INTO v_project_event_type
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'PE002';
  END IF;

  -- C. Defense-in-depth only — see header PE003 note.
  IF v_project_event_type <> 'WEDDING' THEN
    RAISE EXCEPTION 'Target Project is not a WEDDING project'
      USING ERRCODE = 'PE003';
  END IF;

  -- D. Lock the target Event row FOR UPDATE, scoped to this Project in the
  -- same statement (header CONCURRENCY / PE004 note).
  SELECT pe.* INTO v_existing
  FROM public.project_events AS pe
  WHERE pe.id = p_event_id
    AND pe.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found'
      USING ERRCODE = 'PE004';
  END IF;

  -- E. NULL-safe row-constructor comparison across all 11 editable columns
  -- decides changed vs. no-op (task §7).
  v_changed := (
    v_existing.occasion_type, v_existing.side, v_existing.title,
    v_existing.starts_at, v_existing.timezone, v_existing.venue_name,
    v_existing.address, v_existing.map_url, v_existing.description,
    v_existing.sort_order, v_existing.is_primary
  ) IS DISTINCT FROM (
    p_occasion_type, p_side, p_title,
    p_starts_at, p_timezone, p_venue_name,
    p_address, p_map_url, p_description,
    p_sort_order, p_is_primary
  );

  IF v_changed THEN
    BEGIN
      -- project_id is deliberately never in this SET list — an existing
      -- row's project_id can never be mutated by this function.
      -- updated_at is deliberately never set here — the existing
      -- project_events_set_updated_at BEFORE UPDATE trigger (0009) stamps
      -- it.
      UPDATE public.project_events AS pe SET
        occasion_type = p_occasion_type,
        side = p_side,
        title = p_title,
        starts_at = p_starts_at,
        timezone = p_timezone,
        venue_name = p_venue_name,
        address = p_address,
        map_url = p_map_url,
        description = p_description,
        sort_order = p_sort_order,
        is_primary = p_is_primary
      WHERE pe.id = p_event_id
        AND pe.project_id = p_project_id
      RETURNING pe.* INTO v_result;
    EXCEPTION
      WHEN unique_violation THEN
        -- Translates ONLY project_events_one_primary_per_project_side_idx
        -- (0009) into a stable, safe application error — see the matching
        -- comment in create_project_event() above. Any other
        -- unique_violation is re-raised unchanged.
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

        IF v_constraint_name = 'project_events_one_primary_per_project_side_idx' THEN
          RAISE EXCEPTION 'Another event is already marked primary for this Project/side'
            USING ERRCODE = 'PE005';
        END IF;

        RAISE;
    END;

    v_operation := 'UPDATED';

    -- F. Activity log — only when a real change happened (task §7).
    PERFORM public.log_activity(
      p_project_id,
      'STAFF',
      'CANONICAL_DATA_APPLIED',
      'Project event updated',
      jsonb_build_object('domain', 'project_events', 'operation', v_operation)
    );
  ELSE
    v_result := v_existing;
    v_operation := NULL;
  END IF;

  RETURN QUERY SELECT
    v_result.id, v_result.project_id, v_result.occasion_type, v_result.side,
    v_result.title, v_result.starts_at, v_result.timezone, v_result.venue_name,
    v_result.address, v_result.map_url, v_result.description, v_result.sort_order,
    v_result.is_primary, v_result.created_at, v_result.updated_at,
    v_changed, v_operation;
END;
$$;

COMMENT ON FUNCTION public.update_project_event(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
) IS
  'Audited canonical project_events update (Task 023) — TRUSTED BUSINESS ACTION per docs/API_CONTRACT.md §3.1. Self-authorizes identically to create_project_event; locks the target Project row then the target Event row (scoped to that Project) FOR UPDATE; no-op when submitted values match the persisted row (no UPDATE, no activity log); calls log_activity(''CANONICAL_DATA_APPLIED'') atomically on real change. See supabase/migrations/20260911041142_0022_project_events_actions.sql header for the full contract.';

REVOKE ALL ON FUNCTION public.update_project_event(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_project_event(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
) FROM anon;
REVOKE ALL ON FUNCTION public.update_project_event(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
) FROM authenticated;
REVOKE ALL ON FUNCTION public.update_project_event(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.update_project_event(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
) TO authenticated;

-- ---------------------------------------------------------------------

CREATE FUNCTION public.delete_project_event(
  p_project_id uuid,
  p_event_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- A. Caller.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PE001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PE001';
  END IF;

  IF public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'PE001';
  END IF;

  -- B. Lock the target Project row FOR UPDATE first. No PE003 event_type
  -- check here — delete writes no wedding-occasion-shaped data (header
  -- ERROR CONTRACT note).
  PERFORM 1
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'PE002';
  END IF;

  -- C. Lock the target Event row FOR UPDATE, scoped to this Project in the
  -- same statement (header CONCURRENCY / PE004 note).
  PERFORM 1
  FROM public.project_events AS pe
  WHERE pe.id = p_event_id
    AND pe.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found'
      USING ERRCODE = 'PE004';
  END IF;

  -- D. Delete — always meaningful, always audited (task §7).
  DELETE FROM public.project_events AS pe
  WHERE pe.id = p_event_id
    AND pe.project_id = p_project_id;

  -- E. Activity log — atomic with the delete above.
  PERFORM public.log_activity(
    p_project_id,
    'STAFF',
    'CANONICAL_DATA_APPLIED',
    'Project event deleted',
    jsonb_build_object('domain', 'project_events', 'operation', 'DELETED')
  );
END;
$$;

COMMENT ON FUNCTION public.delete_project_event(uuid, uuid) IS
  'Audited canonical project_events delete (Task 023) — TRUSTED BUSINESS ACTION per docs/API_CONTRACT.md §3.1. Self-authorizes identically to create_project_event/update_project_event; locks the target Project row then the target Event row (scoped to that Project) FOR UPDATE; deletion is always meaningful — always calls log_activity(''CANONICAL_DATA_APPLIED'') atomically. See supabase/migrations/20260911041142_0022_project_events_actions.sql header for the full contract.';

REVOKE ALL ON FUNCTION public.delete_project_event(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_project_event(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_project_event(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.delete_project_event(uuid, uuid) FROM service_role;

GRANT EXECUTE ON FUNCTION public.delete_project_event(uuid, uuid) TO authenticated;

-- No direct GRANT EXECUTE on public.log_activity() is added anywhere in this
-- migration — it remains reachable only from inside this and other existing
-- SECURITY DEFINER business-action functions (0020's own REVOKE block is
-- untouched and unaffected by this migration).

-- ---------------------------------------------------------------------
-- TABLE PRIVILEGE TIGHTENING (task §8)
-- ---------------------------------------------------------------------
-- Enforces docs/API_CONTRACT.md §3.1: project_events create/update/delete
-- must be the audited business actions above, never a plain RLS write.
-- Migration 0009 granted `authenticated` SELECT, INSERT, UPDATE, DELETE on
-- project_events (RLS-scoped to is_staff()). That INSERT/UPDATE/DELETE
-- grant predates these business actions and, left in place, would let any
-- staff JWT bypass them entirely via a direct PostgREST
-- `.from("project_events").insert/update/delete(...)` call — silently
-- skipping the no-op/create/update/delete semantics, the target-Project/
-- target-Event/caller-profile locking, and CANONICAL_DATA_APPLIED activity
-- logging this migration exists to guarantee. This migration does not touch
-- project_events' table shape, RLS policies, or SELECT privilege —
-- `authenticated` SELECT remains exactly as migration 0009 granted it. It
-- revokes only the INSERT/UPDATE/DELETE table privileges that made a direct
-- bypass possible:
REVOKE INSERT, UPDATE, DELETE ON TABLE public.project_events FROM authenticated;

-- The project_events_insert_staff / project_events_update_staff /
-- project_events_delete_staff RLS policies (migration 0009) are
-- deliberately left in place, unmodified — this is a privilege change, not
-- an RLS/table-shape change. Without the underlying INSERT/UPDATE/DELETE
-- table privilege, those policies have nothing left to authorize: Postgres
-- checks table-level privilege before RLS is ever consulted, so
-- INSERT/UPDATE/DELETE is rejected at the privilege check, regardless of
-- policy content. `anon` and `service_role` already carry no
-- INSERT/UPDATE/DELETE (or any) privilege on project_events from migration
-- 0009 (`REVOKE ALL ... FROM anon/service_role`, never re-granted) — this
-- migration does not grant either role any write access here, and there is
-- nothing further to revoke from them.
