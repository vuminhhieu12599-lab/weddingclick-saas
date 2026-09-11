import { INVITATION_VARIANTS, type InvitationVariant } from "./invitation-variant";

/**
 * docs/PHYSICAL_DATABASE_PLAN.md §3.A: `project_events.side` reuses the
 * InvitationVariant vocabulary rather than defining an independent set.
 */
export const EVENT_SIDES = INVITATION_VARIANTS;

export type EventSide = InvitationVariant;
