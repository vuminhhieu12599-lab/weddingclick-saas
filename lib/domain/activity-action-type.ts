/**
 * docs/API_CONTRACT.md §6 — the frozen initial V1 Activity Action Type Union
 * (`activity_logs.action_type`, migration 0020: deliberately a TS union, not
 * a DB CHECK). Do not add to it without an explicit approved task.
 */
export const ACTIVITY_ACTION_TYPES = [
  "CUSTOMER_SUBMISSION_RECEIVED",
  "CANONICAL_DATA_APPLIED",
  "INVITATION_REVIEW_CREATED",
  "REVIEW_LINK_ISSUED",
  "REVISION_REQUESTED",
  "CUSTOMER_APPROVED",
  "PROJECT_MARKED_PAID",
  "INVITATION_PUBLISHED",
  "INVITATION_REPUBLISHED",
  "ACCESS_LINK_REVOKED",
  "ACCESS_LINK_ROTATED",
  "GUEST_IMPORTED",
  "GUEST_REVOKED",
  "STAFF_ASSIGNMENT_CHANGED",
  "PROJECT_STATUS_CHANGED",
  "PROJECT_ARCHIVED",
] as const;

export type ActivityActionType = (typeof ACTIVITY_ACTION_TYPES)[number];

/** migration 0020 `activity_logs.actor_type` CHECK */
export const ACTIVITY_ACTOR_TYPES = ["STAFF", "CUSTOMER", "GUEST", "SYSTEM"] as const;

export type ActivityActorType = (typeof ACTIVITY_ACTOR_TYPES)[number];
