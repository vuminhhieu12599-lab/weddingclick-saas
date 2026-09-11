-- WeddingClick V2 — Foundation Migration 0009
-- project_events table.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.8 ([R21]), §4/§B
-- (Foreign Key Graph), §M (RLS Matrix).
--
-- occasion_type is deliberately NOT named event_type — that name is already
-- used by projects.event_type (a different domain concept) (§2.8).
--
-- starts_at is the sole canonical instant for a ceremony occasion. Weekday,
-- month, year, calendar display, and countdown are always derived from it
-- at read time (CLAUDE.md §7) — this migration does not store or compute
-- any of those.
--
-- Primary-event *resolution* (which row wins per invitation variant when
-- none/one/many rows are marked is_primary) is domain/resolver logic
-- documented in docs/PHYSICAL_DATABASE_PLAN.md §2.8 — it is NOT implemented
-- here as a SQL trigger, function, or view. The database's only guarantee
-- is that at most one row per (project_id, side) may be marked primary,
-- via the partial unique index below. No auto-demotion trigger is created:
-- attempting to mark a second row primary for the same (project_id, side)
-- must be rejected by that index, not silently resolved.
--
-- This migration is purely additive. It does not touch templates,
-- project_design, invitations, the event editor UI, the invitation
-- resolver, calendar integration, map API logic, or customer intake.

CREATE TABLE public.project_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id        UUID NOT NULL
                       REFERENCES public.projects (id) ON DELETE CASCADE,

  -- Named occasion_type, not event_type, to avoid colliding with
  -- projects.event_type (§2.8).
  occasion_type     TEXT NOT NULL
                       CHECK (occasion_type IN ('VU_QUY', 'THANH_HON', 'RECEPTION', 'CUSTOM')),

  -- Reuses the InvitationVariant vocabulary (COMMON/GROOM/BRIDE).
  side              TEXT NOT NULL DEFAULT 'COMMON'
                       CHECK (side IN ('COMMON', 'GROOM', 'BRIDE')),

  title             TEXT NOT NULL,

  -- Canonical instant. Weekday/date/time/countdown are always derived from
  -- this at read time — never stored separately (§7, §E).
  starts_at         TIMESTAMPTZ NOT NULL,

  -- IANA timezone name. No DB-level IANA validation trigger/check is
  -- required by the frozen schema (§2.8) — application/server validation
  -- covers this (CLAUDE.md §15).
  timezone          TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',

  venue_name        TEXT,
  address           TEXT,

  -- HTTPS-only, per docs/SECURITY.md §13. No domain allowlist, no
  -- Google-Maps-specific validation, no broader URL regex.
  map_url           TEXT
                       CHECK (map_url IS NULL OR map_url ~ '^https://'),

  description       TEXT,

  sort_order        INTEGER NOT NULL DEFAULT 0,

  -- At most one primary row per (project_id, side) — enforced below by the
  -- partial unique index, not by this column alone.
  is_primary        BOOLEAN NOT NULL DEFAULT false,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_events IS
  'Date/time/venue records for wedding ceremony occasions. See docs/PHYSICAL_DATABASE_PLAN.md §2.8 ([R21]).';
COMMENT ON COLUMN public.project_events.occasion_type IS
  'Distinct from projects.event_type — see docs/PHYSICAL_DATABASE_PLAN.md §2.8.';
COMMENT ON COLUMN public.project_events.starts_at IS
  'Canonical instant. Weekday/month/year/countdown are always derived from this, never stored. See docs/PHYSICAL_DATABASE_PLAN.md §E.';

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
CREATE INDEX project_events_project_id_idx
  ON public.project_events (project_id);

CREATE INDEX project_events_project_id_starts_at_idx
  ON public.project_events (project_id, starts_at);

-- [R21]: at most one primary event per Project/side. A Project may still
-- have many non-primary events for the same side. Deliberately a *partial*
-- unique index (WHERE is_primary = true) — a plain UNIQUE(project_id, side)
-- would wrongly cap every side at one event total.
CREATE UNIQUE INDEX project_events_one_primary_per_project_side_idx
  ON public.project_events (project_id, side)
  WHERE is_primary = true;

-- ---------------------------------------------------------------------
-- Explicit Data API privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.project_events FROM PUBLIC;
REVOKE ALL ON TABLE public.project_events FROM anon;
REVOKE ALL ON TABLE public.project_events FROM authenticated;
REVOKE ALL ON TABLE public.project_events FROM service_role;

-- authenticated: full CRUD (RLS further restricts to is_staff()). Unlike
-- 1:1 tables such as wedding_details, project_events is 1:N and staff may
-- delete an individual event row directly, not only via the parent
-- Project's ON DELETE CASCADE.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_events TO authenticated;

-- No service_role business path in this migration.

ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_events FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- updated_at trigger — reuses the shared set_updated_at() function (0001).
-- ---------------------------------------------------------------------
CREATE TRIGGER project_events_set_updated_at
  BEFORE UPDATE ON public.project_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS policies (§2.8) — normal STAFF/ADMIN access only. No anon policy,
-- no customer-token policy. Customer/review rendering is server-only
-- where applicable.
-- ---------------------------------------------------------------------
CREATE POLICY project_events_select_staff
  ON public.project_events
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY project_events_insert_staff
  ON public.project_events
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY project_events_update_staff
  ON public.project_events
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY project_events_delete_staff
  ON public.project_events
  FOR DELETE
  TO authenticated
  USING (public.is_staff());
