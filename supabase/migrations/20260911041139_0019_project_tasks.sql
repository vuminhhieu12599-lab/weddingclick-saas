-- WeddingClick V2 — Foundation Migration 0019
-- project_tasks table.
--
-- Source of truth: docs/PHYSICAL_DATABASE_PLAN.md §2.21 ([R19]), §4/§B
-- (Foreign Key Graph), §5/§C (Delete/Archive Strategy — "Fully
-- staff-manageable | Low risk, full CRUD"), §15/§M (RLS Matrix), §16/§N
-- (Migration Order).
--
-- Purpose: lightweight internal operational task/deadline items only.
-- Deliberately NOT a full project-management (ClickUp-style) feature set
-- (CLAUDE.md §2, docs/DATABASE.md §22) — no description, priority,
-- task_type, completed_at, cancelled_at, created_by, parent_task_id,
-- tags, checklist, reminder_at, recurrence, or external_task_id column is
-- added, since current authoritative docs do not require any of them.
--
-- assigned_staff_id is lightweight operational responsibility only — it is
-- NOT an RLS visibility filter. Every active STAFF/ADMIN may read and
-- manage every project's tasks (§2.21, §M), matching the same "no
-- assigned-only narrowing" resolution already applied to projects (§R-Q1).
--
-- "Overdue" is intentionally not a stored status or column: it is always
-- derivable from (due_at, status) at read time by the domain layer, never
-- persisted (CLAUDE.md §7 date/time correctness principle, applied here to
-- avoid a second source of truth for the same fact).
--
-- This migration is purely additive. It does not touch templates, RSVP,
-- guests, invitations, activity_logs, or any V1 object.

CREATE TABLE public.project_tasks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id         UUID NOT NULL
                       REFERENCES public.projects (id) ON DELETE CASCADE,

  title              TEXT NOT NULL
                       CHECK (char_length(title) BETWEEN 1 AND 200),

  -- Fixed controlled vocabulary, not arbitrary text (§3.A). No BLOCKED/
  -- OVERDUE/ARCHIVED/BACKLOG state — overdue is derived from due_at, never
  -- persisted as a status.
  status             TEXT NOT NULL DEFAULT 'TODO'
                       CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED')),

  due_at             TIMESTAMPTZ,

  -- Responsibility only, not a visibility/RLS filter (§2.21, §M) — every
  -- active STAFF/ADMIN may see and manage every project's tasks regardless
  -- of assignment.
  assigned_staff_id  UUID
                       REFERENCES public.profiles (id) ON DELETE SET NULL,

  sort_order         INTEGER NOT NULL DEFAULT 0,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_tasks IS
  'Lightweight internal operational task/deadline items. See docs/PHYSICAL_DATABASE_PLAN.md §2.21 ([R19]).';
COMMENT ON COLUMN public.project_tasks.assigned_staff_id IS
  'Operational responsibility only, not an RLS visibility filter — see docs/PHYSICAL_DATABASE_PLAN.md §2.21/§M.';

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
-- project_id: every expected query pattern is project-scoped task listing
-- (a Project's task list/board), matching the same minimal single-column
-- index already used for other 1:N project-scoped tables (e.g.
-- project_events, project_media). No composite index is added — docs are
-- silent on any other query shape (e.g. cross-project "my tasks" by
-- assigned_staff_id), and this migration does not speculate one into
-- existence.
CREATE INDEX project_tasks_project_id_idx
  ON public.project_tasks (project_id);

-- ---------------------------------------------------------------------
-- Explicit Data API privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.project_tasks FROM PUBLIC;
REVOKE ALL ON TABLE public.project_tasks FROM anon;
REVOKE ALL ON TABLE public.project_tasks FROM authenticated;
REVOKE ALL ON TABLE public.project_tasks FROM service_role;

-- authenticated: full CRUD (RLS further restricts to is_staff()).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_tasks TO authenticated;

-- No service_role business path for this table (§2.21, §M) — no
-- customer/guest/server-only flow reads or writes project_tasks in the
-- frozen architecture, so no grant is made merely because service_role
-- bypasses RLS.

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- updated_at trigger — reuses the shared set_updated_at() function (0001).
-- ---------------------------------------------------------------------
CREATE TRIGGER project_tasks_set_updated_at
  BEFORE UPDATE ON public.project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS policies (§2.21, §M) — normal STAFF/ADMIN access only, full CRUD.
-- No anon policy, no customer-token policy, no guest-token policy.
-- ---------------------------------------------------------------------
CREATE POLICY project_tasks_select_staff
  ON public.project_tasks
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

CREATE POLICY project_tasks_insert_staff
  ON public.project_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY project_tasks_update_staff
  ON public.project_tasks
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY project_tasks_delete_staff
  ON public.project_tasks
  FOR DELETE
  TO authenticated
  USING (public.is_staff());
