-- WeddingClick V2 — Feature Migration 0029 (Invitation Rendering Foundation,
-- Timeline / Lịch trình checkpoint)
-- project_timeline_items table: the ordered run-of-show steps of a Project's
-- wedding day (time + label).
--
-- FROZEN CONTRACT (docs/DECISIONS.md RF7 "Timeline (Product Owner
-- amendment, 2026-10-01)", docs/PHYSICAL_DATABASE_PLAN.md §2.9a):
--   - canonical, persisted, structured content; NOT derived from
--     project_events (run-of-show steps such as "Đón khách" are not events);
--   - zero, one or many rows per Project; no maximum;
--   - staff-authoritative order: sort_order ASC, then id ASC (never by time);
--   - time_of_day is the step's local wall-clock time (no date, no timezone
--     arithmetic), minute precision; label is plain text (no HTML).
--
-- Purely additive: a new table only. No existing table, column, constraint,
-- function, trigger, RLS policy, grant, Storage bucket or Storage policy is
-- touched. Access mirrors project_media (0007): staff-only RLS, no anon
-- access, no service_role business path.
--
-- AUTHORING ONLY — not applied. Do not run `supabase db push` / migration
-- up / db reset / remote SQL / apply migration.

CREATE TABLE public.project_timeline_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  -- Local wall-clock time of the step, minute precision (e.g. 08:30).
  time_of_day  TIME(0) NOT NULL CHECK (EXTRACT(SECOND FROM time_of_day) = 0),
  label        TEXT NOT NULL CHECK (btrim(label) <> '' AND char_length(label) <= 200),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_timeline_items IS
  'Ordered Timeline (Lịch trình) steps of a Project: canonical structured content, not derived from project_events. Order is sort_order, then id. See docs/PHYSICAL_DATABASE_PLAN.md §2.9a.';
COMMENT ON COLUMN public.project_timeline_items.time_of_day IS
  'Local wall-clock time of the step (minute precision). No date and no timezone: the Snapshot carries it as HH:mm text.';
COMMENT ON COLUMN public.project_timeline_items.sort_order IS
  'Staff-authoritative display order (then id). Never re-sorted by time_of_day.';

CREATE INDEX project_timeline_items_project_sort_idx
  ON public.project_timeline_items (project_id, sort_order, id);

-- ---------------------------------------------------------------------
-- Explicit Data API privileges (mirrors project_media, 0007)
-- ---------------------------------------------------------------------

REVOKE ALL ON TABLE public.project_timeline_items FROM PUBLIC;
REVOKE ALL ON TABLE public.project_timeline_items FROM anon;
REVOKE ALL ON TABLE public.project_timeline_items FROM authenticated;
REVOKE ALL ON TABLE public.project_timeline_items FROM service_role;

-- authenticated: SELECT, INSERT, UPDATE, DELETE (RLS further restricts to is_staff()).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_timeline_items TO authenticated;

ALTER TABLE public.project_timeline_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_timeline_items FORCE ROW LEVEL SECURITY;

-- updated_at trigger — reuses the shared set_updated_at() function (0001).
CREATE TRIGGER project_timeline_items_set_updated_at
  BEFORE UPDATE ON public.project_timeline_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS policies — normal STAFF/ADMIN access only. No anon policy.
-- ---------------------------------------------------------------------

CREATE POLICY project_timeline_items_select_staff
  ON public.project_timeline_items
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY project_timeline_items_insert_staff
  ON public.project_timeline_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY project_timeline_items_update_staff
  ON public.project_timeline_items
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY project_timeline_items_delete_staff
  ON public.project_timeline_items
  FOR DELETE
  TO authenticated
  USING (public.is_staff());
