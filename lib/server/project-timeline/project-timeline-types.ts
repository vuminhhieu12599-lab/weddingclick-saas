/**
 * One `project_timeline_items` row (migration 0029; docs/PHYSICAL_DATABASE_PLAN.md
 * §2.9a; docs/DECISIONS.md RF7 "Timeline (Product Owner amendment)"): an
 * ordered run-of-show step of the wedding day. Canonical structured content,
 * never derived from project events.
 */
export interface ProjectTimelineItemRecord {
  id: string;
  projectId: string;
  /** Local wall-clock time of the step, minute precision, as `HH:mm` (from TIME(0)). */
  time: string;
  /** Plain-text step label (non-blank, at most 200 characters). */
  label: string;
  /** Staff-authoritative order: sort_order ASC, then id ASC. */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
