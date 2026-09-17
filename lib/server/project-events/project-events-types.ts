import type { EventSide, OccasionType } from "../../domain";

/**
 * Project Event domain shapes (Task 023).
 *
 * Mirrors migration 0009_project_events.sql / docs/PHYSICAL_DATABASE_PLAN.md
 * §2.8 exactly — no invented fields. `id`, `projectId`, `createdAt`,
 * `updatedAt` are server-owned and never accepted as create/update input.
 */
export interface ProjectEventRecord {
  id: string;
  projectId: string;
  occasionType: OccasionType;
  side: EventSide;
  title: string;
  startsAt: string;
  timezone: string;
  venueName: string | null;
  address: string | null;
  mapUrl: string | null;
  description: string | null;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The full set of editable columns — exactly the fields the
 * create_project_event / update_project_event business actions accept.
 * Both create and update are full-resource operations (task §4 — mirrors
 * save_wedding_details' "full canonical Save, not field-level autosave"
 * convention, Task 022 §4): every editable column must be present on every
 * request.
 */
export interface ProjectEventInput {
  occasionType: OccasionType;
  side: EventSide;
  title: string;
  startsAt: string;
  timezone: string;
  venueName: string | null;
  address: string | null;
  mapUrl: string | null;
  description: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface CreateProjectEventResult {
  event: ProjectEventRecord;
}

/** Stable operation label returned by the update business action (CLAUDE.md §34 / API_CONTRACT.md §7). */
export type UpdateProjectEventOperation = "UPDATED";

/**
 * `operation` is null exactly when `changed` is false (no-op update — task
 * §7).
 */
export interface UpdateProjectEventResult {
  event: ProjectEventRecord;
  changed: boolean;
  operation: UpdateProjectEventOperation | null;
}
