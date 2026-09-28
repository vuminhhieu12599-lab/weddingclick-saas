-- WeddingClick V2 — Feature Migration 0027 (Invitation Rendering Foundation,
-- checkpoint RF-L01)
-- project_events.lunar_date_display + redefined create_project_event() /
-- update_project_event() carrying that one new column.
--
-- FROZEN CONTRACT (docs/DECISIONS.md RF6 / RF17 "RF-L01 scope",
-- docs/PHYSICAL_DATABASE_PLAN.md §2.8 "Planned additive column"):
--   - lunar date is manually entered display text owned by exactly one
--     project_events row; WeddingClick never calculates a lunar date;
--   - canonical column: project_events.lunar_date_display TEXT NULL, no
--     default;
--   - NO automatic backfill from wedding_details.lunar_date_display, under
--     any condition — every existing project_events row keeps
--     lunar_date_display = NULL after this migration; staff enter the
--     correct per-event text through the Project Events workflow (RF-L03);
--   - wedding_details.lunar_date_display (0008) is LEGACY / DEPRECATED for
--     the production V2 renderer and is NOT touched, read, copied, or
--     dropped by this migration.
--
-- This is the one explicitly approved exception to the frozen table shape
-- (docs/DECISIONS.md RF17 "Frozen-table-shape clarification"): a single
-- additive, nullable, non-destructive column. No existing column,
-- CHECK constraint, FK, index, trigger, RLS policy, or table privilege on
-- project_events is changed. The existing table-level `authenticated`
-- SELECT grant (0009) and project_events_select_staff RLS policy cover the
-- new column exactly as they cover every other column; the 0022
-- INSERT/UPDATE/DELETE privilege revocation stays in force, so the two
-- redefined business actions below remain the only write path.
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL / apply migration. Independent review happens
-- before RF-L02 applies it.
--
-- ---------------------------------------------------------------------
-- FUNCTION REDEFINITION — DROP exact old signature, CREATE new signature
-- ---------------------------------------------------------------------
-- PostgreSQL identifies a function by name + input argument types, and
-- CREATE OR REPLACE cannot change a parameter list or RETURNS TABLE shape.
-- Each of the two functions is therefore DROPped by its exact 0022
-- signature and CREATEd again with one extra, REQUIRED (no DEFAULT)
-- p_lunar_date_display text parameter. The DROP deliberately has no
-- IF EXISTS: if the deployed signature ever differs from 0022, the
-- migration fails loudly instead of silently leaving the old overload
-- callable next to the new one. After this migration exactly one
-- create_project_event and one update_project_event exist.
--
-- COMMENT ON FUNCTION and every REVOKE/GRANT are attached to a function's
-- identity and do not survive DROP, so the exact 0022 privilege pattern is
-- re-applied below to the new signatures: REVOKE ALL from PUBLIC, anon,
-- authenticated, service_role; GRANT EXECUTE to authenticated only.
--
-- delete_project_event(uuid, uuid) (0022) RETURNS void, takes no event
-- column values, and never exposes the row shape — it is NOT redefined,
-- and its body, comment, and privileges are untouched here.
--
-- ---------------------------------------------------------------------
-- BEHAVIOR PRESERVED FROM 0022 (see that migration's header for the full
-- contract; not re-derived here)
-- ---------------------------------------------------------------------
-- Unchanged, statement for statement: SECURITY DEFINER; SET search_path =
-- ''; fully schema-qualified references; caller authorization (auth.uid()
-- non-null, lock own profiles row FOR UPDATE, public.is_staff() IS TRUE
-- while that lock is held -> else PE001); target Project row locked FOR
-- UPDATE first (PE002 not found, PE003 non-WEDDING defense-in-depth);
-- update locks the target Event row FOR UPDATE scoped by id AND project_id
-- (PE004); PE005 translation of ONLY the
-- project_events_one_primary_per_project_side_idx unique_violation, every
-- other unique_violation re-raised by bare RAISE; atomic
-- log_activity('CANONICAL_DATA_APPLIED') with the same actor, summary, and
-- details payload; update's no-op rule (changed=false, operation=NULL, no
-- UPDATE, no activity row); updated_at stamped only by the existing
-- project_events_set_updated_at trigger; project_id never in the UPDATE
-- SET list.
--
-- The ONLY behavioral differences from 0022:
--   1. both functions accept p_lunar_date_display (nullable value, required
--      parameter) — the full-resource input contract grows from 11 to 12
--      editable columns;
--   2. create_project_event INSERTs it; update_project_event SETs it;
--   3. both RETURN it;
--   4. update_project_event includes it in the NULL-safe row-constructor
--      IS DISTINCT FROM comparison, so a lunar-only edit is a real change
--      (changed=true, operation='UPDATED', CANONICAL_DATA_APPLIED logged).
-- Like venue_name/address/description, the value is stored exactly as
-- submitted; request-shape/text validation stays in the application layer
-- (RF-L03, validate-project-event-input.ts). No new SQL-level CHECK, enum,
-- trigger, FK, generated expression, or calculation is added.
--
-- ---------------------------------------------------------------------
-- COLUMN ORDER
-- ---------------------------------------------------------------------
-- ADD COLUMN appends lunar_date_display after updated_at in the physical
-- table. Both functions follow that physical order: p_lunar_date_display is
-- the last parameter (after p_is_primary), and lunar_date_display is
-- returned immediately after updated_at — for update_project_event,
-- before the trailing changed/operation columns. Every RETURN QUERY
-- projection lists columns explicitly in exactly the declared order.
--
-- ---------------------------------------------------------------------
-- APPLICATION COMPATIBILITY (RF-L02 / RF-L03)
-- ---------------------------------------------------------------------
-- Once applied, the pre-RF-L03 application code calls these RPCs without
-- p_lunar_date_display and PostgREST will find no matching function, so
-- Project Events create/update are incompatible until RF-L03 ships. No
-- legacy overload is kept to hide this (the frozen contract does not
-- authorize one). Production must not receive this migration without the
-- matching RF-L03 application code.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. SCHEMA — one additive, nullable column. No DEFAULT, no backfill.
-- ---------------------------------------------------------------------

ALTER TABLE public.project_events
  ADD COLUMN lunar_date_display TEXT;

COMMENT ON COLUMN public.project_events.lunar_date_display IS
  'Manually entered lunar-date display text owned by this one event; never calculated, never backfilled from wedding_details.lunar_date_display. NULL means no lunar line. See docs/DECISIONS.md RF6 and docs/PHYSICAL_DATABASE_PLAN.md §2.8.';

-- ---------------------------------------------------------------------
-- 2. create_project_event — drop exact 0022 signature, create new one.
-- ---------------------------------------------------------------------

DROP FUNCTION public.create_project_event(
  uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
);

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
  p_is_primary boolean,
  p_lunar_date_display text
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
  lunar_date_display text
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
  -- A. Caller — see 0022 header SECURITY MODEL / 0021's AUTHORIZATION
  -- STABILITY.
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

  -- B. Lock the target Project row FOR UPDATE first (0022 header
  -- CONCURRENCY).
  SELECT p.event_type INTO v_project_event_type
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'PE002';
  END IF;

  -- C. Defense-in-depth only — see 0022 header PE003 note. Unreachable
  -- under the current projects.event_type CHECK ('WEDDING' is the only
  -- value).
  IF v_project_event_type <> 'WEDDING' THEN
    RAISE EXCEPTION 'Target Project is not a WEDDING project'
      USING ERRCODE = 'PE003';
  END IF;

  -- D. Insert. Always a real change — no no-op concept for create.
  BEGIN
    INSERT INTO public.project_events (
      project_id, occasion_type, side, title, starts_at, timezone,
      venue_name, address, map_url, description, sort_order, is_primary,
      lunar_date_display
    ) VALUES (
      p_project_id, p_occasion_type, p_side, p_title, p_starts_at, p_timezone,
      p_venue_name, p_address, p_map_url, p_description, p_sort_order, p_is_primary,
      p_lunar_date_display
    )
    RETURNING * INTO v_result;
  EXCEPTION
    WHEN unique_violation THEN
      -- Translates ONLY project_events_one_primary_per_project_side_idx
      -- (0009) into a stable, safe application error rather than
      -- forwarding the raw index name/Postgres message. Any OTHER
      -- unique_violation on this table is re-raised unchanged so it falls
      -- through to the generic unrecognized-SQLSTATE -> HTTP 500 path
      -- (0022 header ERROR CONTRACT).
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

      IF v_constraint_name = 'project_events_one_primary_per_project_side_idx' THEN
        RAISE EXCEPTION 'Another event is already marked primary for this Project/side'
          USING ERRCODE = 'PE005';
      END IF;

      RAISE;
  END;

  -- E. Activity log — atomic with the insert above.
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
    v_result.is_primary, v_result.created_at, v_result.updated_at,
    v_result.lunar_date_display;
END;
$$;

COMMENT ON FUNCTION public.create_project_event(
  uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean, text
) IS
  'Audited canonical project_events create (Task 023; redefined by RF-L01 to carry lunar_date_display) — TRUSTED BUSINESS ACTION per docs/API_CONTRACT.md §3.1. Self-authorizes by locking the caller''s own profiles row FOR UPDATE then requiring public.is_staff() IS TRUE (mirrors save_wedding_details, 0021); locks the target Project row FOR UPDATE; always calls log_activity(''CANONICAL_DATA_APPLIED'') atomically. See supabase/migrations/20260911041142_0022_project_events_actions.sql and 20260911041147_0027_project_events_lunar_date_display.sql headers for the full contract.';

REVOKE ALL ON FUNCTION public.create_project_event(
  uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_project_event(
  uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean, text
) FROM anon;
REVOKE ALL ON FUNCTION public.create_project_event(
  uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_project_event(
  uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean, text
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.create_project_event(
  uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean, text
) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. update_project_event — drop exact 0022 signature, create new one.
-- ---------------------------------------------------------------------

DROP FUNCTION public.update_project_event(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean
);

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
  p_is_primary boolean,
  p_lunar_date_display text
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
  lunar_date_display text,
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

  -- C. Defense-in-depth only — see 0022 header PE003 note.
  IF v_project_event_type <> 'WEDDING' THEN
    RAISE EXCEPTION 'Target Project is not a WEDDING project'
      USING ERRCODE = 'PE003';
  END IF;

  -- D. Lock the target Event row FOR UPDATE, scoped to this Project in the
  -- same statement (0022 header CONCURRENCY / PE004 note).
  SELECT pe.* INTO v_existing
  FROM public.project_events AS pe
  WHERE pe.id = p_event_id
    AND pe.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found'
      USING ERRCODE = 'PE004';
  END IF;

  -- E. NULL-safe row-constructor comparison across all 12 editable columns
  -- (0022's 11 plus lunar_date_display) decides changed vs. no-op, so a
  -- lunar-only edit is a real change.
  v_changed := (
    v_existing.occasion_type, v_existing.side, v_existing.title,
    v_existing.starts_at, v_existing.timezone, v_existing.venue_name,
    v_existing.address, v_existing.map_url, v_existing.description,
    v_existing.sort_order, v_existing.is_primary,
    v_existing.lunar_date_display
  ) IS DISTINCT FROM (
    p_occasion_type, p_side, p_title,
    p_starts_at, p_timezone, p_venue_name,
    p_address, p_map_url, p_description,
    p_sort_order, p_is_primary,
    p_lunar_date_display
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
        is_primary = p_is_primary,
        lunar_date_display = p_lunar_date_display
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

    -- F. Activity log — only when a real change happened.
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
    v_result.lunar_date_display,
    v_changed, v_operation;
END;
$$;

COMMENT ON FUNCTION public.update_project_event(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean, text
) IS
  'Audited canonical project_events update (Task 023; redefined by RF-L01 to carry lunar_date_display) — TRUSTED BUSINESS ACTION per docs/API_CONTRACT.md §3.1. Self-authorizes identically to create_project_event; locks the target Project row then the target Event row (scoped to that Project) FOR UPDATE; no-op when submitted values (including lunar_date_display) match the persisted row (no UPDATE, no activity log); calls log_activity(''CANONICAL_DATA_APPLIED'') atomically on real change. See supabase/migrations/20260911041142_0022_project_events_actions.sql and 20260911041147_0027_project_events_lunar_date_display.sql headers for the full contract.';

REVOKE ALL ON FUNCTION public.update_project_event(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_project_event(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean, text
) FROM anon;
REVOKE ALL ON FUNCTION public.update_project_event(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.update_project_event(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean, text
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.update_project_event(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text, text, integer, boolean, text
) TO authenticated;

-- delete_project_event(uuid, uuid) is intentionally not redefined (see
-- header). No GRANT EXECUTE on public.log_activity() is added — it remains
-- reachable only from inside SECURITY DEFINER business-action functions.
