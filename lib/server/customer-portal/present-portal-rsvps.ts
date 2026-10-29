import { requiredInvitationVariantsForPackage, RSVP_ATTENDANCE_STATUSES, type InvitationVariant, type RsvpAttendanceStatus } from "../../domain";
import { formatDateTimeVi } from "../../presentation/format-date";
import type {
  CustomerPortalRsvpGroup,
  CustomerPortalRsvpRow,
  CustomerPortalRsvpSummary,
  CustomerPortalRsvpView,
  PortalRsvpRecord,
  PortalRsvpSource,
} from "./customer-portal-types";

function zeroCounts(): Record<RsvpAttendanceStatus, number> {
  return Object.fromEntries(RSVP_ATTENDANCE_STATUSES.map((status) => [status, 0])) as Record<RsvpAttendanceStatus, number>;
}

function nonBlank(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}

/** Responses per status and summed party size per status, from these rows only. */
function summarize(rows: readonly CustomerPortalRsvpRow[]): CustomerPortalRsvpSummary {
  const summary: CustomerPortalRsvpSummary = { responses: zeroCounts(), people: zeroCounts() };
  for (const row of rows) {
    summary.responses[row.attendance] += 1;
    summary.people[row.attendance] += row.partySize;
  }
  return summary;
}

function group(key: CustomerPortalRsvpGroup["key"], rows: readonly CustomerPortalRsvpRow[]): CustomerPortalRsvpGroup {
  return { key, rows: [...rows], summary: summarize(rows) };
}

/** The Project's own published invitations, by id — the only source of a side. */
export interface PortalRsvpSourceContext {
  /** `projects.package_code_snapshot`; an unrecognized package has no view and fails closed. */
  packageCode: string;
  invitationVariantsById: ReadonlyMap<string, InvitationVariant>;
}

/**
 * RSVP-P0-02 — the source of one stored row. Only `rsvps.invitation_id`
 * (0055) attributes a response, and only when it names an invitation of this
 * same Project: a missing id (every pre-0055 row) or an id this Project does
 * not own is `UNKNOWN`, never a guess from the guest's side, the typed name
 * or the row's age.
 */
function sourceOf(record: PortalRsvpRecord, context: PortalRsvpSourceContext): PortalRsvpSource {
  if (record.invitationId === null) return "UNKNOWN";
  return context.invitationVariantsById.get(record.invitationId) ?? "UNKNOWN";
}

/**
 * Task 033D / RSVP-P0-02 — reduce one Project's RSVP rows to the read-only
 * Portal views.
 *
 * - PERSONALIZED (`guest` present): identity is the canonical Guest
 *   `display_name`; the typed snapshot is shown only as a secondary
 *   "responded as" when it differs. One row per guest (0018 unique index).
 * - GENERIC (`guest` null — no guest link, or the guest was deleted and the
 *   FK set NULL): the typed snapshot is all there is. Never deduplicated.
 * - `source` is the invitation the response was recorded against, kept
 *   strictly separate from the personalized guest's own side.
 *
 * Layout follows the Project's agreed package (`requiredInvitationVariantsForPackage`):
 * COMMON keeps the single list unchanged; SEPARATE gets Nhà trai, Nhà gái and
 * Tổng hợp, where the two sides hold exactly the rows attributed to their own
 * link and Tổng hợp holds every stored row once — so an unattributed row is
 * counted, but never on a family's side. An unrecognized package has no
 * documented variant policy and throws rather than guessing a grouping.
 *
 * Order: newest response first by `updated_at`; equal timestamps keep the
 * repository's deterministic `id DESC` order (stable sort). Rows are never
 * recalculated: `party_size` is shown as stored (NOT_ATTENDING is 0).
 */
export function presentPortalRsvps(records: readonly PortalRsvpRecord[], context: PortalRsvpSourceContext): CustomerPortalRsvpView {
  const variants = requiredInvitationVariantsForPackage(context.packageCode);
  if (variants === null) {
    throw new Error("Unsupported package for the portal RSVP view");
  }

  const sorted = [...records].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const rows = sorted.map((record): CustomerPortalRsvpRow => {
    const typed = nonBlank(record.typedName);
    const common = {
      source: sourceOf(record, context),
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

  if (variants.length === 1 && variants[0] === "COMMON") {
    return { layout: "SINGLE", groups: [group("ALL", rows)] };
  }
  return {
    layout: "BY_SIDE",
    groups: [
      group("GROOM", rows.filter((row) => row.source === "GROOM")),
      group("BRIDE", rows.filter((row) => row.source === "BRIDE")),
      group("ALL", rows),
    ],
  };
}
