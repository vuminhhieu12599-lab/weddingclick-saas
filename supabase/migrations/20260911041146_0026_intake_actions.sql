-- WeddingClick V2 — Feature Migration 0026 (Task 027, Phase 1)
-- submit_intake_submission() / apply_intake_submission() /
-- reject_intake_submission(): three narrowly-scoped TRUSTED BUSINESS
-- ACTION functions for the Intake Workflow named by
-- docs/API_CONTRACT.md §8 ("027 | Intake Workflow (submit_intake,
-- apply_intake_submission, reject) | 022 (apply target), 026 (tokens)")
-- against the existing public.intake_submissions table (migration 0015).
--
-- FROZEN PRODUCT SCOPE (Task 027 preflight, Product/Architecture sign-off):
--   - Customer INTAKE submission -> immutable intake snapshot -> staff
--     apply OR reject.
--   - Canonical apply target for V1 is public.wedding_details ONLY. No
--     project_events/project_media field or action is added here. No
--     Task 030 REVIEW / Task 031 publish / Task 032 PORTAL/guest behavior
--     is touched.
--   - Multiple simultaneously-PENDING submissions per project are allowed
--     by design (mirrors D2's "multiple active links" precedent, migration
--     0025) — no partial unique index, no single-pending invariant, no
--     auto-supersede/auto-reject/auto-delete of sibling submissions is
--     added or planned.
--
-- This migration does NOT alter any frozen table shape, CHECK constraint,
-- FK, index, or existing RLS policy on public.intake_submissions (migration
-- 0015) — no CREATE TABLE, no ALTER TABLE ... ADD/DROP COLUMN or
-- CONSTRAINT, no DROP/CREATE POLICY anywhere in this file. It creates
-- exactly three new functions and applies least-privilege hardening to
-- public.intake_submissions (closing the two direct-write bypasses
-- identified in the Task 027 Phase 1 brief — see PRIVILEGE HARDENING near
-- the end of this file). Migrations 0001-0025 are not modified.
--
-- This migration must pass independent review before application, mirroring
-- every prior Foundation/Feature migration's own "author -> independent
-- review -> apply -> live structural verification" discipline
-- (0021/0022/0024/0025). Once applied, this is a historical migration and is
-- immutable — never edited in place; a later fix is a new migration, per
-- CLAUDE.md §14 (Database Migration Rule). Current authoring/apply status is
-- tracked in the Task 027 checkpoint reports, not in this file.
--
-- ---------------------------------------------------------------------
-- WHY THESE ARE BUSINESS ACTIONS, NOT PLAIN RLS/service_role WRITES
-- ---------------------------------------------------------------------
-- docs/API_CONTRACT.md §6 (frozen Activity Union) already reserves
-- CUSTOMER_SUBMISSION_RECEIVED (submit) and CANONICAL_DATA_APPLIED (apply,
-- via save_wedding_details() reuse — see TASK 022 COMPOSITION below) for
-- exactly these two events. log_activity() is private (0020) — not granted
-- EXECUTE to any externally-reachable role — so it is only reachable from
-- inside another SECURITY DEFINER business-action function owned by the
-- same schema-owner role. submit_intake_submission() is that function for
-- the customer path; apply_intake_submission() reaches it transitively by
-- composing with save_wedding_details() rather than calling it directly
-- (see TASK 022 COMPOSITION). reject_intake_submission() calls no activity
-- function at all — no REJECTED activity type exists in the frozen union,
-- and none is introduced here (frozen §10/§16 of the Task 027 contract:
-- "No frozen rejection activity exists. Do not call log_activity() for
-- reject.").
--
-- ---------------------------------------------------------------------
-- SECURITY MODEL — SECURITY DEFINER, self-authorizing
-- ---------------------------------------------------------------------
-- All three functions run as the schema-owner role (BYPASSRLS), so RLS
-- does not protect any of them — each function protects itself.
--
-- apply_intake_submission() / reject_intake_submission() (staff, Path A)
-- mirror 0021/0022/0024/0025 exactly:
--   - require auth.uid() IS NOT NULL
--   - lock the caller's own public.profiles row FOR UPDATE (existence
--     required) — stabilizes caller authorization against a concurrent
--     deactivation/demotion mid-transaction
--   - while that lock is held, require public.is_staff() IS TRUE — the
--     centralized, authoritative authorization helper (migration 0002),
--     never duplicated locally as a role/is_active check
--   - all three checked before any other data access; anything else raises
--     IS001
--
-- submit_intake_submission() (customer/server, Path B) is the first
-- service_role-exclusive SECURITY DEFINER function in this codebase — see
-- SUBMIT CALLER BOUNDARY below for its distinct security model.
--
-- SET search_path = '' on all three — every reference is fully
-- schema-qualified (public.intake_submissions, public.project_access_links,
-- public.projects, public.profiles, public.wedding_details (via
-- save_wedding_details, not directly), public.is_staff(),
-- public.log_activity(), public.save_wedding_details(), auth.uid());
-- built-in types resolve via the always-implicit pg_catalog search path.
--
-- ---------------------------------------------------------------------
-- SUBMIT CALLER BOUNDARY — submit_intake_submission() only
-- (Task 027 Phase 1 independent review, Finding A)
-- ---------------------------------------------------------------------
-- submit_intake_submission() has no in-function caller-identity check.
-- Its sole, intentional caller-identity boundary is the explicit PostgreSQL
-- function EXECUTE privilege grant (see this function's own privilege
-- block, immediately after CREATE FUNCTION): REVOKE ALL FROM
-- PUBLIC/anon/authenticated/service_role, then GRANT EXECUTE TO
-- service_role alone, for this exact function signature. PostgreSQL checks
-- EXECUTE privilege before the function body ever runs — no caller lacking
-- that grant can reach this function at all, regardless of any JWT/session
-- claim. This mirrors, at the function-call layer, exactly the same
-- mechanism every table-privilege GRANT/REVOKE in this codebase already
-- relies on as its actual enforcement (e.g. service_role's narrowed
-- last_used_at-only UPDATE on project_access_links, migration 0025) — a
-- GRANT/REVOKE boundary is not "weaker" defense-in-depth than an in-body
-- check; it is the primary Postgres access-control primitive for
-- function-call authorization.
--
-- An earlier authoring pass added an in-body `auth.role() = 'service_role'`
-- check as an additional layer. Independent review rejected it: this
-- codebase has no established convention for GUC/JWT-claim caller
-- introspection from inside a SECURITY DEFINER function (unlike
-- auth.uid(), which every staff business action already depends on for a
-- narrower, well-precedented purpose — identifying *which* authenticated
-- staff member, not *whether* the connecting role itself is trustworthy),
-- and introducing one here — via auth.role() or any equivalent
-- current_user/session_user/current_setting('role')/auth.jwt() trick —
-- would add an unreviewed, unverified mechanism on top of a boundary
-- (GRANT EXECUTE) that is already complete and sufficient on its own. It
-- has been removed; see Task 027 Phase 1 Independent Review Patch 1 for
-- the full rationale.
--
-- The Phase 2 application layer additionally ensures only the dedicated,
-- server-only service-role Supabase client (never exposed to the browser,
-- never used for ordinary staff convenience) ever constructs a call to
-- this RPC — the same discipline already documented for the Phase 2 token-
-- resolution repository (docs/API_CONTRACT.md §1, §2).
--
-- ---------------------------------------------------------------------
-- RESOLUTION-TO-SUBMIT RACE — submit_intake_submission() only
-- ---------------------------------------------------------------------
-- The raw bearer token is resolved once, by the existing Task 026 Phase 2
-- resolveAccessLink() (lib/server/access-links/resolve-access-link.ts),
-- BEFORE this RPC is ever called — this RPC receives only the already-
-- resolved { project id, INTAKE access-link id } context, never the raw
-- token (frozen Task 027 Phase 1 contract §6: "The raw bearer token MUST
-- NOT enter this RPC"). Between that resolution and this RPC's own
-- transaction, a staff member could revoke or the link could pass its
-- expiry — this function re-validates the access-link context, inside the
-- same transaction as the INSERT, by re-reading and locking
-- (`FOR UPDATE`) the exact project_access_links row: not-found / wrong-
-- project / wrong-purpose collapse to one generic outcome (IS004, mirrors
-- docs/API_CONTRACT.md §4.1 / D4's anti-enumeration ordering: purpose/
-- project binding checked before revoked/expired can ever be disclosed),
-- then revoked (IS005) and expired (IS006) are checked, in that order,
-- exactly matching D4's frozen resolution order and resolve-access-link.ts's
-- own sequence. The `FOR UPDATE` lock on that row correctly serializes
-- against a concurrent rotate_access_link()/revoke_access_link() call
-- (0025) targeting the same row — whichever transaction commits first
-- wins, and this function always observes the post-commit state. This
-- function never writes to project_access_links itself (last_used_at was
-- already touched by the Phase 2 resolution step before this RPC was
-- called) and needs no additional grant on that table beyond its existing
-- service_role SELECT (migration 0014, unchanged).
--
-- ---------------------------------------------------------------------
-- TASK 022 COMPOSITION — apply_intake_submission() reuses
-- save_wedding_details(), never duplicates it
-- ---------------------------------------------------------------------
-- apply_intake_submission() composes with Task 022's frozen
-- save_wedding_details(uuid, text×15, uuid, text×3, uuid) (migration 0021)
-- by calling it as a nested owned-function call inside the same
-- transaction, rather than reimplementing its upsert/no-op-detection/
-- CANONICAL_DATA_APPLIED logic. This is technically sound and is not a new
-- risk: `auth.uid()` is a session-scoped request GUC, entirely orthogonal
-- to the "current effective user for privilege checks" that SECURITY
-- DEFINER's nested-call context switch manipulates — every SECURITY
-- DEFINER function in this codebase already depends on `auth.uid()`
-- surviving unchanged through its own SECURITY DEFINER context switch (that
-- is the only reason any of them can self-authorize or attribute
-- log_activity() to the real caller at all); composing two such functions
-- in one call stack changes nothing about that guarantee. save_wedding_
-- details() therefore still correctly sees and self-authorizes against the
-- real calling staff member (not this function's owner) when invoked from
-- inside apply_intake_submission(), and still calls log_activity(
-- 'CANONICAL_DATA_APPLIED', ...) exactly as it does when called directly —
-- so apply_intake_submission() must never call log_activity() itself (it
-- does not), or CANONICAL_DATA_APPLIED would be logged twice on a real
-- change. This is the first nested trusted-action composition in this
-- codebase (every prior business action calls only log_activity()/is_staff()
-- as its "sibling" calls, never another full business action) — flagged
-- for reviewer awareness, though the underlying mechanism (auth.uid()'s GUC
-- independence from SECURITY DEFINER) is bedrock, already-relied-upon
-- Supabase/PostgREST/Postgres behavior, not new or uncertain.
--
-- apply_intake_submission() independently self-authorizes (locks its own
-- profiles row, checks is_staff()) BEFORE ever calling save_wedding_
-- details() — deliberate defense-in-depth redundancy, not dead code: it
-- satisfies this function's OWN frozen requirement to self-authorize
-- (frozen §8 of the Task 027 contract) independently of whatever the
-- nested call would also enforce, exactly as save_wedding_details() itself
-- would if called any other way.
--
-- ---------------------------------------------------------------------
-- TASK 022 ERROR PROPAGATION — apply_intake_submission() does not catch
-- or re-wrap save_wedding_details()'s own errors (Task 027 Phase 1
-- independent review, Finding C)
-- ---------------------------------------------------------------------
-- apply_intake_submission() wraps its call to save_wedding_details() in no
-- BEGIN/EXCEPTION block of its own — any exception save_wedding_details()
-- raises (a standard PL/pgSQL RAISE EXCEPTION with its own ERRCODE)
-- propagates out of apply_intake_submission() completely unchanged: same
-- SQLSTATE, same message, same ERRCODE. This is deliberate, not an
-- oversight: save_wedding_details()'s WDxxx codes are already a stable,
-- documented, application-mapped business-error contract (Task 022 —
-- lib/server/wedding-details/wedding-details-rpc-error-codes.ts,
-- SAVE_WEDDING_DETAILS_RPC_ERROR_CODES), and duplicating or re-wrapping
-- any of them under a new ISxxx code here would create two competing
-- sources of truth for the exact same underlying condition.
--
-- In practice, only WD004 (Gift QR media reference must belong to the same
-- Project — the wedding_details composite-FK violation) can realistically
-- reach a caller through this composition: WD001 (caller not staff) and
-- WD002 (Project not found) are structurally unreachable here because
-- apply_intake_submission() has already independently verified both
-- conditions (IS001, IS003) — including holding its own FOR UPDATE lock on
-- the same Project row — before save_wedding_details() ever runs its own
-- equivalent checks; WD003 (Project not a WEDDING project) remains
-- unreachable for the same reason it is unreachable when
-- save_wedding_details() is called directly (migration 0021's own header:
-- projects.event_type currently allows only 'WEDDING'). Phase 2's apply
-- error-mapping code must therefore check a propagated SQLSTATE against
-- the existing SAVE_WEDDING_DETAILS_RPC_ERROR_CODES map (at minimum
-- recognizing WD004 -> ApiError kind INVARIANT -> HTTP 422, the frozen
-- "well-formed input violates a business rule" contract, docs/
-- API_CONTRACT.md §5) BEFORE checking INTAKE_RPC_ERROR_CODES, and only
-- fall back to a generic INTERNAL (500) for a SQLSTATE recognized by
-- neither map. WD004 is intentionally NOT copied into
-- INTAKE_RPC_ERROR_CODES (lib/server/intake/intake-rpc-error-codes.ts) —
-- copying it would be exactly the duplicate-source-of-truth this section
-- exists to avoid.
--
-- ---------------------------------------------------------------------
-- PAYLOAD SCHEMA — no independent second Wedding Details schema in SQL
-- ---------------------------------------------------------------------
-- intake_submissions.payload (JSONB, migration 0015, frozen, not altered
-- here) stores exactly the fixed camelCase key set mirroring
-- lib/server/wedding-details/wedding-details-types.ts's
-- SaveWeddingDetailsInput one-for-one: groomName, brideName, groomFather,
-- groomMother, brideFather, brideMother, groomFamilyAddress,
-- brideFamilyAddress, invitationMessage, loveStory, lunarDateDisplay,
-- additionalNote, groomBankName, groomBankAccountName,
-- groomBankAccountNumber, groomBankQrMediaId, brideBankName,
-- brideBankAccountName, brideBankAccountNumber, brideBankQrMediaId.
-- submit_intake_submission() accepts these as 20 discrete, individually
-- typed (text/uuid) SQL parameters — the exact same shape save_wedding_
-- details() itself accepts (frozen §15 of the Task 027 contract: "The
-- stored submission snapshot must be mechanically compatible with those
-- fields... Do not build an independent second Wedding Details schema in
-- SQL") — and builds the JSONB snapshot internally via jsonb_build_object().
-- apply_intake_submission() extracts the same 20 keys back out
-- (`payload->>'groomName'`, etc.) to call save_wedding_details()
-- positionally. Because every row in this table can now only ever be
-- created by submit_intake_submission() (see PRIVILEGE HARDENING below —
-- the only other former write path, a direct service_role INSERT, is
-- revoked), the stored key set is closed and guaranteed-consistent by
-- construction; no defensive missing-key handling is needed or added.
--
-- No additional custom SQLSTATE is introduced for "invalid payload shape":
-- Postgres' own function-parameter type checking (each of the 20 fields is
-- a plain, individually typed text/uuid parameter, exactly like save_
-- wedding_details()'s own parameter list) is the complete, sufficient
-- structural validation at this layer — wedding_details (migration 0008)
-- has no CHECK constraint beyond its two composite gift-QR-media FKs, and
-- those are already mapped by save_wedding_details() itself to WD004
-- (reused unchanged via composition, not reimplemented here). The
-- exact-field application-layer validator (length limits, trimming, etc.)
-- belongs to Phase 2, per the frozen Task 027 contract §15.
--
-- ---------------------------------------------------------------------
-- CONCURRENCY (staff functions)
-- ---------------------------------------------------------------------
-- apply_intake_submission() and reject_intake_submission() each lock the
-- target public.projects row FOR UPDATE first (mirrors save_wedding_
-- details()'s own step B; a harmless, idempotent re-lock when apply's
-- nested save_wedding_details() call locks the same row again a moment
-- later — a session already holding a row lock never blocks re-acquiring
-- it), then lock the exact target public.intake_submissions row FOR UPDATE,
-- matched on BOTH id and project_id (mirrors 0025's rotate_access_link/
-- revoke_access_link exactly) — a wrong-project id and a genuinely
-- nonexistent submission id collapse to the same IS007 outcome. Two
-- concurrent apply/reject calls against the same submission serialize on
-- this lock: the second waits for the first to commit or roll back, then
-- observes the now-terminal status under its own lock and correctly
-- resolves to IS008 rather than racing to double-transition the same row
-- (frozen §11 of the Task 027 contract: "row lock, first valid transition
-- wins, second observes terminal state -> conflict"; no idempotent success
-- on a repeated terminal action). Neither function inspects, locks, or
-- touches any sibling intake_submissions row.
--
-- ---------------------------------------------------------------------
-- ERROR CONTRACT — ISxxx custom SQLSTATE range (new range, distinct from
-- Task 026's ALxxx, Task 025's PLxxx, Task 023's PExxx, Task 022's WDxxx,
-- and Task 005's WCxxx; grepped across all of supabase/migrations/*.sql —
-- no collision). These ISxxx codes are Task-027-native errors raised
-- directly by the three functions below. They are NOT the only SQLSTATEs
-- these functions can produce — see TASK 022 ERROR PROPAGATION above for
-- how apply_intake_submission() additionally propagates save_wedding_
-- details()'s own existing WDxxx codes unchanged, never re-wrapped as an
-- ISxxx code.
-- ---------------------------------------------------------------------
-- IS001  CALLER_FORBIDDEN — caller is not an active WeddingClick STAFF/
--        ADMIN (apply_intake_submission, reject_intake_submission only) ->
--        ApiError kind FORBIDDEN (403)
-- IS002  intentionally unused. An earlier authoring pass reserved IS002 for
--        an in-function service-role self-check (auth.role() = 'service_
--        role'); independent review (Task 027 Phase 1 Patch 1, Finding A)
--        rejected that mechanism — submit_intake_submission()'s sole
--        caller-identity boundary is the explicit GRANT EXECUTE TO
--        service_role privilege (see this function's own privilege block)
--        — so no code is raised for that condition. The gap is left in
--        place rather than renumbering IS003-IS008, to minimize review
--        churn.
-- IS003  PROJECT_NOT_FOUND — p_project_id does not resolve to an existing
--        Project (apply_intake_submission, reject_intake_submission only)
--        -> ApiError kind NOT_FOUND (404). Distinct from IS007 by design
--        (unlike 0025's AL003 collapse) — these two functions are
--        authenticated-staff-only, not the anti-enumeration-sensitive
--        customer-facing surface D4's collapsing was written for, and a
--        distinct code mirrors save_wedding_details()'s own WD002.
-- IS004  ACCESS_LINK_CONTEXT_INVALID — the presented access-link id does
--        not exist, does not belong to p_project_id, or is not an INTAKE-
--        type link (submit_intake_submission only) -> ApiError kind
--        NOT_FOUND (404). Deliberately collapsed (mirrors AL003 and
--        docs/API_CONTRACT.md §4.1) — never distinguished from each other.
-- IS005  ACCESS_LINK_REVOKED — the resolved access link is now revoked, a
--        race against a concurrent revoke_access_link() (submit_intake_
--        submission only) -> ApiError kind REVOKED_TOKEN (410) — reuses the
--        existing frozen ApiErrorKind (docs/API_CONTRACT.md §5), no new kind
--        introduced.
-- IS006  ACCESS_LINK_EXPIRED — the resolved access link's expires_at is now
--        <= now(), a race against passive expiry (submit_intake_submission
--        only) -> ApiError kind EXPIRED_TOKEN (410) — reuses the existing
--        frozen ApiErrorKind, no new kind introduced.
-- IS007  SUBMISSION_NOT_FOUND — p_submission_id does not resolve to an
--        existing intake_submissions row belonging to p_project_id
--        (apply_intake_submission, reject_intake_submission only) ->
--        ApiError kind NOT_FOUND (404). A wrong-project id and a genuinely
--        nonexistent id collapse to this same code (mirrors AL003).
-- IS008  SUBMISSION_NOT_PENDING — the target submission's status is not
--        'PENDING' (apply_intake_submission, reject_intake_submission only)
--        -> ApiError kind CONFLICT (409). PENDING -> APPLIED and PENDING ->
--        REJECTED are the only transitions; both APPLIED and REJECTED are
--        terminal (frozen §11 of the Task 027 contract) — no idempotent
--        success on a repeated apply/reject of an already-terminal
--        submission.
--
-- No SQLSTATE is introduced for "invalid stored/submit payload" — see
-- PAYLOAD SCHEMA above for why none is necessary. Every RAISE EXCEPTION
-- message below is a fixed, safe string — never a forwarded raw Postgres/
-- Supabase error. Any OTHER database failure (including a foreign_key_
-- violation surfaced by save_wedding_details()'s own WD004 mapping when
-- apply_intake_submission() calls it, or an unexpected constraint/type-cast
-- failure) is left unhandled and propagates as a normal Postgres error with
-- its own native SQLSTATE; application code maps any SQLSTATE it does not
-- recognize to a generic HTTP 500 and never forwards the raw message —
-- unexpected DB errors are never reclassified as a business error here.
--
-- ---------------------------------------------------------------------
-- ACTIVITY LOGGING
-- ---------------------------------------------------------------------
-- submit_intake_submission(): CUSTOMER_SUBMISSION_RECEIVED, actor_type
-- 'CUSTOMER' (log_activity() sets actor_profile_id to NULL for any
-- non-STAFF actor type, per its own frozen 0020 signature — no auth.uid()
-- dependency for this call). Metadata is
-- {intake_submission_id, access_link_id} only — never the payload/customer
-- PII, and never a raw token/token_hash/token_hint (D10-style metadata
-- discipline, frozen §6/§16 of the Task 027 contract).
-- apply_intake_submission(): no direct log_activity() call — CANONICAL_
-- DATA_APPLIED is logged (or correctly suppressed on a true no-op) exactly
-- once, inside the composed save_wedding_details() call. Calling
-- log_activity() again here would double-log the same domain event.
-- reject_intake_submission(): no log_activity() call at all — no REJECTED
-- activity type exists in the frozen Activity Union (docs/API_CONTRACT.md
-- §6), and none is introduced by this migration.

-- ===========================================================================
-- submit_intake_submission
-- ===========================================================================
CREATE FUNCTION public.submit_intake_submission(
  p_project_id uuid,
  p_access_link_id uuid,
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
  status text,
  submitted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link_type    text;
  v_link_project uuid;
  v_revoked_at   timestamptz;
  v_expires_at   timestamptz;
  v_payload      jsonb;
  v_result       public.intake_submissions%ROWTYPE;
BEGIN
  -- A. Caller identity is enforced entirely by this function's own GRANT
  -- EXECUTE TO service_role privilege (header SUBMIT CALLER BOUNDARY) — no
  -- in-body caller-identity check. Re-resolve and lock the presented
  -- access-link context (header RESOLUTION-TO-SUBMIT RACE). Not-found /
  -- wrong-project / wrong-purpose collapse to one outcome, checked before
  -- revoked/expired can ever be disclosed (D4-style anti-enumeration
  -- ordering).
  SELECT p.link_type, p.project_id, p.revoked_at, p.expires_at
    INTO v_link_type, v_link_project, v_revoked_at, v_expires_at
  FROM public.project_access_links AS p
  WHERE p.id = p_access_link_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_link_project IS DISTINCT FROM p_project_id
     OR v_link_type IS DISTINCT FROM 'INTAKE'
  THEN
    RAISE EXCEPTION 'Access link not found'
      USING ERRCODE = 'IS004';
  END IF;

  IF v_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Access link has been revoked'
      USING ERRCODE = 'IS005';
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at <= now() THEN
    RAISE EXCEPTION 'Access link has expired'
      USING ERRCODE = 'IS006';
  END IF;

  -- B. Build the immutable snapshot (header PAYLOAD SCHEMA) — fixed
  -- camelCase keys mirroring SaveWeddingDetailsInput exactly.
  v_payload := jsonb_build_object(
    'groomName', p_groom_name,
    'brideName', p_bride_name,
    'groomFather', p_groom_father,
    'groomMother', p_groom_mother,
    'brideFather', p_bride_father,
    'brideMother', p_bride_mother,
    'groomFamilyAddress', p_groom_family_address,
    'brideFamilyAddress', p_bride_family_address,
    'invitationMessage', p_invitation_message,
    'loveStory', p_love_story,
    'lunarDateDisplay', p_lunar_date_display,
    'additionalNote', p_additional_note,
    'groomBankName', p_groom_bank_name,
    'groomBankAccountName', p_groom_bank_account_name,
    'groomBankAccountNumber', p_groom_bank_account_number,
    'groomBankQrMediaId', p_groom_bank_qr_media_id,
    'brideBankName', p_bride_bank_name,
    'brideBankAccountName', p_bride_bank_account_name,
    'brideBankAccountNumber', p_bride_bank_account_number,
    'brideBankQrMediaId', p_bride_bank_qr_media_id
  );

  -- C. Insert exactly one immutable PENDING snapshot. Multiple
  -- simultaneously-PENDING submissions per project are allowed by design
  -- (frozen Task 027 scope, §3) — no supersede/auto-reject/auto-delete of
  -- any sibling submission.
  INSERT INTO public.intake_submissions (
    project_id, access_link_id, payload, status
  ) VALUES (
    p_project_id, p_access_link_id, v_payload, 'PENDING'
  )
  RETURNING * INTO v_result;

  -- D. Activity — exactly one CUSTOMER_SUBMISSION_RECEIVED row. Metadata
  -- carries only ids — never the payload/PII or any token material (header
  -- ACTIVITY LOGGING).
  PERFORM public.log_activity(
    p_project_id,
    'CUSTOMER',
    'CUSTOMER_SUBMISSION_RECEIVED',
    'Customer intake submission received',
    jsonb_build_object(
      'intake_submission_id', v_result.id,
      'access_link_id', p_access_link_id
    )
  );

  RETURN QUERY SELECT
    v_result.id, v_result.project_id, v_result.status, v_result.submitted_at;
END;
$$;

-- ---------------------------------------------------------------------
-- Explicit Data API privileges — locked down immediately after creation
-- (statement-order hardening pattern, matches 0021/0022/0024/0025). PUBLIC:
-- no execute. anon: no execute. authenticated: no execute (this is the
-- customer/server-only path — never a staff session). service_role: the
-- sole executor (header SECURITY MODEL / SUBMIT CALLER BOUNDARY). No
-- overloads.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.submit_intake_submission(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, uuid, text, text, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_intake_submission(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, uuid, text, text, text, uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.submit_intake_submission(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, uuid, text, text, text, uuid
) FROM authenticated;
REVOKE ALL ON FUNCTION public.submit_intake_submission(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, uuid, text, text, text, uuid
) FROM service_role;

GRANT EXECUTE ON FUNCTION public.submit_intake_submission(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, uuid, text, text, text, uuid
) TO service_role;

COMMENT ON FUNCTION public.submit_intake_submission(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, uuid, text, text, text, uuid
) IS
  'Audited customer INTAKE submission (Task 027 Phase 1) — TRUSTED BUSINESS ACTION, service_role-exclusive. Caller identity is enforced entirely by GRANT EXECUTE TO service_role (no in-body caller-identity check); re-validates the presented access-link context (existence/project/INTAKE purpose collapsed to IS004, then revoked IS005, then expired IS006) against a fresh FOR UPDATE lock to close the resolution-to-submit race; inserts exactly one new PENDING intake_submissions row (never touching any sibling row); calls log_activity(''CUSTOMER_SUBMISSION_RECEIVED'') atomically with ids-only metadata. See this migration''s header for the full contract.';

-- ===========================================================================
-- apply_intake_submission
-- ===========================================================================
CREATE FUNCTION public.apply_intake_submission(
  p_project_id uuid,
  p_submission_id uuid
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  status text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  wedding_details_changed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_submission_status public.intake_submissions.status%TYPE;
  v_payload           jsonb;
  v_saved_changed     boolean;
  v_result            public.intake_submissions%ROWTYPE;
BEGIN
  -- A. Caller — active WeddingClick STAFF/ADMIN, identical pattern to
  -- save_wedding_details()/the Task 026 trio (header SECURITY MODEL).
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'IS001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'IS001';
  END IF;

  IF public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'IS001';
  END IF;

  -- B. Target Project must exist (mirrors save_wedding_details()'s own
  -- WD002 — deliberately distinct from IS007, header ERROR CONTRACT).
  PERFORM 1
  FROM public.projects AS pr
  WHERE pr.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'IS003';
  END IF;

  -- C. Lock the exact submission row, matched on BOTH id and project_id —
  -- a wrong-project id and a genuinely nonexistent id collapse to the same
  -- IS007 outcome (mirrors 0025's AL003).
  SELECT s.status, s.payload
    INTO v_submission_status, v_payload
  FROM public.intake_submissions AS s
  WHERE s.id = p_submission_id
    AND s.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake submission not found'
      USING ERRCODE = 'IS007';
  END IF;

  -- D. Terminal-state guard (frozen §11 of the Task 027 contract) — PENDING
  -- -> APPLIED/REJECTED only, both terminal. No idempotent success on a
  -- repeated apply of an already-terminal submission.
  IF v_submission_status <> 'PENDING' THEN
    RAISE EXCEPTION 'Intake submission is not pending'
      USING ERRCODE = 'IS008';
  END IF;

  -- E. Apply the stored immutable snapshot to canonical wedding_details by
  -- composing with Task 022's frozen save_wedding_details() (header TASK
  -- 022 COMPOSITION) — never duplicating its upsert/no-op/CANONICAL_DATA_
  -- APPLIED logic. Field extraction mirrors the fixed key set
  -- submit_intake_submission() wrote (header PAYLOAD SCHEMA).
  SELECT sw.changed INTO v_saved_changed
  FROM public.save_wedding_details(
    p_project_id,
    v_payload ->> 'groomName',
    v_payload ->> 'brideName',
    v_payload ->> 'groomFather',
    v_payload ->> 'groomMother',
    v_payload ->> 'brideFather',
    v_payload ->> 'brideMother',
    v_payload ->> 'groomFamilyAddress',
    v_payload ->> 'brideFamilyAddress',
    v_payload ->> 'invitationMessage',
    v_payload ->> 'loveStory',
    v_payload ->> 'lunarDateDisplay',
    v_payload ->> 'additionalNote',
    v_payload ->> 'groomBankName',
    v_payload ->> 'groomBankAccountName',
    v_payload ->> 'groomBankAccountNumber',
    (v_payload ->> 'groomBankQrMediaId')::uuid,
    v_payload ->> 'brideBankName',
    v_payload ->> 'brideBankAccountName',
    v_payload ->> 'brideBankAccountNumber',
    (v_payload ->> 'brideBankQrMediaId')::uuid
  ) AS sw;

  -- F. Mark exactly this submission APPLIED. guard_intake_submission_
  -- immutability (0015) permits status/reviewed_by/reviewed_at to change —
  -- id/project_id/access_link_id/payload/submitted_at remain structurally
  -- untouched. No sibling submission is ever referenced or mutated.
  UPDATE public.intake_submissions AS s SET
    status = 'APPLIED',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE s.id = p_submission_id
  RETURNING s.id, s.project_id, s.status, s.reviewed_by, s.reviewed_at
    INTO v_result.id, v_result.project_id, v_result.status,
         v_result.reviewed_by, v_result.reviewed_at;

  -- G. No log_activity() call here — CANONICAL_DATA_APPLIED was already
  -- logged (or correctly suppressed on a true no-op) exactly once, inside
  -- save_wedding_details() above (header ACTIVITY LOGGING — no duplicate
  -- entry).
  RETURN QUERY SELECT
    v_result.id, v_result.project_id, v_result.status, v_result.reviewed_by,
    v_result.reviewed_at, v_saved_changed;
END;
$$;

-- ---------------------------------------------------------------------
-- Explicit Data API privileges — locked down immediately after creation.
-- PUBLIC: no execute. anon: no execute. authenticated: execute (self-
-- authorizes internally, header SECURITY MODEL). service_role: no execute
-- (this is the staff path — never the customer/server-only service_role
-- client, frozen §8/§13 of the Task 027 contract). No overloads.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.apply_intake_submission(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_intake_submission(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.apply_intake_submission(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.apply_intake_submission(uuid, uuid) FROM service_role;

GRANT EXECUTE ON FUNCTION public.apply_intake_submission(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.apply_intake_submission(uuid, uuid) IS
  'Staff apply of a PENDING intake submission (Task 027 Phase 1) — TRUSTED BUSINESS ACTION. Self-authorizes identically to save_wedding_details()/the Task 026 trio; locks the target Project row then the exact submission row (matched on id AND project_id); rejects a non-PENDING submission (IS008, CONFLICT); applies the stored immutable snapshot to canonical wedding_details by composing with Task 022''s frozen save_wedding_details() (never duplicating its logic); transitions exactly this submission to APPLIED with reviewed_by/reviewed_at. CANONICAL_DATA_APPLIED remains owned by save_wedding_details() and is emitted only according to Task 022''s existing changed/no-op semantics — this function never calls log_activity() itself and does not guarantee an activity row on every call. Touches no sibling submission, no project_events, no project_media, no project lifecycle. See this migration''s header for the full contract.';

-- ===========================================================================
-- reject_intake_submission
-- ===========================================================================
CREATE FUNCTION public.reject_intake_submission(
  p_project_id uuid,
  p_submission_id uuid,
  p_staff_note text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  status text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  staff_note text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_submission_status public.intake_submissions.status%TYPE;
  v_result            public.intake_submissions%ROWTYPE;
BEGIN
  -- A. Caller — identical pattern to apply_intake_submission().
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'IS001';
  END IF;

  PERFORM 1
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'IS001';
  END IF;

  IF public.is_staff() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active WeddingClick staff role required'
      USING ERRCODE = 'IS001';
  END IF;

  -- B. Target Project must exist.
  PERFORM 1
  FROM public.projects AS pr
  WHERE pr.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'IS003';
  END IF;

  -- C. Lock the exact submission row, matched on BOTH id and project_id.
  SELECT s.status INTO v_submission_status
  FROM public.intake_submissions AS s
  WHERE s.id = p_submission_id
    AND s.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake submission not found'
      USING ERRCODE = 'IS007';
  END IF;

  -- D. Terminal-state guard — identical to apply_intake_submission().
  IF v_submission_status <> 'PENDING' THEN
    RAISE EXCEPTION 'Intake submission is not pending'
      USING ERRCODE = 'IS008';
  END IF;

  -- E. Mark exactly this submission REJECTED. No canonical wedding_details
  -- mutation. No activity type exists for rejection in the frozen Activity
  -- Union — deliberately no log_activity() call (frozen §10/§16 of the
  -- Task 027 contract).
  UPDATE public.intake_submissions AS s SET
    status = 'REJECTED',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    staff_note = p_staff_note
  WHERE s.id = p_submission_id
  RETURNING s.id, s.project_id, s.status, s.reviewed_by, s.reviewed_at, s.staff_note
    INTO v_result.id, v_result.project_id, v_result.status,
         v_result.reviewed_by, v_result.reviewed_at, v_result.staff_note;

  RETURN QUERY SELECT
    v_result.id, v_result.project_id, v_result.status, v_result.reviewed_by,
    v_result.reviewed_at, v_result.staff_note;
END;
$$;

-- ---------------------------------------------------------------------
-- Explicit Data API privileges — locked down immediately after creation.
-- Identical role shape to apply_intake_submission() (authenticated only).
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.reject_intake_submission(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_intake_submission(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.reject_intake_submission(uuid, uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.reject_intake_submission(uuid, uuid, text) FROM service_role;

GRANT EXECUTE ON FUNCTION public.reject_intake_submission(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.reject_intake_submission(uuid, uuid, text) IS
  'Staff rejection of a PENDING intake submission (Task 027 Phase 1) — TRUSTED BUSINESS ACTION. Self-authorizes identically to apply_intake_submission(); locks the target Project row then the exact submission row (matched on id AND project_id); rejects a non-PENDING submission (IS008, CONFLICT); transitions exactly this submission to REJECTED with reviewed_by/reviewed_at/staff_note; never mutates canonical wedding_details; never calls log_activity() — no frozen rejection activity event exists, and this function intentionally raises no activity row of any kind. Touches no sibling submission. See this migration''s header for the full contract.';

-- ---------------------------------------------------------------------
-- PRIVILEGE HARDENING — closes the two direct-write bypasses identified by
-- the Task 027 Phase 1 brief. Both grants predate this migration (0015)
-- and, left in place, would let a caller skip the atomic RPCs above
-- entirely, silently bypassing the resolution-race re-check/PENDING-only/
-- terminal-state/activity-logging guarantees this migration exists to
-- provide. No RLS policy is dropped or recreated here — migration 0015's
-- intake_submissions_select_staff/intake_submissions_update_staff policies
-- are left completely unmodified, mirroring the 0021/0025 TABLE PRIVILEGE
-- TIGHTENING pattern exactly: this is a privilege change, not an RLS/
-- table-shape change.
-- ---------------------------------------------------------------------

-- service_role: migration 0015 granted INSERT so a customer submission
-- could land directly in intake_submissions. That plain-INSERT design is
-- superseded by submit_intake_submission() above, which additionally
-- re-validates the access-link context (closing the resolution-to-submit
-- race) and logs CUSTOMER_SUBMISSION_RECEIVED atomically — neither of
-- which a raw INSERT could do. service_role never held SELECT/UPDATE/
-- DELETE on this table (migration 0015, unchanged), so no other
-- service_role capability is affected.
REVOKE INSERT ON TABLE public.intake_submissions FROM service_role;

-- authenticated: migration 0015 granted table-wide UPDATE (RLS-scoped to
-- is_staff(), and further narrowed in practice only by
-- guard_intake_submission_immutability() to status/reviewed_by/
-- reviewed_at/staff_note). Left in place, that grant would let any staff
-- JWT bypass apply_intake_submission()/reject_intake_submission() entirely
-- via a direct PostgREST `.from("intake_submissions").update(...)` call —
-- silently skipping the PENDING-only/terminal-state guard, the canonical
-- wedding_details apply step, and (for apply) the CANONICAL_DATA_APPLIED
-- activity log this migration exists to guarantee. Unlike wedding_details
-- (0021) or project_access_links (0025), no column on this table remains
-- legitimately staff-directly-editable after this migration — status,
-- reviewed_by, reviewed_at, and staff_note (the only columns the existing
-- guard trigger ever permitted a normal UPDATE to change) are now
-- exclusively owned by the two staff RPCs above — so the grant is revoked
-- outright, with no narrower column-scoped re-grant. authenticated's
-- SELECT grant (migration 0015) is completely unaffected — staff read
-- visibility over intake_submissions (RLS-scoped to is_staff()) is
-- preserved exactly as before.
REVOKE UPDATE ON TABLE public.intake_submissions FROM authenticated;

-- No DELETE grant exists for any role on this table (migration 0015,
-- unchanged) and none is added here — Task 027 creates no intake-
-- submission DELETE path (frozen §14 of the Task 027 contract).
