import { RSVP_ATTENDANCE_STATUSES, type RsvpAttendanceStatus } from "../../domain";
import { formatDateTimeVi } from "../../presentation/format-date";
import type { CustomerPortalRsvpRow, CustomerPortalRsvpSummary, PortalRsvpRecord } from "./customer-portal-types";

function zeroCounts(): Record<RsvpAttendanceStatus, number> {
  return Object.fromEntries(RSVP_ATTENDANCE_STATUSES.map((status) => [status, 0])) as Record<RsvpAttendanceStatus, number>;
}

function nonBlank(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Task 033D — reduce one Project's RSVP rows to the read-only Portal list.
 *
 * - PERSONALIZED (`guest` present): identity is the canonical Guest
 *   `display_name`; the typed snapshot is shown only as a secondary
 *   "responded as" when it differs. One row per guest (0018 unique index).
 * - GENERIC (`guest` null — no guest link, or the guest was deleted and the
 *   FK set NULL): the typed snapshot is all there is. Never deduplicated.
 *
 * Order: newest response first by `updated_at`; equal timestamps keep the
 * repository's deterministic `id DESC` order (stable sort). Rows are never
 * recalculated: `party_size` is shown as stored (NOT_ATTENDING is 0).
 */
export function presentPortalRsvps(records: readonly PortalRsvpRecord[]): { rows: CustomerPortalRsvpRow[]; summary: CustomerPortalRsvpSummary } {
  const sorted = [...records].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  const summary: CustomerPortalRsvpSummary = { responses: zeroCounts(), people: zeroCounts() };
  const rows = sorted.map((record): CustomerPortalRsvpRow => {
    summary.responses[record.attendance] += 1;
    summary.people[record.attendance] += record.partySize;

    const typed = nonBlank(record.typedName);
    const common = {
      attendance: record.attendance,
      partySize: record.partySize,
      message: nonBlank(record.message),
      respondedAt: formatDateTimeVi(record.updatedAt),
    };
    if (record.guest !== null) {
      return {
        kind: "PERSONALIZED",
        guestName: record.guest.displayName,
        respondedAs: typed !== null && typed !== record.guest.displayName.trim() ? typed : null,
        invitationVariant: record.guest.invitationVariant,
        ...common,
      };
    }
    return { kind: "GENERIC", guestName: typed ?? "Khách mời", respondedAs: null, invitationVariant: null, ...common };
  });

  return { rows, summary };
}
