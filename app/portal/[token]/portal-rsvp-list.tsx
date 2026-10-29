import type { InvitationVariant, RsvpAttendanceStatus } from "../../../lib/domain";
import type {
  CustomerPortalRsvpGroup,
  CustomerPortalRsvpRow,
  CustomerPortalRsvpView,
  PortalRsvpSource,
} from "../../../lib/server/customer-portal/customer-portal-types";

const ATTENDANCE_LABELS: Readonly<Record<RsvpAttendanceStatus, string>> = {
  ATTENDING: "Sẽ tham dự",
  MAYBE: "Có thể tham dự",
  NOT_ATTENDING: "Không tham dự",
};

const ATTENDANCE_STYLES: Readonly<Record<RsvpAttendanceStatus, string>> = {
  ATTENDING: "bg-emerald-50 text-emerald-800",
  MAYBE: "bg-amber-50 text-amber-800",
  NOT_ATTENDING: "bg-stone-100 text-stone-700",
};

const GUEST_VARIANT_LABELS: Readonly<Record<InvitationVariant, string>> = {
  COMMON: "thiệp chung",
  GROOM: "thiệp nhà trai",
  BRIDE: "thiệp nhà gái",
};

/**
 * RSVP-P0-02 — where the response came from, as recorded by the database.
 * `UNKNOWN` is said plainly: a response stored before the source was
 * recorded is never shown as belonging to either family.
 */
const SOURCE_LABELS: Readonly<Record<PortalRsvpSource, string>> = {
  COMMON: "Phản hồi từ link chung",
  GROOM: "Phản hồi từ link thiệp nhà trai",
  BRIDE: "Phản hồi từ link thiệp nhà gái",
  UNKNOWN: "Chưa xác định nguồn",
};

/** RSVP-P0-02 — the heading of each view of a SEPARATE Project's responses. */
const GROUP_LABELS: Readonly<Record<CustomerPortalRsvpGroup["key"], string>> = {
  GROOM: "Nhà trai",
  BRIDE: "Nhà gái",
  ALL: "Tổng hợp",
};

const SUMMARY_ORDER: readonly RsvpAttendanceStatus[] = ["ATTENDING", "MAYBE", "NOT_ATTENDING"];

function RsvpSummary({ group }: { group: CustomerPortalRsvpGroup }) {
  return (
    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
      {SUMMARY_ORDER.map((status) => (
        <div key={status} className={`rounded-xl px-2 py-2 ${ATTENDANCE_STYLES[status]}`} data-portal-rsvp-summary={status}>
          <dt className="text-xs">{ATTENDANCE_LABELS[status]}</dt>
          <dd className="text-lg font-semibold">{group.summary.responses[status]}</dd>
          {status !== "NOT_ATTENDING" && <dd className="text-xs">{group.summary.people[status]} người</dd>}
        </div>
      ))}
    </dl>
  );
}

function RsvpRow({ row }: { row: CustomerPortalRsvpRow }) {
  return (
    <li className="py-3" data-portal-rsvp-row={row.kind}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-stone-900">{row.guestName}</p>
          {row.kind === "PERSONALIZED" && (
            <p className="text-xs text-stone-500">{`Khách mời cá nhân${row.invitationVariant === null ? "" : ` · ${GUEST_VARIANT_LABELS[row.invitationVariant]}`}`}</p>
          )}
          <p className="text-xs text-stone-500" data-portal-rsvp-source={row.source}>
            {SOURCE_LABELS[row.source]}
          </p>
          {row.respondedAs !== null && <p className="break-words text-xs text-stone-500">Trả lời với tên: {row.respondedAs}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ATTENDANCE_STYLES[row.attendance]}`}>
          {ATTENDANCE_LABELS[row.attendance]}
          {row.attendance !== "NOT_ATTENDING" && ` · ${row.partySize} người`}
        </span>
      </div>
      {row.message !== null && <p className="mt-2 whitespace-pre-line break-words text-sm text-stone-700">{row.message}</p>}
      <p className="mt-1 text-xs text-stone-400">{row.respondedAt}</p>
    </li>
  );
}

/** One view's summary and responses, or its own friendly empty state. */
function RsvpGroupBody({ group }: { group: CustomerPortalRsvpGroup }) {
  if (group.rows.length === 0) {
    return (
      <p className="mt-2 text-sm text-stone-600" data-portal-rsvp-empty={group.key}>
        Chưa có phản hồi tham dự.
      </p>
    );
  }
  return (
    <>
      <RsvpSummary group={group} />
      <ul className="mt-4 divide-y divide-stone-100">
        {group.rows.map((row, index) => (
          <RsvpRow key={index} row={row} />
        ))}
      </ul>
    </>
  );
}

/**
 * Task 033D / RSVP-P0-02 — read-only RSVP responses of the Portal Project.
 * Presentation only: rows and summaries arrive already scoped, ordered
 * (newest first), attributed and grouped by the server use case. No
 * controls, no client state, no ids.
 *
 * COMMON packages keep the single list. A SEPARATE package shows the three
 * stacked views — Nhà trai, Nhà gái, Tổng hợp — each with its own summary and
 * its own responses, so the two family links are never read as one pile.
 */
export function PortalRsvpList({ view }: { view: CustomerPortalRsvpView }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Phản hồi tham dự" data-portal-rsvps={view.layout}>
      <h2 className="text-sm font-semibold text-stone-900">Phản hồi tham dự</h2>

      {view.layout === "SINGLE" ? (
        view.groups.map((group) => <RsvpGroupBody key={group.key} group={group} />)
      ) : (
        <div className="mt-2 space-y-5">
          {view.groups.map((group) => (
            <div key={group.key} data-portal-rsvp-group={group.key}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{GROUP_LABELS[group.key]}</h3>
              <RsvpGroupBody group={group} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
