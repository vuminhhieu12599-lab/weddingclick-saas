-- WeddingClick V2 — Task 018
-- rsvps table.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.20 (rsvps, [R11-A],
-- [R12]), §12 (J. RSVP Integrity), §15 (RLS Matrix), §16 (Migration Order,
-- 0018_rsvps.sql), §1.2 (updated_at convention), §1.3 (SECURITY DEFINER
-- hardening). Also docs/DATABASE.md §21 (rsvps — confirmed in sync with the
-- frozen physical plan, including the [R12]-corrected party_size CHECK),
-- docs/PRODUCT.md §14 (RSVP behavior), docs/SECURITY.md §11 (RSVP Security).
--
-- PARTY_SIZE NOTE: reconciled against docs/DATABASE.md §21 before authoring
-- — both the frozen plan and the current DATABASE.md already state the
-- [R12]-corrected rule identically: ATTENDING requires party_size BETWEEN
-- 1 AND 20; NOT_ATTENDING requires party_size = 0. No doc conflict found;
-- this migration implements that single agreed rule.
--
-- GUEST FK NOTE: guest_id is a plain (non-composite) FK to guests(id) ON
-- DELETE SET NULL, per §11-A. Project/guest same-project consistency is
-- enforced separately by guard_rsvp_guest_same_project() below, not by a
-- composite FK — see §11 for why a composite FK is structurally unusable
-- here (would conflict with project_id's own separate NOT NULL/CASCADE FK
-- to projects).
--
-- WRITE PATH NOTE: per §2.20/§15, no authenticated-session (staff) INSERT/
-- UPDATE path exists for this table at all — RSVP creation/resubmission is
-- exclusively a trusted-server (service_role, after guest-token/request
-- validation) use case, personalized and non-personalized alike. This
-- migration does not grant INSERT/UPDATE to authenticated, and adds no RLS
-- policy for either operation on that role, as defense-in-depth on top of
-- the missing grant.
--
-- NOT implemented here: RSVP API/route handlers, guest-token resolver,
-- rate limiting/abuse controls (docs/SECURITY.md §11 — a separate,
-- pre-production application-layer gate), portal UI, invitation RSVP form,
-- Task 019 project_tasks, activity log implementation.
--
-- This migration is purely additive. It does not touch any V1 object.

-- ---------------------------------------------------------------------
-- public.rsvps (§2.20)
-- ---------------------------------------------------------------------
CREATE TABLE public.rsvps (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id                   UUID NOT NULL
                                 REFERENCES public.projects (id) ON DELETE CASCADE,

  -- Plain (non-composite) FK, per §11-A. Same-project consistency with
  -- project_id is enforced by guard_rsvp_guest_same_project() below, not
  -- by this FK.
  guest_id                     UUID
                                 REFERENCES public.guests (id) ON DELETE SET NULL,

  -- Required (via CHECK below) when guest_id IS NULL (non-personalized
  -- flow's manually entered name). For the personalized flow, a copy of
  -- guests.display_name at submission time, so the response stays legible
  -- even if the guest row is later deleted.
  guest_display_name_snapshot  TEXT,

  attendance                   TEXT NOT NULL
                                 CHECK (attendance IN ('ATTENDING', 'NOT_ATTENDING')),

  -- [R12] corrected rule enforced by rsvps_attendance_party_size_check
  -- below: ATTENDING requires 1-20; NOT_ATTENDING requires exactly 0.
  party_size                   INTEGER NOT NULL DEFAULT 0,

  message                      TEXT
                                 CHECK (message IS NULL OR char_length(message) <= 500),

  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rsvps_guest_or_snapshot_check
    CHECK (guest_id IS NOT NULL OR guest_display_name_snapshot IS NOT NULL),

  -- [R12], corrected from an earlier revision that incorrectly allowed
  -- ATTENDING with party_size = 0. Both directions are strict.
  CONSTRAINT rsvps_attendance_party_size_check
    CHECK (
      (attendance = 'ATTENDING' AND party_size BETWEEN 1 AND 20)
      OR (attendance = 'NOT_ATTENDING' AND party_size = 0)
    )
);

COMMENT ON TABLE public.rsvps IS
  'Attendance response, personalized or not. All writes go through the trusted server RSVP use case (service_role) — never a direct staff-authenticated table write. See docs/PHYSICAL_DATABASE_PLAN.md §2.20.';
COMMENT ON COLUMN public.rsvps.guest_id IS
  'Plain FK to guests(id) ON DELETE SET NULL ([R11-A]) — deleting a guest must not destroy their actual RSVP response. Same-project consistency with project_id is enforced by guard_rsvp_guest_same_project(), not by this FK. At most one current row per non-null guest_id — see rsvps_guest_id_key below.';
COMMENT ON COLUMN public.rsvps.guest_display_name_snapshot IS
  'Required when guest_id IS NULL (non-personalized flow). For the personalized flow, a copy of guests.display_name at submission time, so the response stays legible if the guest row is later deleted.';
COMMENT ON COLUMN public.rsvps.party_size IS
  '[R12] Combined with attendance via rsvps_attendance_party_size_check: ATTENDING requires 1-20; NOT_ATTENDING requires exactly 0.';
COMMENT ON CONSTRAINT rsvps_attendance_party_size_check ON public.rsvps IS
  '[R12] — ATTENDING requires party_size BETWEEN 1 AND 20; NOT_ATTENDING requires party_size = 0. Both directions strict.';

-- Staff "list/filter RSVPs for this project" and service_role PORTAL
-- aggregate/list (§2.20, §15).
CREATE INDEX rsvps_project_id_idx
  ON public.rsvps (project_id);

-- One current RSVP per personalized guest (§2.20, §J): resubmission is an
-- UPDATE of this same row, never a second INSERT. Non-personalized rows
-- (guest_id IS NULL) are intentionally excluded and remain unbounded — no
-- anonymous deduplication (§J, accepted documented limitation).
CREATE UNIQUE INDEX rsvps_guest_id_key
  ON public.rsvps (guest_id)
  WHERE guest_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Explicit Data API privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.rsvps FROM PUBLIC;
REVOKE ALL ON TABLE public.rsvps FROM anon;
REVOKE ALL ON TABLE public.rsvps FROM authenticated;
REVOKE ALL ON TABLE public.rsvps FROM service_role;

-- authenticated represents STAFF/ADMIN sessions. Per §2.20/§15, staff get
-- SELECT only (is_staff(), below); no INSERT/UPDATE grant exists at all —
-- RSVP content mutation is exclusively the trusted server use case, never
-- a staff-authenticated table write. DELETE is granted here only because
-- ADMIN (not STAFF) has a documented spam/duplicate-cleanup capability,
-- restricted below by an is_admin()-only RLS policy.
GRANT SELECT, DELETE ON TABLE public.rsvps TO authenticated;

-- service_role: SELECT (PORTAL aggregate/list, §15), INSERT/UPDATE (the
-- trusted RSVP create/resubmit use case, personalized and non-personalized
-- alike, after guest-token/request validation in server code — never a
-- direct client grant). No DELETE — the documented ADMIN cleanup path is
-- an authenticated-session capability (above), not a service_role one; §15
-- does not document a service_role delete flow for this table. Table
-- object privileges only — service_role has no RLS policy and continues
-- to bypass RLS entirely (§1.6); authorization for each write is enforced
-- by the trusted server code's own validation before it queries.
GRANT SELECT, INSERT, UPDATE ON TABLE public.rsvps TO service_role;

ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsvps FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- guard_rsvp_guest_same_project() — [R11-A]
-- ---------------------------------------------------------------------
-- Enforces, at the moment an rsvps row referencing a guest is written,
-- that the referenced guests row belongs to the SAME project as the rsvps
-- row itself. Retained as defense-in-depth alongside
-- guests.guard_guest_project_immutability() ([G1], migration 0017), which
-- prevents the invariant from being invalidated after the fact by making
-- guests.project_id immutable — this trigger independently guards the
-- moment an RSVP itself is inserted or updated.
CREATE FUNCTION public.guard_rsvp_guest_same_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_guest_project_id UUID;
BEGIN
  SELECT project_id INTO v_guest_project_id
  FROM public.guests
  WHERE id = NEW.guest_id;

  IF v_guest_project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION
      'rsvps.project_id (%) does not match guests.project_id (%) for guest_id=%',
      NEW.project_id, v_guest_project_id, NEW.guest_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only: no external EXECUTE grant to any role.
REVOKE ALL ON FUNCTION public.guard_rsvp_guest_same_project() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_rsvp_guest_same_project() FROM anon;
REVOKE ALL ON FUNCTION public.guard_rsvp_guest_same_project() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_rsvp_guest_same_project() FROM service_role;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
CREATE TRIGGER rsvps_guard_guest_same_project
  BEFORE INSERT OR UPDATE ON public.rsvps
  FOR EACH ROW
  WHEN (NEW.guest_id IS NOT NULL)
  EXECUTE FUNCTION public.guard_rsvp_guest_same_project();

-- Shared updated_at maintenance trigger (migration 0001, §1.2 convention —
-- every V2 table with an updated_at column attaches this).
CREATE TRIGGER rsvps_set_updated_at
  BEFORE UPDATE ON public.rsvps
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS policies (§2.20, §15).
-- ---------------------------------------------------------------------
-- SELECT: staff and admin alike (is_staff() covers both).
CREATE POLICY rsvps_select_staff
  ON public.rsvps
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- DELETE: ADMIN only (spam/duplicate cleanup) — ordinary STAFF cannot
-- delete RSVP rows. No INSERT/UPDATE policy for any authenticated role:
-- content mutation has no staff-authenticated path at all (§2.20), backed
-- by the missing INSERT/UPDATE grant above.
CREATE POLICY rsvps_delete_admin
  ON public.rsvps
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
