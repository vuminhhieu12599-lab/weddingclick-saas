-- WeddingClick V2 — Bridge Migration 0006b (Task 005B)
-- create_project_with_addons(): one atomic RPC that creates exactly one
-- projects row plus zero/many project_addons rows in a single transaction,
-- rolling back the whole operation on any failure.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §1.3, §1.4, §1.7, §2.3,
-- §2.6, §6 (Money Model), §15 (RLS Matrix), §16 (Migration Order);
-- docs/SECURITY.md §5.1, §5.3, §6.
--
-- WHY THIS MIGRATION EXISTS: Task 005 found that creating a Project plus its
-- initial add-ons cannot be made atomic through separate PostgREST
-- `.from(...).insert()` calls — each is its own transaction. This migration
-- is an additive bridge between Foundation migration 0006
-- (project_addons) and the planned domain migration 0007 (wedding_details,
-- not started by this task). It does not rename, renumber, or redefine any
-- existing or planned migration, and it does not touch wedding_details or
-- any other Week-2 object.
--
-- SECURITY MODEL — SECURITY INVOKER, not SECURITY DEFINER:
-- This function intentionally runs as the CALLING staff member, not as a
-- privileged owner. The server calls it via the existing staff-scoped
-- Supabase client (lib/server/supabase/staff-client.ts), which carries the
-- staff member's own JWT — the same client already used for every other
-- staff mutation (docs/SECURITY.md §5.3). Consequences of SECURITY INVOKER:
--   - auth.uid() inside this function resolves to the real calling staff
--     user (auth.uid() does not depend on DEFINER/INVOKER — it reads the
--     request JWT claims, which are set per-session regardless).
--   - Every table access below (SELECT/INSERT) is evaluated against RLS as
--     that calling role, exactly as if the caller had issued the statements
--     directly. is_staff() and every table's existing RLS policies
--     (projects_insert_staff, project_addons_insert_staff, etc.) remain the
--     real, live enforcement — not bypassed, not decorative.
--   - No BYPASSRLS owner trick is needed or used here (contrast with
--     is_staff()/is_admin()/generate_project_code(), which are
--     SECURITY DEFINER for structural reasons unrelated to this function).
-- SET search_path = '' is still applied, exactly as for every other
-- function in this plan (§1.3 hardening pattern) — every reference below is
-- fully schema-qualified (public.projects, public.customers, ...); built-in
-- types (uuid, text, timestamptz, boolean) resolve regardless because
-- pg_catalog is always implicitly searched even with an empty search_path.
-- This is defense-in-depth against a hijacked search_path within the
-- calling session, not a requirement specific to SECURITY INVOKER.
--
-- GRANTS: EXECUTE granted to `authenticated` only. No grant to `anon`, no
-- grant to `service_role` — this task's explicit instruction is that
-- service_role must never be used anywhere in this migration, and there is
-- no customer/guest-token flow that needs to call this function.
--
-- ERROR CONTRACT (see also docs sync note at the end of this file): expected
-- business-validation failures raise a custom, stable SQLSTATE from the
-- WCxxx range (not a standard PostgreSQL class, and not shared with any
-- reserved SQLSTATE), so application code can classify failures by a fixed
-- code rather than by matching free-form PostgreSQL error text:
--   WC001  customer not found
--   WC002  package not found
--   WC003  package inactive
--   WC004  duplicate addon code in request
--   WC005  addon not found
--   WC006  addon inactive
--   WC007  assigned staff invalid/inactive
--   WC008  caller is not an active WeddingClick STAFF/ADMIN. Raised at TWO
--          points (REVISION 2): once as an early fail-fast guard before any
--          other work, and again immediately after the public.profiles
--          SHARE lock is acquired — the second check is the authoritative
--          one, closing a TOCTOU window where the caller's own profile
--          could be deactivated between the first check and the profiles
--          lock (see the second check's inline comment for why the lock
--          ordering makes that check race-free). Defense in depth overall —
--          lib/server/auth already rejects a non-staff caller before this
--          RPC is ever invoked in the normal application path; this exists
--          so a direct RPC call, or a staff deactivation racing the
--          request, still fails with a stable code instead of a raw
--          RLS-violation error.
-- Every RAISE EXCEPTION message below is a fixed, safe string authored by
-- this migration — never a forwarded raw Postgres/Supabase error. Any
-- OTHER database failure (e.g. a genuine infrastructure error, or the
-- customer-hard-delete FK edge case discussed below) is left unhandled by
-- this function and propagates as a normal Postgres error with its own
-- native SQLSTATE; application code maps any SQLSTATE it does not
-- recognize to a generic HTTP 500 and never forwards the raw message.
--
-- CONCURRENCY / LOCKING STRATEGY — REVISION 1, replacing a rejected design:
--
-- REJECTED: SELECT ... FOR UPDATE on service_packages/service_addons/profiles.
-- External review (Task 005B Revision 1) correctly found this incompatible
-- with SECURITY INVOKER under the existing RLS design. PostgreSQL applies a
-- table's UPDATE policy (not just its SELECT policy) to any row-locking
-- SELECT (FOR UPDATE/NO KEY UPDATE/SHARE/KEY SHARE) — a row is only
-- returned by such a query if it passes BOTH the SELECT policy's USING
-- clause AND the UPDATE policy's USING clause. service_packages/
-- service_addons restrict UPDATE to is_admin() (migration 0003); profiles
-- restricts UPDATE to "own row AND is_staff()" OR is_admin() (migration
-- 0002). An ordinary, non-admin STAFF caller therefore satisfies the SELECT
-- policy (is_staff()) on a real, active, catalog row but FAILS the UPDATE
-- policy on that same row, so FOR UPDATE would silently return zero rows —
-- a valid package/add-on would appear NOT FOUND, and a STAFF member
-- assigning a Project to a DIFFERENT active staff profile would find that
-- profile row NOT FOUND too (self-row-or-admin-only UPDATE policy). Neither
-- SECURITY DEFINER, broadening the catalog/profiles UPDATE policies, nor
-- disabling RLS is an acceptable fix (all explicitly excluded — this would
-- either re-introduce a privilege-escalation surface or grant STAFF a
-- mutation authority they must not have). Switching to FOR SHARE/FOR KEY
-- SHARE/FOR NO KEY UPDATE does not avoid this — every row-locking SELECT
-- variant is subject to the same UPDATE-policy check, only the resulting
-- lock strength on the row differs, not which rows are visible.
--
-- CHOSEN: whole-table SHARE-mode locks (LOCK TABLE ... IN SHARE MODE),
-- taken on service_packages, service_addons, and profiles, unconditionally,
-- in that fixed order, as the very first statements after the caller check
-- — replacing every per-row FOR UPDATE below with a plain, unlocked SELECT.
--   - LOCK TABLE's privilege check is table-level GRANT-based only; it does
--     NOT consult row-security policies at all (RLS governs row visibility
--     for SELECT/INSERT/UPDATE/DELETE, not whole-table lock acquisition).
--     SHARE mode requires UPDATE, DELETE, or TRUNCATE privilege on the
--     table — `authenticated` already holds table-level UPDATE on all
--     three tables (migration 0002: `GRANT SELECT, UPDATE ... TO
--     authenticated` on profiles; migration 0003: `GRANT SELECT, INSERT,
--     UPDATE ... TO authenticated` on service_packages/service_addons).
--     No new GRANT is added by this migration — this works purely because
--     of privileges Foundation already granted for STAFF's own
--     RLS-restricted self-service updates; nothing is broadened.
--   - SHARE conflicts with ROW EXCLUSIVE (the mode any ordinary INSERT/
--     UPDATE/DELETE statement takes, including an admin's catalog price
--     edit or any profile UPDATE), so holding SHARE here blocks such a
--     write from starting until this transaction commits/rolls back, and
--     a write already in progress blocks our LOCK TABLE call until it
--     finishes — the read-then-persist window can never straddle a
--     concurrent write to these tables. SHARE does **not** conflict with
--     itself or with plain ACCESS SHARE (ordinary SELECT), so: (a) any
--     number of concurrent create_project_with_addons calls proceed fully
--     in parallel with each other (no serialization between unrelated
--     Project creations), and (b) ordinary reads elsewhere are never
--     blocked. This is the least-conflicting mode that still blocks every
--     concurrent write to these tables — the actual property required.
--   - Deterministic ordering: the three LOCK TABLE statements always fire
--     in the same fixed order (service_packages, service_addons, profiles)
--     on every invocation, unconditionally, regardless of whether add-ons
--     or an assigned staff id were even supplied. This function is the
--     only code path that ever holds table-level locks on more than one of
--     these tables at once; every other writer (an admin catalog edit, a
--     profile self-update) only ever locks one table at a time via an
--     ordinary single-statement UPDATE, so no wait cycle across these
--     three tables can form regardless of acquisition order — the fixed
--     order here is a simplicity/auditability choice (one unconditional
--     3-statement block, no branches to reason about), not a strict
--     deadlock-avoidance necessity, and is documented as such rather than
--     overstating the risk it closes.
--   - Tradeoff accepted for V1: this is coarser than the (broken) per-row
--     design would have been — it blocks an admin catalog/profile write
--     against ANY concurrently-running Project creation touching that
--     table, not just one that happens to reference the same row, and it
--     is taken even when a given call doesn't end up needing, e.g., the
--     profiles lock (no assigned staff supplied). Given V1's low write
--     volume on these three tables (rare admin catalog edits, occasional
--     profile self-updates, short-lived Project-creation transactions),
--     this is an acceptable, explicitly-reviewed tradeoff — see task
--     instructions §"table-level locks" — in exchange for a strategy that
--     is provably correct under the existing RLS design without changing
--     any privilege, policy, or security posture.
--   - Customer existence is checked with a plain (non-locking) EXISTS
--     query, then relied upon again structurally by
--     `projects.customer_id REFERENCES customers(id) ON DELETE RESTRICT`
--     at INSERT time. Customer hard-delete is not a normal application
--     path (§Q5 — exceptional, manual, service_role-only), so no
--     application-level lock is taken on the customers row: the FK
--     constraint itself is the correct, sufficient guarantee — Postgres
--     acquires its own internal key-share lock on the referenced row as
--     part of enforcing the FK at INSERT time, and if an exceptional
--     concurrent hard-delete has already removed the row, the INSERT fails
--     with a standard foreign_key_violation (23503) rather than silently
--     creating an orphaned Project. That is an unmapped, unexpected
--     database error from this function's point of view and correctly
--     surfaces to application code as a generic HTTP 500, which is the
--     appropriate response to an out-of-band exceptional procedure racing
--     a normal staff request.
--
-- TRANSACTION FLOW: PostgREST/Supabase's `rpc()` call executes this
-- function inside exactly one database transaction. Every RAISE EXCEPTION
-- below aborts that entire transaction — no exception is caught/swallowed
-- inside this function — so a mid-way failure (e.g. the second of three
-- add-ons turns out to be inactive) rolls back the already-inserted
-- projects row, any already-inserted project_addons rows, and releases the
-- three table locks, leaving no partially-created order and no held locks.
-- `project_code_seq`/`project_code` gaps from a rolled-back attempt are
-- expected and explicitly accepted per §1.7.
--
-- This migration does not create, alter, or touch: wedding_details, any
-- other Week-2/0007+ table, any V1 object, or any RLS policy on an existing
-- table. It creates exactly one new function.

CREATE FUNCTION public.create_project_with_addons(
  p_customer_id uuid,
  p_package_code text,
  p_addon_codes text[],
  p_assigned_staff_id uuid DEFAULT NULL,
  p_deadline_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_project_id       uuid;
  v_customer_exists  boolean;
  v_package_id       uuid;
  v_package_code     text;
  v_package_name     text;
  v_package_price    integer;
  v_package_active   boolean;
  v_addon_codes      text[];
  v_addon_code       text;
  v_addon_id         uuid;
  v_addon_name       text;
  v_addon_price      integer;
  v_addon_active     boolean;
  v_staff_active     boolean;
BEGIN
  -- ---------------------------------------------------------------------
  -- A. Caller — early fail-fast guard. Must be an active WeddingClick
  -- STAFF/ADMIN right now, independent of whatever the calling application
  -- layer already checked before invoking this RPC (§5 of the task spec).
  -- is_staff() itself resolves auth.uid() internally and returns false for
  -- no auth.uid() at all, so a single call covers both conditions. This
  -- first check exists purely to reject an already-unauthorized caller
  -- before doing any other work; it is NOT by itself sufficient — see the
  -- second check below (REVISION 2) for why.
  -- ---------------------------------------------------------------------
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'WC008';
  END IF;

  -- ---------------------------------------------------------------------
  -- Whole-table SHARE-mode locks — fixed order, unconditional. See the
  -- header's CONCURRENCY / LOCKING STRATEGY (REVISION 1) for the full
  -- analysis of why a per-row SELECT ... FOR UPDATE is incompatible with
  -- RLS for an ordinary STAFF caller, and why SHARE mode is safe and
  -- sufficient here. Held until this transaction commits or rolls back.
  -- ---------------------------------------------------------------------
  LOCK TABLE public.service_packages IN SHARE MODE;
  LOCK TABLE public.service_addons IN SHARE MODE;
  LOCK TABLE public.profiles IN SHARE MODE;

  -- ---------------------------------------------------------------------
  -- A (continued) — REVISION 2: second, authoritative is_staff() check,
  -- taken only after the public.profiles SHARE lock above has actually
  -- been granted. Closes a caller-status TOCTOU race the first check alone
  -- cannot: the caller could pass the early check at the top of this
  -- function and then have their own profile deactivated (by an admin's
  -- concurrent UPDATE) before this point. Any such concurrent profiles
  -- UPDATE takes an ordinary ROW EXCLUSIVE table lock, which conflicts
  -- with the SHARE lock above — so either that UPDATE has already fully
  -- committed before our LOCK TABLE call above returns (in which case this
  -- second is_staff() call sees the fresh, post-deactivation state and
  -- correctly rejects), or it cannot start until this transaction commits
  -- or rolls back (in which case no such deactivation can happen between
  -- this point and the end of this function at all). Either way, this
  -- check is guaranteed to observe the true, up-to-date caller state for
  -- the remainder of this transaction. The first check above is kept
  -- unchanged as a fail-fast guard — it just does not, by itself, close
  -- this window.
  -- ---------------------------------------------------------------------
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'WC008';
  END IF;

  -- ---------------------------------------------------------------------
  -- B. Customer — must exist. See header note: no lock taken here, the
  -- FK constraint on the INSERT below is the authoritative guarantee.
  -- ---------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id
  ) INTO v_customer_exists;

  IF NOT v_customer_exists THEN
    RAISE EXCEPTION 'Customer not found'
      USING ERRCODE = 'WC001';
  END IF;

  -- ---------------------------------------------------------------------
  -- C. Package — resolve the current catalog row. Current id/code/name/
  -- price become the Project's snapshot columns. No per-row lock needed:
  -- the SHARE-mode table lock taken above already blocks any concurrent
  -- UPDATE to this table for the rest of this transaction.
  -- ---------------------------------------------------------------------
  SELECT id, code, name, price_vnd, is_active
  INTO v_package_id, v_package_code, v_package_name, v_package_price, v_package_active
  FROM public.service_packages
  WHERE code = p_package_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not found'
      USING ERRCODE = 'WC002';
  END IF;

  IF NOT v_package_active THEN
    RAISE EXCEPTION 'Package is not currently active'
      USING ERRCODE = 'WC003';
  END IF;

  -- ---------------------------------------------------------------------
  -- E. Assigned staff — nullable. If supplied, must resolve to an active
  -- WeddingClick profile. No per-row lock needed, for the same reason as
  -- the package check above. Assignment is a responsibility label only,
  -- never an RLS scope change (§R-Q1).
  -- ---------------------------------------------------------------------
  IF p_assigned_staff_id IS NOT NULL THEN
    SELECT is_active INTO v_staff_active
    FROM public.profiles
    WHERE id = p_assigned_staff_id;

    IF NOT FOUND OR NOT v_staff_active THEN
      RAISE EXCEPTION 'assignedStaffId does not resolve to an active WeddingClick staff profile'
        USING ERRCODE = 'WC007';
    END IF;
  END IF;

  -- ---------------------------------------------------------------------
  -- D. Add-ons — reject duplicate requested codes (never silently dedupe;
  -- see lib/server/projects/resolve-addons.ts for the identical app-layer
  -- rule this restates authoritatively). Empty/NULL input is valid (no
  -- add-ons). The add-on loop below iterates in a fixed ascending-code
  -- order for deterministic, auditable behavior — no longer required for
  -- deadlock avoidance now that locking is table-level (see header), but
  -- kept for stable insert ordering of project_addons rows.
  -- ---------------------------------------------------------------------
  v_addon_codes := COALESCE(p_addon_codes, ARRAY[]::text[]);

  IF cardinality(v_addon_codes) <>
     (SELECT COUNT(DISTINCT c) FROM unnest(v_addon_codes) AS c)
  THEN
    RAISE EXCEPTION 'Duplicate addon code in request'
      USING ERRCODE = 'WC004';
  END IF;

  -- ---------------------------------------------------------------------
  -- F. Project defaults — event_type ('WEDDING'), status ('NEW'),
  -- payment_status ('UNPAID'), and project_code all come from the table's
  -- own column DEFAULTs (migration 0005); this function deliberately does
  -- not set or reproduce any of them. created_by is always auth.uid() —
  -- never a parameter, so no caller can ever supply it.
  -- ---------------------------------------------------------------------
  INSERT INTO public.projects (
    customer_id,
    service_package_id,
    package_code_snapshot,
    package_name_snapshot,
    base_price_vnd,
    total_price_vnd,
    assigned_staff_id,
    deadline_at,
    created_by
  ) VALUES (
    p_customer_id,
    v_package_id,
    v_package_code,
    v_package_name,
    v_package_price,
    v_package_price, -- addon_total_vnd defaults to 0, so total = base + 0
    p_assigned_staff_id,
    p_deadline_at,
    auth.uid()
  )
  RETURNING id INTO v_project_id;

  -- ---------------------------------------------------------------------
  -- Add-ons: resolve and insert each in fixed ascending-code order. No
  -- per-row lock needed — the SHARE-mode table lock taken above already
  -- covers service_addons for the rest of this transaction. Each INSERT
  -- fires migration 0006's existing guard_project_addon_commercial_freeze()
  -- (BEFORE) and sync_project_commercial_totals() (AFTER) triggers
  -- unmodified — this function never recomputes addon_total_vnd/
  -- total_price_vnd itself. Error messages are fixed, safe strings —
  -- never interpolate the requested addon code into a raised message;
  -- the caller's own request already carries that value, and application
  -- code (lib/server/projects/create-project-error-codes.ts) owns the
  -- external-facing message, classified by SQLSTATE only.
  -- ---------------------------------------------------------------------
  FOR v_addon_code IN
    SELECT DISTINCT c FROM unnest(v_addon_codes) AS c ORDER BY 1
  LOOP
    SELECT id, name, price_vnd, is_active
    INTO v_addon_id, v_addon_name, v_addon_price, v_addon_active
    FROM public.service_addons
    WHERE code = v_addon_code;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Add-on not found'
        USING ERRCODE = 'WC005';
    END IF;

    IF NOT v_addon_active THEN
      RAISE EXCEPTION 'Add-on is not currently active'
        USING ERRCODE = 'WC006';
    END IF;

    INSERT INTO public.project_addons (
      project_id,
      service_addon_id,
      addon_code_snapshot,
      addon_name_snapshot,
      price_vnd_snapshot,
      created_by
    ) VALUES (
      v_project_id,
      v_addon_id,
      v_addon_code,
      v_addon_name,
      v_addon_price,
      auth.uid()
    );
  END LOOP;

  -- ---------------------------------------------------------------------
  -- Stable return surface: just the new Project id. No secrets, no
  -- internal implementation detail.
  -- ---------------------------------------------------------------------
  RETURN v_project_id;
END;
$$;

COMMENT ON FUNCTION public.create_project_with_addons(uuid, text, text[], uuid, timestamptz) IS
  'Atomic Project + project_addons creation (Task 005B). SECURITY INVOKER — runs as the calling staff member, RLS remains live. See supabase/migrations/20260911041125_0006b_atomic_project_creation_rpc.sql header for the full error contract and locking strategy.';

-- ---------------------------------------------------------------------
-- Explicit Data API privileges: authenticated only. No anon, no
-- service_role — this task's explicit instruction is that service_role
-- must never be used anywhere in this migration.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_project_with_addons(uuid, text, text[], uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_project_with_addons(uuid, text, text[], uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.create_project_with_addons(uuid, text, text[], uuid, timestamptz) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_project_with_addons(uuid, text, text[], uuid, timestamptz) FROM service_role;

GRANT EXECUTE ON FUNCTION public.create_project_with_addons(uuid, text, text[], uuid, timestamptz) TO authenticated;
