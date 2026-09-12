-- WeddingClick V2 — Foundation Migration 0014
-- project_access_links table.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.17 (project_access_links),
-- §10 (H. Customer Access Token Model), §15 (RLS Matrix), §16 (Migration
-- Order), [F14], [F17].
--
-- APPROVED TASK-014 SECURITY HARDENING — supersedes the frozen §2.17 wording
-- where noted below (see docs/PHYSICAL_DATABASE_PLAN.md §2.17 sync in this
-- same task for the authoritative updated text):
--   1. token_hint is now identity-immutable together with token_hash.
--      Rotation is (and always was) defined as creating a NEW row and
--      revoking the old one — never an in-place token_hash/token_hint
--      swap. The frozen plan's guard_access_link_identity_immutability()
--      only listed token_hash; token_hint carried the same rotation-time
--      identity as token_hash and must be frozen alongside it, or a
--      staff/service-role UPDATE could silently swap a link's display hint
--      without rotating its token, or vice versa.
--   2. revoked_at is now DB-guarded as monotonic by a dedicated second
--      trigger, guard_access_link_revocation_immutability(): first
--      NULL -> non-NULL remains allowed, but once non-NULL it is frozen
--      forever (no un-revoke, no rewriting the revocation timestamp). The
--      frozen plan left this to the identity guard's silence (revoked_at
--      was simply not in that guard's protected column list) plus RLS/
--      convention; this task makes permanence an actual guard, mirroring
--      guard_project_addon_revocation_immutability() (migration 0006).
--   3. service_role table privileges are SELECT + UPDATE only (no INSERT,
--      no DELETE) — for validated server-side token resolution (SELECT by
--      token_hash) and last_used_at bookkeeping (UPDATE) only. Normal
--      staff creation/revocation/rotation continues through the
--      authenticated-session + RLS path (§1.4), never service_role.
--
-- NOT implemented here: intake_submissions, review_feedback, guests, RSVP,
-- token-resolution route, token-generation/hashing RPC, review/portal UI,
-- business-action RPC, background cleanup, rate limiting. See §21/[F17]:
-- this migration exists specifically so 0015_intake_submissions and
-- 0016_review_feedback have a composite-FK target
-- (project_access_links(id, project_id)) — neither later FK is created here.
--
-- This migration is purely additive. It does not touch any V1 object.

-- ---------------------------------------------------------------------
-- public.project_access_links (§2.17)
-- ---------------------------------------------------------------------
-- Secure capability links for customers (INTAKE/REVIEW/PORTAL). The raw
-- capability token is never stored — only its SHA-256 digest (token_hash)
-- and an optional non-sensitive display fragment (token_hint). No REVIEW-
-- specific version-pinning column: approval anchors per-version through
-- review_feedback.invitation_version_id instead (§F, §R-Q2, deferred to
-- migration 0016).
CREATE TABLE public.project_access_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id    UUID NOT NULL
                  REFERENCES public.projects (id) ON DELETE CASCADE,

  link_type     TEXT NOT NULL
                  CHECK (link_type IN ('INTAKE', 'REVIEW', 'PORTAL')),

  -- SHA-256 digest (32 bytes) of the raw >=32-random-byte, URL-safe-encoded
  -- capability token. Raw token is never stored, never logged, and never
  -- referenced in this migration.
  token_hash    BYTEA NOT NULL
                  CHECK (octet_length(token_hash) = 32),

  -- Non-sensitive fragment for staff display only (e.g. a short prefix).
  -- Identity-immutable together with token_hash — see the Task-014
  -- hardening note above.
  token_hint    TEXT,

  -- NULL = no expiration (§R-Q3). Validity is checked at server-side token
  -- resolution time, not enforced here.
  expires_at    TIMESTAMPTZ,

  -- Sole source of truth for active/revoked state (no separate is_active/
  -- status column). NULL = active candidate, subject to expiry/type/
  -- project validation. Monotonic once set — see the Task-014 hardening
  -- note above and guard_access_link_revocation_immutability() below.
  revoked_at    TIMESTAMPTZ,

  created_by    UUID REFERENCES public.profiles (id) ON DELETE SET NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Updated by trusted server code after each successful token resolution.
  last_used_at  TIMESTAMPTZ,

  -- [F17]/§2.17 — declared explicitly as the composite-FK target for
  -- 0015_intake_submissions and 0016_review_feedback's
  -- (access_link_id, project_id) -> project_access_links(id, project_id)
  -- FKs. Trivially true since id is already the PK, but Postgres requires
  -- the exact unique constraint to exist to serve as a composite FK
  -- target. Do not omit as "redundant" — neither later FK is created in
  -- this migration.
  CONSTRAINT project_access_links_id_project_id_key UNIQUE (id, project_id),

  -- Frozen physical contract (§2.17): UNIQUE (token_hash), declared as an
  -- actual table CONSTRAINT rather than a standalone CREATE UNIQUE INDEX.
  CONSTRAINT project_access_links_token_hash_key UNIQUE (token_hash)
);

COMMENT ON TABLE public.project_access_links IS
  'Secure capability links for customers (INTAKE/REVIEW/PORTAL). Raw capability token is never stored — only a SHA-256 hash. See docs/PHYSICAL_DATABASE_PLAN.md §2.17.';
COMMENT ON COLUMN public.project_access_links.token_hash IS
  'SHA-256 digest (32 bytes) of the raw capability token. Raw token is never stored. Immutable after INSERT (identity), together with token_hint — see guard_access_link_identity_immutability().';
COMMENT ON COLUMN public.project_access_links.token_hint IS
  'Non-sensitive fragment for staff display only. Never the raw token. Identity-immutable together with token_hash (Task-014 approved hardening) — rotation creates a new row rather than mutating this in place.';
COMMENT ON COLUMN public.project_access_links.revoked_at IS
  'NULL = active candidate. Sole source of truth for active/revoked state — no paired boolean. Monotonic: first NULL -> non-NULL is allowed, then frozen forever (Task-014 approved hardening) — see guard_access_link_revocation_immutability().';
COMMENT ON CONSTRAINT project_access_links_id_project_id_key ON public.project_access_links IS
  'Composite-FK target for intake_submissions and review_feedback (access_link_id, project_id) -> project_access_links(id, project_id), added in migrations 0015/0016 ([F17]). Intentionally redundant with the PK — required, not dead weight.';

-- Staff "list active links for this project/type" (§2.17). UNIQUE(token_hash)
-- (declared as a table CONSTRAINT above) already provides its own unique
-- index; the PK already covers id. No other index is added.
CREATE INDEX project_access_links_project_type_revoked_idx
  ON public.project_access_links (project_id, link_type, revoked_at);

-- ---------------------------------------------------------------------
-- Explicit Data API privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.project_access_links FROM PUBLIC;
REVOKE ALL ON TABLE public.project_access_links FROM anon;
REVOKE ALL ON TABLE public.project_access_links FROM authenticated;
REVOKE ALL ON TABLE public.project_access_links FROM service_role;

-- authenticated represents STAFF/ADMIN sessions; RLS further restricts to
-- is_staff(), and column-level immutability/monotonicity is enforced by
-- the guard triggers below, not by the grant. No DELETE grant — soft-
-- revoke only, per §2.17/§15 RLS Matrix.
GRANT SELECT, INSERT, UPDATE ON TABLE public.project_access_links TO authenticated;

-- service_role: SELECT + UPDATE only (Task-014 approved hardening) — for
-- the trusted-server-only bearer-token resolution flow: SELECT by
-- token_hash during validated capability resolution, then UPDATE
-- last_used_at after a successful resolution. No service_role INSERT (link
-- creation stays on the authenticated-staff-session + RLS path) and no
-- service_role DELETE (soft-revoke only, and even revocation itself is a
-- staff/authenticated-session UPDATE, not a service_role write in this
-- plan). See docs/PHYSICAL_DATABASE_PLAN.md §10/§H.
GRANT SELECT, UPDATE ON TABLE public.project_access_links TO service_role;

ALTER TABLE public.project_access_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_access_links FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- guard_access_link_identity_immutability() ([F14], extended by the
-- Task-014 approved hardening to also cover id and token_hint)
-- ---------------------------------------------------------------------
-- These seven columns are never mutable through normal application code
-- after insert, full stop. Only revoked_at, expires_at, and last_used_at
-- may ever change through a normal UPDATE. Rotation is defined as creating
-- a NEW row and revoking the old one — never an in-place token_hash/
-- token_hint swap. id is included because PostgreSQL primary keys are
-- updatable unless explicitly prevented — a plain PK declaration alone
-- does not stop `UPDATE project_access_links SET id = ...`.
CREATE FUNCTION public.guard_access_link_identity_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.link_type IS DISTINCT FROM OLD.link_type
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.token_hint IS DISTINCT FROM OLD.token_hint
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'project_access_links identity columns are immutable after INSERT (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_access_link_identity_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_access_link_identity_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_access_link_identity_immutability() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_access_link_identity_immutability() FROM service_role;

-- ---------------------------------------------------------------------
-- guard_access_link_revocation_immutability() — Task-014 approved
-- hardening, new. revoked_at is monotonic.
-- ---------------------------------------------------------------------
-- Once revoked_at first becomes non-NULL, it is frozen forever: it can
-- never be changed back to NULL (no un-revoking) and it can never be
-- changed to a different non-NULL value (no rewriting revocation history).
-- While the row is still active (OLD.revoked_at IS NULL), the first
-- revocation (NULL -> non-NULL) remains freely allowed. Rotation/reissue
-- after revocation is a NEW row, never a resurrection of this one.
-- Deliberately does not auto-fill revoked_at — staff/server business logic
-- supplies the revocation timestamp. Deliberately does not freeze
-- expires_at/last_used_at after revocation — those remain mutable per
-- §2.17/§11 of the Task-014 spec.
CREATE FUNCTION public.guard_access_link_revocation_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL
     AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
  THEN
    RAISE EXCEPTION 'project_access_links.revoked_at is immutable once set (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_access_link_revocation_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_access_link_revocation_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_access_link_revocation_immutability() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_access_link_revocation_immutability() FROM service_role;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
CREATE TRIGGER project_access_links_guard_identity_immutability
  BEFORE UPDATE ON public.project_access_links
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_access_link_identity_immutability();

CREATE TRIGGER project_access_links_guard_revocation_immutability
  BEFORE UPDATE ON public.project_access_links
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_access_link_revocation_immutability();

-- ---------------------------------------------------------------------
-- RLS policies (§2.17, §15) — staff/admin only. No anon policy. No
-- customer/guest-token policy — token verification happens server-side via
-- service_role after independent validation (§1.6/§H), never RLS-scoped.
-- ---------------------------------------------------------------------
CREATE POLICY project_access_links_select_staff
  ON public.project_access_links
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY project_access_links_insert_staff
  ON public.project_access_links
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY project_access_links_update_staff
  ON public.project_access_links
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- No DELETE policy for any role — soft-revoke only (§2.17, §15).
