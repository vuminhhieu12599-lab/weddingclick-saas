-- WeddingClick V2 — Feature Migration 0025 (Task 026, Authoring Phase 1)
-- issue_review_link() / rotate_access_link() / revoke_access_link(): three
-- narrowly-scoped TRUSTED BUSINESS ACTION functions for the staff-invoked
-- access-link workflow named by docs/API_CONTRACT.md §8 (Task 026 boundary:
-- "issue_review_link, rotate_access_link, revoke_access_link") and specified
-- exactly by docs/DECISIONS.md "Task 026 — Access-Link & Token Foundation"
-- (see that section for the frozen D1–D13 decision record; error-code
-- semantics are this migration's own concern, defined in the ERROR CONTRACT
-- section below).
--
-- This migration does NOT alter any frozen table shape, CHECK constraint,
-- FK, or index on public.project_access_links (migration 0014) — no CREATE
-- TABLE, no ALTER TABLE ... ADD/DROP COLUMN or CONSTRAINT anywhere in this
-- file. It creates exactly three new functions and applies least-privilege
-- hardening to public.project_access_links (D12, refined per the Task 026
-- Phase 1 independent review): the authenticated INSERT RLS policy is
-- tightened to exclude REVIEW and to require created_by = auth.uid() with
-- revoked_at/last_used_at both NULL; authenticated's INSERT table privilege
-- is narrowed from table-wide to exactly the six issuance columns
-- (project_id, link_type, token_hash, token_hint, expires_at, created_by),
-- so id/created_at/revoked_at/last_used_at can never be explicitly supplied
-- by a direct authenticated INSERT; authenticated's UPDATE table privilege
-- is narrowed to expires_at only; and service_role's UPDATE table privilege
-- is narrowed from table-wide to last_used_at only — see REVIEW INSERT RLS
-- TIGHTENING, AUTHENTICATED INSERT PRIVILEGE TIGHTENING, TABLE PRIVILEGE
-- TIGHTENING, and SERVICE_ROLE UPDATE PRIVILEGE TIGHTENING near the end of
-- this file. No new uniqueness/single-active constraint is added anywhere (D2:
-- multiple simultaneously-active links of the same (project_id, link_type)
-- remain allowed by design — issuing a new link never revokes any other
-- link, and rotation touches only the exact source row it is given).
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL / apply this migration. External review
-- happens before preflight/apply, mirroring migration 0024's own
-- "author -> independent review -> apply -> live structural verification"
-- discipline.
--
-- ---------------------------------------------------------------------
-- WHY THESE ARE BUSINESS ACTIONS, NOT PLAIN RLS WRITES
-- ---------------------------------------------------------------------
-- docs/API_CONTRACT.md §3/§6: issuing a REVIEW link, rotating a link, and
-- revoking a link each correspond to a frozen activity_logs action
-- (REVIEW_LINK_ISSUED, ACCESS_LINK_ROTATED, ACCESS_LINK_REVOKED
-- respectively). log_activity() is private (0020) — not granted EXECUTE to
-- any externally-reachable role — so it is only reachable from inside
-- another SECURITY DEFINER business-action function owned by the same
-- schema-owner role. These three functions are those functions. INTAKE/
-- PORTAL initial issuance stays a plain direct-RLS INSERT with no activity
-- event (docs/API_CONTRACT.md §7.4, unchanged by this migration) — only
-- REVIEW issuance, rotation, and revocation are business actions.
--
-- ---------------------------------------------------------------------
-- SECURITY MODEL — SECURITY DEFINER, self-authorizing (mirrors 0021/0022/
-- 0024 exactly)
-- ---------------------------------------------------------------------
-- Each function runs as the schema-owner role (BYPASSRLS), so RLS does not
-- protect it — the function protects itself, identically in all three:
--   - requires auth.uid() IS NOT NULL
--   - locks the caller's own public.profiles row FOR UPDATE (existence
--     required) — stabilizes caller authorization against a concurrent
--     deactivation/demotion mid-transaction
--   - while that lock is held, requires public.is_staff() IS TRUE — the
--     centralized, authoritative authorization helper (migration 0002),
--     never duplicated locally as a role/is_active check
--   - all three checked before any other data access; anything else raises
--     AL001
--
-- SET search_path = '' — every reference below is fully schema-qualified
-- (public.project_access_links, public.projects, public.profiles,
-- public.is_staff(), public.log_activity(), auth.uid()); built-in types
-- resolve via the always-implicit pg_catalog search path.
--
-- Because each function is SECURITY DEFINER (owner, BYPASSRLS), its own
-- INSERT/UPDATE on public.project_access_links is never subject to that
-- table's RLS policies — this is precisely what lets issue_review_link
-- create a REVIEW row even after the REVIEW INSERT RLS TIGHTENING below
-- removes REVIEW from what a plain authenticated-session INSERT may create,
-- and what lets rotate_access_link/revoke_access_link write revoked_at even
-- after the UPDATE table-privilege tightening removes authenticated's
-- ability to write that column directly. The two pre-existing guard
-- triggers (guard_access_link_identity_immutability,
-- guard_access_link_revocation_immutability — both 0014) are NOT bypassed
-- by SECURITY DEFINER/BYPASSRLS — triggers always fire regardless of RLS —
-- so they remain the authoritative, unconditional backstop for identity
-- immutability and revocation monotonicity even against these trusted
-- functions' own writes (D8: "Existing monotonic revoke trigger must remain
-- authoritative").
--
-- ---------------------------------------------------------------------
-- CONCURRENCY
-- ---------------------------------------------------------------------
-- issue_review_link locks the target Project row FOR KEY SHARE (not FOR
-- UPDATE) before inserting — the minimum lock strength that blocks a
-- concurrent DELETE of that Project (the same strength Postgres' own FK
-- reference would take at INSERT time), converting what would otherwise be
-- a raw foreign_key_violation race into a clean AL002/PROJECT_NOT_FOUND.
-- This function never reads or depends on any of the Project row's mutable
-- columns, so a stronger FOR UPDATE lock would only unnecessarily serialize
-- against unrelated concurrent Task 025 lifecycle/payment/assignment calls
-- on the same Project — deliberately avoided.
--
-- rotate_access_link and revoke_access_link each lock exactly the one
-- target public.project_access_links row FOR UPDATE, matched on BOTH
-- id = p_access_link_id AND project_id = p_project_id, before deciding
-- revoked/expired state. Two concurrent rotate/revoke calls against the
-- same source row serialize on this lock: the second waits for the first
-- to commit or roll back, then re-reads the now-committed revoked_at under
-- its own lock and correctly resolves to AL004/ACCESS_LINK_ALREADY_REVOKED
-- rather than racing to double-revoke or double-replace the same row.
-- Neither function inspects, locks, or touches any sibling
-- project_access_links row of the same (project_id, link_type) — per D2,
-- multiple concurrent issue_review_link calls for the same Project are
-- expected to both succeed independently, and rotation/revocation is
-- scoped exclusively to the one row identified by p_access_link_id.
--
-- ---------------------------------------------------------------------
-- ERROR CONTRACT — ALxxx custom SQLSTATE range (new range, distinct from
-- Task 025's PLxxx and Task 023's PExxx; defined here; enforces
-- docs/DECISIONS.md "Task 026 — Access-Link & Token Foundation")
-- ---------------------------------------------------------------------
-- AL001  CALLER_FORBIDDEN — caller is not an active WeddingClick STAFF/
--        ADMIN (all three functions) -> ApiError kind FORBIDDEN (403)
-- AL002  PROJECT_NOT_FOUND — p_project_id does not resolve to an existing
--        Project (issue_review_link only) -> ApiError kind NOT_FOUND (404)
-- AL003  ACCESS_LINK_NOT_FOUND — p_access_link_id does not resolve to an
--        existing project_access_links row belonging to p_project_id
--        (rotate_access_link, revoke_access_link) -> ApiError kind
--        NOT_FOUND (404). A wrong-project id and a genuinely nonexistent id
--        collapse to this same code/outcome — never distinguished — mirrors
--        the anti-enumeration collapsing docs/API_CONTRACT.md §4.1 applies
--        to the (separate, later-phase) customer-facing token-resolution
--        flow.
-- AL004  ACCESS_LINK_ALREADY_REVOKED — the target row's revoked_at is
--        already non-NULL (rotate_access_link, revoke_access_link) ->
--        ApiError kind CONFLICT (409); no mutation, no activity row
-- AL005  ACCESS_LINK_EXPIRED_NOT_ROTATABLE — the target row's expires_at is
--        non-NULL and <= now() (rotate_access_link only) -> ApiError kind
--        CONFLICT (409); no mutation, no activity row. Does not apply to
--        revoke_access_link — D9 explicitly allows revoking an
--        expired-but-not-revoked link.
--
-- p_token_hash is validated only by the pre-existing table CHECK
-- (octet_length(token_hash) = 32, migration 0014) — deliberately not
-- duplicated as an explicit application-level guard/ALxxx code in any of
-- the three functions below. Unlike Task 025's PL003 (p_target_status is a
-- plain text business parameter with a meaningful "malformed but
-- structurally reachable" input space), p_token_hash/p_new_token_hash are
-- produced exclusively by the Task 026 server-side crypto utility (a later
-- phase, not yet implemented) — never typed or assembled by a human or an
-- external caller — so a CHECK violation here indicates a caller-side
-- programming defect, not a real business condition, and collapsing it to
-- a generic unmapped 500 (via the ordinary, un-intercepted
-- check_violation SQLSTATE 23514) is the correct, simpler choice. The same
-- reasoning applies to the table's own UNIQUE(token_hash) constraint: a
-- collision between two independently-generated 32-byte CSPRNG values is
-- cryptographically negligible, not a reachable business flow, and is left
-- as an unmapped unique_violation.
--
-- Every RAISE EXCEPTION message below is a fixed, safe string — never a
-- forwarded raw Postgres/Supabase error. Any OTHER database failure is left
-- unhandled and propagates as a normal Postgres error with its own native
-- SQLSTATE; application code maps any SQLSTATE it does not recognize to a
-- generic HTTP 500 and never forwards the raw message.
--
-- ---------------------------------------------------------------------
-- ACTIVITY LOGGING
-- ---------------------------------------------------------------------
-- issue_review_link: REVIEW_LINK_ISSUED; metadata {access_link_id,
-- link_type} — link_type is always the literal 'REVIEW' here, included for
-- metadata-shape consistency with the other two functions rather than
-- necessity. rotate_access_link: ACCESS_LINK_ROTATED; metadata
-- {old_access_link_id, new_access_link_id, link_type}. revoke_access_link:
-- ACCESS_LINK_REVOKED; metadata {access_link_id, link_type}. No function's
-- metadata ever contains a raw token, token_hash, or token_hint (D10) — ids
-- and type strings only. No activity row is ever written on a validation
-- failure, conflict, or not-found outcome — the log_activity() call happens
-- only after the real mutation has already succeeded, in the same
-- transaction. All three of these action types (REVIEW_LINK_ISSUED,
-- ACCESS_LINK_ROTATED, ACCESS_LINK_REVOKED) already exist in the frozen
-- Activity Action Type Union (docs/API_CONTRACT.md §6) — no new action type
-- is introduced by this migration.

-- ===========================================================================
-- issue_review_link
-- ===========================================================================
CREATE FUNCTION public.issue_review_link(
  p_project_id uuid,
  p_token_hash bytea,
  p_token_hint text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  link_type text,
  token_hint text,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result public.project_access_links%ROWTYPE;
BEGIN
  -- A. Caller — active WeddingClick STAFF/ADMIN, right now (header
  -- SECURITY MODEL).
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'AL001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'AL001';
  END IF;

  IF public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'AL001';
  END IF;

  -- B. Target Project must exist. FOR KEY SHARE (header CONCURRENCY) —
  -- sufficient to block a concurrent DELETE of this Project through commit,
  -- without serializing against unrelated Task 025 lifecycle/payment/
  -- assignment FOR UPDATE holders any more than the FK itself would.
  PERFORM 1
  FROM public.projects AS p
  WHERE p.id = p_project_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'AL002';
  END IF;

  -- C. Insert exactly one new REVIEW row. Never revokes any existing
  -- REVIEW/INTAKE/PORTAL link for this Project (D2 — multiple
  -- simultaneously-active links of the same type are allowed by design).
  -- Runs as SECURITY DEFINER (BYPASSRLS), so this INSERT is not subject to
  -- the authenticated INSERT RLS policy's link_type IN ('INTAKE','PORTAL')
  -- restriction below (REVIEW INSERT RLS TIGHTENING) — this function is the
  -- sole path by which a REVIEW row may be created.
  INSERT INTO public.project_access_links (
    project_id, link_type, token_hash, token_hint, expires_at, created_by
  ) VALUES (
    p_project_id, 'REVIEW', p_token_hash, p_token_hint, p_expires_at, auth.uid()
  )
  RETURNING * INTO v_result;

  -- D. Activity — exactly one REVIEW_LINK_ISSUED row. Metadata carries only
  -- the new row's id and link_type — never token_hash/token_hint/raw token
  -- (header ACTIVITY LOGGING, D10).
  PERFORM public.log_activity(
    p_project_id,
    'STAFF',
    'REVIEW_LINK_ISSUED',
    'Review access link issued',
    jsonb_build_object(
      'access_link_id', v_result.id,
      'link_type', v_result.link_type
    )
  );

  -- Never returns token_hash — the caller already holds it (it generated
  -- the hash before calling), and no later application code needs it back.
  RETURN QUERY SELECT
    v_result.id, v_result.project_id, v_result.link_type, v_result.token_hint,
    v_result.expires_at, v_result.created_by, v_result.created_at;
END;
$$;

-- ---------------------------------------------------------------------
-- Explicit Data API privileges — locked down immediately after creation
-- (Task 022 statement-order hardening pattern). PUBLIC: no execute. anon:
-- no execute. authenticated: execute (self-authorizes internally, see
-- header SECURITY MODEL). service_role: no execute (D11 — staff mutation
-- actions do not depend on service_role, consistent with 0021/0022/0024's
-- SECURITY DEFINER pattern). No overloads.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.issue_review_link(uuid, bytea, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_review_link(uuid, bytea, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.issue_review_link(uuid, bytea, text, timestamptz) FROM authenticated;
REVOKE ALL ON FUNCTION public.issue_review_link(uuid, bytea, text, timestamptz) FROM service_role;

GRANT EXECUTE ON FUNCTION public.issue_review_link(uuid, bytea, text, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.issue_review_link(uuid, bytea, text, timestamptz) IS
  'Audited REVIEW access-link issuance (Task 026) — TRUSTED BUSINESS ACTION. Self-authorizes by locking the caller''s own profiles row FOR UPDATE then requiring public.is_staff() IS TRUE (mirrors transition_project_status, 0024); locks the target Project row FOR KEY SHARE; inserts exactly one new REVIEW project_access_links row without touching any sibling link (D2); calls log_activity(''REVIEW_LINK_ISSUED'') atomically on success. Sole path by which a REVIEW row may be created — see REVIEW INSERT RLS TIGHTENING below. See this migration''s header for the full contract.';

-- ===========================================================================
-- rotate_access_link
-- ===========================================================================
CREATE FUNCTION public.rotate_access_link(
  p_project_id uuid,
  p_access_link_id uuid,
  p_new_token_hash bytea,
  p_new_token_hint text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  link_type text,
  token_hint text,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source_link_type  text;
  v_source_expires_at timestamptz;
  v_source_revoked_at timestamptz;
  v_result             public.project_access_links%ROWTYPE;
BEGIN
  -- A. Caller — identical pattern to issue_review_link.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'AL001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'AL001';
  END IF;

  IF public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'AL001';
  END IF;

  -- B. Lock the exact source row FOR UPDATE first (header CONCURRENCY),
  -- matched on BOTH id and project_id — a wrong-project id and a genuinely
  -- nonexistent id collapse to the same AL003 outcome (D8, D2 — no
  -- distinguishing disclosure).
  SELECT p.link_type, p.expires_at, p.revoked_at
    INTO v_source_link_type, v_source_expires_at, v_source_revoked_at
  FROM public.project_access_links AS p
  WHERE p.id = p_access_link_id
    AND p.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access link not found'
      USING ERRCODE = 'AL003';
  END IF;

  -- C. Already revoked — checked before expiry (D8: "Already revoked OR
  -- expired source: CONFLICT / 409" — this function does not distinguish
  -- which condition triggered the conflict beyond the two distinct codes
  -- below). No mutation, no activity row.
  IF v_source_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Access link is already revoked'
      USING ERRCODE = 'AL004';
  END IF;

  -- D. Expired source is not rotatable (D8) — revocation alone (via
  -- revoke_access_link) remains available for an expired link; rotation
  -- specifically is refused. No mutation, no activity row.
  IF v_source_expires_at IS NOT NULL AND v_source_expires_at <= now() THEN
    RAISE EXCEPTION 'Access link is expired and cannot be rotated'
      USING ERRCODE = 'AL005';
  END IF;

  -- E. Revoke exactly the source row. The row lock taken at B is held
  -- continuously through this UPDATE (same transaction), so no re-check of
  -- revoked_at is needed here — nothing else could have changed it since C
  -- was evaluated. guard_access_link_revocation_immutability (0014) remains
  -- the authoritative backstop regardless (header SECURITY MODEL, D8).
  UPDATE public.project_access_links AS p SET
    revoked_at = now()
  WHERE p.id = p_access_link_id;

  -- F. Insert exactly one replacement row, preserving project_id, link_type,
  -- and expires_at from the source (D8); new token_hash/token_hint only.
  -- No sibling link of the same type is inspected or touched (D2).
  INSERT INTO public.project_access_links (
    project_id, link_type, token_hash, token_hint, expires_at, created_by
  ) VALUES (
    p_project_id, v_source_link_type, p_new_token_hash, p_new_token_hint,
    v_source_expires_at, auth.uid()
  )
  RETURNING * INTO v_result;

  -- G. Activity — exactly one ACCESS_LINK_ROTATED row. Metadata carries the
  -- old/new access-link ids and link_type only — never token material
  -- (header ACTIVITY LOGGING, D10).
  PERFORM public.log_activity(
    p_project_id,
    'STAFF',
    'ACCESS_LINK_ROTATED',
    'Access link rotated',
    jsonb_build_object(
      'old_access_link_id', p_access_link_id,
      'new_access_link_id', v_result.id,
      'link_type', v_result.link_type
    )
  );

  RETURN QUERY SELECT
    v_result.id, v_result.project_id, v_result.link_type, v_result.token_hint,
    v_result.expires_at, v_result.created_by, v_result.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_access_link(uuid, uuid, bytea, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_access_link(uuid, uuid, bytea, text) FROM anon;
REVOKE ALL ON FUNCTION public.rotate_access_link(uuid, uuid, bytea, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.rotate_access_link(uuid, uuid, bytea, text) FROM service_role;

GRANT EXECUTE ON FUNCTION public.rotate_access_link(uuid, uuid, bytea, text) TO authenticated;

COMMENT ON FUNCTION public.rotate_access_link(uuid, uuid, bytea, text) IS
  'Audited access-link rotation (Task 026) — TRUSTED BUSINESS ACTION. Self-authorizes identically to issue_review_link; locks the exact source project_access_links row FOR UPDATE (matched on id AND project_id); rejects an already-revoked or expired source (AL004/AL005, CONFLICT); revokes exactly the source row and inserts exactly one replacement preserving project_id/link_type/expires_at (D8); touches no sibling link of the same type (D2). Calls log_activity(''ACCESS_LINK_ROTATED'') atomically on success. See this migration''s header for the full contract.';

-- ===========================================================================
-- revoke_access_link
-- ===========================================================================
CREATE FUNCTION public.revoke_access_link(
  p_project_id uuid,
  p_access_link_id uuid
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  link_type text,
  revoked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source_revoked_at timestamptz;
  v_result             public.project_access_links%ROWTYPE;
BEGIN
  -- A. Caller — identical pattern to issue_review_link.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'AL001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'AL001';
  END IF;

  IF public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'AL001';
  END IF;

  -- B. Lock the exact target row FOR UPDATE first (header CONCURRENCY),
  -- matched on BOTH id and project_id — same collapsed not-found outcome as
  -- rotate_access_link (D9, D2).
  SELECT p.revoked_at INTO v_source_revoked_at
  FROM public.project_access_links AS p
  WHERE p.id = p_access_link_id
    AND p.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access link not found'
      USING ERRCODE = 'AL003';
  END IF;

  -- C. Already revoked (D9) — no mutation, no activity row.
  IF v_source_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Access link is already revoked'
      USING ERRCODE = 'AL004';
  END IF;

  -- D. Expiry does NOT block revocation (D9) — deliberately no expiry check
  -- here, unlike rotate_access_link's AL005.

  -- E. Revoke. guard_access_link_revocation_immutability (0014) remains the
  -- authoritative backstop regardless (header SECURITY MODEL, D9: "No
  -- un-revoke").
  UPDATE public.project_access_links AS p SET
    revoked_at = now()
  WHERE p.id = p_access_link_id
  RETURNING p.id, p.project_id, p.link_type, p.revoked_at
    INTO v_result.id, v_result.project_id, v_result.link_type, v_result.revoked_at;

  -- F. Activity — exactly one ACCESS_LINK_REVOKED row. Metadata carries the
  -- access-link id and link_type only — never token material (header
  -- ACTIVITY LOGGING, D10).
  PERFORM public.log_activity(
    p_project_id,
    'STAFF',
    'ACCESS_LINK_REVOKED',
    'Access link revoked',
    jsonb_build_object(
      'access_link_id', v_result.id,
      'link_type', v_result.link_type
    )
  );

  RETURN QUERY SELECT
    v_result.id, v_result.project_id, v_result.link_type, v_result.revoked_at;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_access_link(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_access_link(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.revoke_access_link(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.revoke_access_link(uuid, uuid) FROM service_role;

GRANT EXECUTE ON FUNCTION public.revoke_access_link(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.revoke_access_link(uuid, uuid) IS
  'Audited access-link revocation (Task 026) — TRUSTED BUSINESS ACTION. Self-authorizes identically to issue_review_link; locks the exact target project_access_links row FOR UPDATE (matched on id AND project_id); rejects an already-revoked target (AL004, CONFLICT); an expired-but-not-revoked target MAY still be revoked (D9); sets revoked_at = now(); no un-revoke path exists. Calls log_activity(''ACCESS_LINK_REVOKED'') atomically on success. See this migration''s header for the full contract.';

-- ---------------------------------------------------------------------
-- REVIEW INSERT RLS TIGHTENING — direct authenticated-session INSERT must
-- no longer be able to create a REVIEW row, and must not be able to forge
-- a pre-revoked/pre-used row or misattribute created_by (D12, refined per
-- the Task 026 Phase 1 independent review's "DIRECT INSERT FIELD-CONTROL
-- FINDINGS"). Migration 0014's original project_access_links_insert_staff
-- policy (`WITH CHECK (public.is_staff())`) permitted staff to INSERT any
-- link_type directly, including REVIEW — bypassing issue_review_link() and
-- its REVIEW_LINK_ISSUED audit event entirely via a plain PostgREST
-- `.from("project_access_links").insert(...)` call — and placed no
-- constraint at all on created_by, revoked_at, or last_used_at. Recreated
-- below with the row-level restriction extended: direct INSERT remains
-- available for INTAKE/PORTAL (unaudited by design, docs/API_CONTRACT.md
-- §7.4, unchanged by this migration), but a direct REVIEW INSERT now fails
-- RLS regardless of staff role; created_by must equal the inserting
-- caller's own auth.uid() (no spoofing another staff member's
-- attribution); and the row must not already be revoked or already show a
-- last_used_at (a direct INSERT can never manufacture a pre-revoked or
-- pre-used link). This WITH CHECK evaluates against the row's actual
-- values regardless of the column-level INSERT privilege narrowing applied
-- below (AUTHENTICATED INSERT PRIVILEGE TIGHTENING) — RLS policy
-- expressions are evaluated against the full NEW row by the table owner,
-- independent of which columns the calling role has SQL privilege to set
-- explicitly, so referencing revoked_at/last_used_at/created_by here
-- remains valid even though authenticated can no longer supply them
-- explicitly (or, for created_by, can only supply the one value this check
-- allows) — an omitted column is simply filled by its DEFAULT/NULL before
-- WITH CHECK ever runs. This is a policy content change only — SELECT/
-- UPDATE policies and FORCE ROW LEVEL SECURITY are untouched here;
-- table-level INSERT/UPDATE privileges are tightened separately below.
-- ---------------------------------------------------------------------
DROP POLICY project_access_links_insert_staff ON public.project_access_links;

CREATE POLICY project_access_links_insert_staff
  ON public.project_access_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff()
    AND link_type IN ('INTAKE', 'PORTAL')
    AND created_by = auth.uid()
    AND revoked_at IS NULL
    AND last_used_at IS NULL
  );

-- ---------------------------------------------------------------------
-- AUTHENTICATED INSERT PRIVILEGE TIGHTENING — narrows the SQL-level INSERT
-- privilege itself, independent of the RLS WITH CHECK above (D12, refined
-- per the Task 026 Phase 1 independent review's "DIRECT INSERT
-- FIELD-CONTROL FINDINGS"). Migration 0014 granted `authenticated`
-- table-wide INSERT — every column, including id, created_at, revoked_at,
-- and last_used_at, was SQL-settable by the inserting client on a direct
-- INTAKE/PORTAL INSERT, since neither guard trigger fires on INSERT (both
-- are BEFORE UPDATE only). The WITH CHECK clause above already rejects a
-- forged revoked_at/last_used_at/created_by value at the row-content
-- layer, but leaving the table-wide grant in place means that rejection is
-- the only thing standing in the way — this grant closes the privilege at
-- its source instead. authenticated may now supply only the six issuance
-- columns; id and created_at come from their column DEFAULTs
-- (gen_random_uuid(), now() — migration 0014) on every normal INSERT that
-- omits them, and revoked_at/last_used_at are simply not writable at
-- INSERT time at all — a caller that names them in an INSERT column list
-- now fails with a SQL permission error (42501) before RLS is even
-- evaluated.
-- ---------------------------------------------------------------------
REVOKE INSERT ON TABLE public.project_access_links FROM authenticated;

GRANT INSERT (
  project_id, link_type, token_hash, token_hint, expires_at, created_by
) ON TABLE public.project_access_links TO authenticated;

-- ---------------------------------------------------------------------
-- TABLE PRIVILEGE TIGHTENING — revoked_at and last_used_at must go only
-- through the trusted actions above (D12).
-- ---------------------------------------------------------------------
-- Migration 0014 granted `authenticated` table-wide UPDATE on
-- public.project_access_links (RLS-scoped to is_staff(), narrowed in
-- practice only by the two guard triggers). Left as-is, that table-wide
-- grant would let any staff JWT bypass revoke_access_link/
-- rotate_access_link via a direct PostgREST
-- `.from("project_access_links").update(...)` call setting revoked_at
-- directly (still permitted by the identity/monotonicity guard triggers for
-- a first revocation, since neither trigger requires the revoke to happen
-- through a specific function) or last_used_at (reserved exclusively for
-- the later-phase service_role token-resolution bookkeeping write, D11) —
-- silently skipping the not-found/already-revoked/expired-not-rotatable
-- validation and activity logging this migration exists to guarantee.
-- Mirrors the 0021/0022/0024 TABLE PRIVILEGE TIGHTENING pattern — a
-- privilege change, not an RLS/table-shape change; the existing
-- project_access_links_update_staff RLS policy (migration 0014) is left
-- completely unmodified and remains the live, real enforcement for the one
-- column staff retains direct write access to.
--
-- Scope: expires_at is the only authenticated-writable column after this
-- migration — the existing schema already intentionally supports direct
-- staff expiry adjustment (docs/PHYSICAL_DATABASE_PLAN.md §2.17: "UPDATE:
-- is_staff(), enforced to revoked_at (monotonic, first-revocation-only)/
-- expires_at/last_used_at only by the two triggers above"), and no Task 026
-- business action manages expires_at independently of issuance/rotation, so
-- there is no trusted-action equivalent to bypass for this column. id,
-- project_id, link_type, token_hash, token_hint, created_by, created_at
-- remain excluded from the authenticated UPDATE grant exactly as they were
-- before (they were already unreachable in practice via the pre-existing
-- guard_access_link_identity_immutability trigger, 0014 — this migration
-- does not change that outcome, only removes the now-redundant table-wide
-- grant that made the trigger the sole backstop for those seven columns).
REVOKE UPDATE ON TABLE public.project_access_links FROM authenticated;
GRANT UPDATE (expires_at) ON TABLE public.project_access_links TO authenticated;
-- revoked_at, last_used_at deliberately excluded from the column list
-- above — revoked_at is reachable only via rotate_access_link()/
-- revoke_access_link() (SECURITY DEFINER, BYPASSRLS) from here on;
-- last_used_at remains reachable only via the later-phase service_role
-- token-resolution flow (D11), never by any authenticated-session write.
--
-- service_role's existing SELECT grant on project_access_links (migration
-- 0014, Task-014 hardening) is unchanged by this migration — still SELECT,
-- no INSERT, no DELETE. service_role's previously table-wide UPDATE grant
-- is narrowed by this migration — see SERVICE_ROLE UPDATE PRIVILEGE
-- TIGHTENING immediately below. This migration does not grant service_role
-- EXECUTE on any of the three new functions (see each function's REVOKE
-- ALL ... FROM service_role above) — staff mutation actions do not depend
-- on service_role (D11); service_role remains reserved exclusively for the
-- later-phase token-resolution read/last_used_at-bookkeeping flow.

-- ---------------------------------------------------------------------
-- SERVICE_ROLE UPDATE PRIVILEGE TIGHTENING — closes the service_role SQL
-- blast radius identified by the Task 026 Phase 1 independent review
-- ("AUTHOR-REPORT PRIVILEGE DISCREPANCY" / "SERVICE_ROLE BLAST-RADIUS
-- CLASSIFICATION"), addressed here rather than deferred because this
-- migration is the first to introduce a service_role token-resolution
-- consumer for this table. Migration 0014 granted service_role table-wide
-- UPDATE — every column, not merely last_used_at, was SQL-writable by
-- service_role. id/project_id/link_type/token_hash/token_hint/created_by/
-- created_at were protected only by guard_access_link_identity_immutability()
-- (a BEFORE UPDATE trigger, which does fire for service_role —
-- SECURITY DEFINER/BYPASSRLS bypasses RLS policies, never triggers), but
-- revoked_at's monotonicity trigger only blocks a SECOND change once
-- already non-NULL — it does not block a first, direct service_role
-- revocation, which would bypass revoke_access_link()'s AL003/AL004
-- validation and its ACCESS_LINK_REVOKED audit event entirely — and
-- expires_at/last_used_at had no trigger protection at all. Narrowing the
-- grant to last_used_at alone closes all of this at the SQL-privilege
-- layer itself, rather than continuing to rely on triggers — which guard
-- against accidental/incidental writes, not a substitute for least
-- privilege against a determined or buggy service_role-authenticated
-- caller. service_role's SELECT privilege is untouched — token-hash lookup
-- during resolution still requires table-wide SELECT. No service_role
-- INSERT or DELETE grant is added.
-- ---------------------------------------------------------------------
REVOKE UPDATE ON TABLE public.project_access_links FROM service_role;

GRANT UPDATE (last_used_at) ON TABLE public.project_access_links TO service_role;
