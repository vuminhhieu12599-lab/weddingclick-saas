import type { ActivityActorType } from "../domain";

/**
 * Staff-facing actor labels for Project Activity history (Task 034B).
 * A STAFF row shows the profile's display name when it still resolves;
 * every other actor type has a fixed label — customer/guest identity is
 * never inferred from other tables.
 */
const ACTIVITY_ACTOR_LABELS_VI: Record<ActivityActorType, string> = {
  STAFF: "Nhân viên",
  CUSTOMER: "Khách hàng",
  GUEST: "Khách mời",
  SYSTEM: "Hệ thống",
};

export function getActivityActorDisplayName(actorType: ActivityActorType, staffDisplayName: string | null): string {
  if (actorType === "STAFF" && staffDisplayName !== null && staffDisplayName.trim() !== "") {
    return staffDisplayName;
  }
  return ACTIVITY_ACTOR_LABELS_VI[actorType];
}
