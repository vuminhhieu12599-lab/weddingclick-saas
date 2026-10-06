import type { ActivityActionType, ActivityActorType } from "../../domain";

/**
 * Safe staff projection of one `activity_logs` row (migration 0020;
 * Task 034B). Never carries `project_id`, `actor_profile_id` or `metadata`.
 */
export interface ProjectActivityRecord {
  id: string;
  actionType: ActivityActionType;
  /** The stored one-liner written by the trusted business action — never rebuilt. */
  summary: string;
  actorType: ActivityActorType;
  actorDisplayName: string;
  createdAt: string;
}

export interface ProjectActivityPage {
  items: ProjectActivityRecord[];
  /** Opaque continuation key for older rows; `null` when there are none. */
  nextCursor: string | null;
}

/** Validated row as read by the gateway (staff name already resolved, no UUIDs beyond the row id). */
export interface ProjectActivityRow {
  id: string;
  actionType: ActivityActionType;
  summary: string;
  actorType: ActivityActorType;
  /** `profiles.display_name` for a STAFF row whose profile still resolves, else `null`. */
  staffDisplayName: string | null;
  createdAt: string;
}

/** Keyset position: rows strictly older than (createdAt, id) in `created_at DESC, id DESC` order. */
export interface ActivityCursor {
  createdAt: string;
  id: string;
}
