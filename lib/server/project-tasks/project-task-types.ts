import type { ProjectTaskStatus } from "../../domain";

/**
 * One `project_tasks` row (migration 0019; docs/PHYSICAL_DATABASE_PLAN.md
 * §2.21; Task 034A): a lightweight internal operational task/deadline item.
 * Staff-only — never exposed to customer, Portal, review, guest or public
 * flows. "Overdue" is derived from (dueAt, status), never stored.
 */
export interface ProjectTaskRecord {
  id: string;
  projectId: string;
  /** Trimmed, non-blank, at most 200 characters (0019 CHECK). */
  title: string;
  status: ProjectTaskStatus;
  /** Canonical TIMESTAMPTZ instant, or `null` when there is no deadline. */
  dueAt: string | null;
  /** Operational responsibility only — never an RLS/visibility filter. */
  assignedStaffId: string | null;
  /** `profiles.display_name` of the assignee (kept even if later deactivated); `null` when unassigned. */
  assignedStaffDisplayName: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** An active STAFF/ADMIN profile that may receive a task assignment (id + display name only). */
export interface AssignableStaffRecord {
  id: string;
  displayName: string;
}

/** Validated values for one new `project_tasks` row; status is always the DB default `TODO`. */
export interface ProjectTaskInput {
  title: string;
  dueAt: string | null;
  assignedStaffId: string | null;
  /** Omitted → the DB default (0). */
  sortOrder?: number;
}

/** Field-presence preserving patch: only the keys present are written. */
export interface ProjectTaskPatch {
  title?: string;
  status?: ProjectTaskStatus;
  dueAt?: string | null;
  assignedStaffId?: string | null;
  sortOrder?: number;
}
