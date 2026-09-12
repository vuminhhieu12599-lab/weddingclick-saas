-- WeddingClick V2 — Foundation Migration 0016
-- review_feedback table.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.18 (review_feedback),
-- [R11-D], [R13], §R-Q2 (approval anchored to current review version); §15
-- (RLS Matrix); §16 (Migration Order).
--
-- APPROVED TASK-016 CONCURRENCY HARDENING (docs/PHYSICAL_DATABASE_PLAN.md
-- §2.18 synced in this same task):
--   guard_approval_targets_current_review() locks the resolved
--   project_invitations row via SELECT ... FOR UPDATE before comparing
--   current_review_version_id. Rationale: a plain unlocked SELECT is
--   vulnerable to a TOCTOU race under READ COMMITTED — T1 reads
--   current_review_version_id = A while inserting APPROVAL(A); T2
--   concurrently UPDATEs that same project_invitations row, advancing the
--   pointer to B, and commits; T1 would then wrongly approve against
--   superseded version A. Pointer advancement is necessarily an UPDATE on
--   this exact row, and UPDATE always takes a row-level lock, so a
--   SELECT ... FOR UPDATE on that same row in the guard is sufficient to
--   serialize the two (mirrors guard_project_addon_commercial_freeze(),
--   §2.6 — a single shared row, not the disjoint-rows case that required
--   guard_last_active_admin()'s pg_advisory_xact_lock, §2.1/[F12]). No
--   advisory lock is used.
--
-- NOT implemented here (later tasks): guests, rsvps, publish RPC, review API
-- route, customer UI, token resolver, project-status transition service,
-- project-level approval completeness (a domain-service rule spanning
-- multiple project_invitations rows, §R-Q2 — not a single-table constraint).
--
-- This migration is purely additive. It does not touch any V1 object.

-- ---------------------------------------------------------------------
-- public.review_feedback (§2.18)
-- ---------------------------------------------------------------------
-- Fully append-only log of customer review feedback/approval events.
-- Exactly 7 columns. No customer_id, invitation_id, status, approved_at,
-- reviewer name, raw token, token hash, metadata JSON, or soft-delete
-- fields — see §2.18/CLAUDE.md §11.
CREATE TABLE public.review_feedback (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id             UUID NOT NULL
                           REFERENCES public.projects (id) ON DELETE CASCADE,

  -- Nullable: composite FK below, bypassed via MATCH SIMPLE when NULL.
  -- Capability type (REVIEW only) is enforced separately by
  -- guard_review_link_type(), not by this FK.
  access_link_id         UUID,

  -- NOT NULL — every feedback row, including COMMENT, references the exact
  -- REVIEW version shown (§R13). Composite FK below; no plain single-column
  -- FK on this column alone.
  invitation_version_id  UUID NOT NULL,

  feedback_type          TEXT NOT NULL
                           CHECK (
                             feedback_type IN (
                               'COMMENT',
                               'REVISION_REQUEST',
                               'APPROVAL'
                             )
                           ),

  message                TEXT
                           CHECK (
                             message IS NULL
                             OR char_length(message) <= 2000
                           ),

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- [R11-D] Same-project access-link integrity. Nullable access_link_id
  -- means MATCH SIMPLE bypasses this check entirely when it's NULL.
  -- Capability type (REVIEW only) is enforced separately by
  -- guard_review_link_type() below, not by this FK.
  CONSTRAINT review_feedback_access_link_project_fkey
    FOREIGN KEY (access_link_id, project_id)
    REFERENCES public.project_access_links (id, project_id)
    ON DELETE RESTRICT,

  -- [R11-D] Same-project integrity — the entire reason
  -- invitation_versions.project_id is a guaranteed-correct denormalized copy
  -- ([F3]'s re-check, §2.14). Guarantees the referenced version belongs to
  -- THIS SAME project without a two-hop join.
  CONSTRAINT review_feedback_version_project_fkey
    FOREIGN KEY (invitation_version_id, project_id)
    REFERENCES public.invitation_versions (id, project_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.review_feedback IS
  'Fully append-only log of customer review feedback/approval events. No UPDATE, no DELETE for any role. See docs/PHYSICAL_DATABASE_PLAN.md §2.18.';
COMMENT ON COLUMN public.review_feedback.access_link_id IS
  'Nullable. When set, must be a REVIEW-typed link on the same project — same-project integrity via the composite FK, capability type via guard_review_link_type().';
COMMENT ON COLUMN public.review_feedback.invitation_version_id IS
  'NOT NULL. Every feedback row, including COMMENT, targets the exact REVIEW-typed invitation_versions row shown — enforced by guard_feedback_targets_review_version(). Same-project integrity via the composite FK.';
COMMENT ON COLUMN public.review_feedback.message IS
  'Optional, <= 2000 chars. No structured reviewer-identity fields — the actor is the resolved access_link_id/customer REVIEW session, not this table.';
COMMENT ON CONSTRAINT review_feedback_access_link_project_fkey ON public.review_feedback IS
  '[R11-D] — composite FK guaranteeing access_link_id, when present, belongs to the SAME project as this feedback row. MATCH SIMPLE: NULL bypasses this FK. Capability type (REVIEW) checked separately by guard_review_link_type().';
COMMENT ON CONSTRAINT review_feedback_version_project_fkey ON public.review_feedback IS
  '[R11-D] — composite FK guaranteeing invitation_version_id resolves to the SAME project as this feedback row. Lifecycle type (REVIEW) checked separately by guard_feedback_targets_review_version().';

-- Partial unique index (§2.18, [R13]): at most one APPROVAL event per
-- invitation version. A new review round gets a new version and hence a
-- fresh opportunity to approve. Multiple COMMENT/REVISION_REQUEST rows for
-- the same version remain unrestricted.
CREATE UNIQUE INDEX review_feedback_one_approval_per_version_idx
  ON public.review_feedback (invitation_version_id)
  WHERE feedback_type = 'APPROVAL';

-- ---------------------------------------------------------------------
-- Explicit Data API privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.review_feedback FROM PUBLIC;
REVOKE ALL ON TABLE public.review_feedback FROM anon;
REVOKE ALL ON TABLE public.review_feedback FROM authenticated;
REVOKE ALL ON TABLE public.review_feedback FROM service_role;

-- authenticated represents STAFF/ADMIN sessions; RLS further restricts to
-- is_staff(). No INSERT/UPDATE/DELETE grant — append-only, and customer
-- REVIEW feedback submission is server-only via service_role (§12/§H),
-- never a staff-session write.
GRANT SELECT ON TABLE public.review_feedback TO authenticated;

-- service_role: INSERT only — the trusted-server-only customer REVIEW token
-- flow (raw token -> Next.js server validates project_access_links ->
-- resolves the current review snapshot -> service_role INSERT here). No
-- service_role SELECT/UPDATE/DELETE.
GRANT INSERT ON TABLE public.review_feedback TO service_role;

ALTER TABLE public.review_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_feedback FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- guard_review_link_type() (§2.18)
-- ---------------------------------------------------------------------
-- The composite FK above already guarantees existence + same-project
-- integrity when access_link_id is set. This trigger is responsible for
-- capability type only: review feedback may reference a REVIEW-typed link,
-- never INTAKE or PORTAL.
CREATE FUNCTION public.guard_review_link_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link_type text;
BEGIN
  SELECT link_type INTO v_link_type
  FROM public.project_access_links
  WHERE id = NEW.access_link_id;

  IF v_link_type IS DISTINCT FROM 'REVIEW' THEN
    RAISE EXCEPTION 'review_feedback.access_link_id % must reference a REVIEW-typed access link, found %', NEW.access_link_id, v_link_type;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_review_link_type() IS
  'BEFORE INSERT trigger-only helper (§2.18): raises unless review_feedback.access_link_id resolves to a REVIEW-typed project_access_links row. The composite FK already guarantees existence and same-project integrity; this adds only the literal link_type check. Not a business RPC — no direct EXECUTE grant to any role.';

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_review_link_type() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_review_link_type() FROM anon;
REVOKE ALL ON FUNCTION public.guard_review_link_type() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_review_link_type() FROM service_role;

-- ---------------------------------------------------------------------
-- guard_feedback_targets_review_version() (§2.18, [R13])
-- ---------------------------------------------------------------------
-- Applies to ALL feedback_type values (COMMENT, REVISION_REQUEST, APPROVAL)
-- — every feedback row must target the exact REVIEW version shown. This
-- also has the side effect of structurally preventing any feedback against
-- a PUBLISHED row.
CREATE FUNCTION public.guard_feedback_targets_review_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version_type text;
BEGIN
  SELECT version_type INTO v_version_type
  FROM public.invitation_versions
  WHERE id = NEW.invitation_version_id;

  IF v_version_type IS DISTINCT FROM 'REVIEW' THEN
    RAISE EXCEPTION 'review_feedback.invitation_version_id % must reference a REVIEW version, found %', NEW.invitation_version_id, v_version_type;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_feedback_targets_review_version() IS
  'BEFORE INSERT trigger-only helper (§2.18, [R13]): raises unless invitation_version_id resolves to a REVIEW-type invitation_versions row. Applies to every feedback_type, including COMMENT — feedback must never target a PUBLISHED version. Not a business RPC — no direct EXECUTE grant to any role.';

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_feedback_targets_review_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_feedback_targets_review_version() FROM anon;
REVOKE ALL ON FUNCTION public.guard_feedback_targets_review_version() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_feedback_targets_review_version() FROM service_role;

-- ---------------------------------------------------------------------
-- guard_approval_targets_current_review() (§2.18, §R-Q2)
-- ---------------------------------------------------------------------
-- Only fires for feedback_type = 'APPROVAL'. Resolves invitation_version_id
-- to its parent invitation, then locks that EXACT project_invitations row
-- with SELECT ... FOR UPDATE before comparing current_review_version_id —
-- Task-016 approved concurrency hardening (see header comment and §2.18):
-- pointer advancement is necessarily an UPDATE on this same row, and
-- UPDATE always takes a row-level lock, so this SELECT ... FOR UPDATE
-- serializes approval-insertion against concurrent pointer advancement.
-- Whichever transaction locks the row first blocks the other until commit,
-- so the comparison below always evaluates the post-commit current value,
-- never a stale unlocked read. No advisory lock — this race has one shared
-- row, unlike guard_last_active_admin()'s disjoint-rows case (§2.1/[F12]).
CREATE FUNCTION public.guard_approval_targets_current_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invitation_id uuid;
  v_current_review_version_id uuid;
BEGIN
  SELECT invitation_id INTO v_invitation_id
  FROM public.invitation_versions
  WHERE id = NEW.invitation_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_feedback.invitation_version_id % does not resolve to an invitation_versions row', NEW.invitation_version_id;
  END IF;

  -- Locks the exact project_invitations row for this invitation before
  -- reading current_review_version_id. See the concurrency note above.
  SELECT current_review_version_id INTO v_current_review_version_id
  FROM public.project_invitations
  WHERE id = v_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_feedback approval target invitation % does not resolve to a project_invitations row', v_invitation_id;
  END IF;

  IF v_current_review_version_id IS DISTINCT FROM NEW.invitation_version_id THEN
    RAISE EXCEPTION 'review_feedback APPROVAL rejected: invitation_version_id % is not the current review version for invitation % (current: %)', NEW.invitation_version_id, v_invitation_id, v_current_review_version_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_approval_targets_current_review() IS
  'BEFORE INSERT trigger-only helper (§2.18, §R-Q2), fires only for feedback_type = APPROVAL: resolves invitation_version_id to its invitation, locks that exact project_invitations row via SELECT ... FOR UPDATE (Task-016 approved concurrency hardening — serializes against concurrent current_review_version_id advancement, see header comment), then rejects unless the locked current_review_version_id equals invitation_version_id. Stale/superseded review versions are never approvable. Not a business RPC — no direct EXECUTE grant to any role.';

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_approval_targets_current_review() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_approval_targets_current_review() FROM anon;
REVOKE ALL ON FUNCTION public.guard_approval_targets_current_review() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_approval_targets_current_review() FROM service_role;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
CREATE TRIGGER review_feedback_guard_link_type
  BEFORE INSERT ON public.review_feedback
  FOR EACH ROW
  WHEN (NEW.access_link_id IS NOT NULL)
  EXECUTE FUNCTION public.guard_review_link_type();

CREATE TRIGGER review_feedback_guard_targets_review_version
  BEFORE INSERT ON public.review_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_feedback_targets_review_version();

CREATE TRIGGER review_feedback_guard_approval_targets_current_review
  BEFORE INSERT ON public.review_feedback
  FOR EACH ROW
  WHEN (NEW.feedback_type = 'APPROVAL')
  EXECUTE FUNCTION public.guard_approval_targets_current_review();

-- ---------------------------------------------------------------------
-- RLS policies (§2.18, §15) — staff read-only. No INSERT policy for any
-- role — customer REVIEW feedback submission is server-only via
-- service_role after token validation (§12/§H). No UPDATE/DELETE policy for
-- any role — fully append-only (§2.18).
-- ---------------------------------------------------------------------
CREATE POLICY review_feedback_select_staff
  ON public.review_feedback
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- No INSERT policy for any role — server-only via service_role (§12).
-- No UPDATE policy for any role — append-only (§2.18).
-- No DELETE policy for any role — append-only (§2.18).
