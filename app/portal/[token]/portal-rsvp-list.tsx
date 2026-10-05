import type { InvitationVariant, RsvpAttendanceStatus } from "../../../lib/domain";
import type { CustomerPortalRsvpRow, CustomerPortalRsvpSummary } from "../../../lib/server/customer-portal/customer-portal-types";

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

const SUMMARY_ORDER: readonly RsvpAttendanceStatus[] = ["ATTENDING", "MAYBE", "NOT_ATTENDING"];

/**
 * Task 033D — read-only RSVP list of the Portal Project. Presentation only:
 * rows arrive already scoped, ordered (newest first) and reduced by the
 * server use case. No controls, no ids.
 */
export function PortalRsvpList({ rows, summary }: { rows: readonly CustomerPortalRsvpRow[]; summary: CustomerPortalRsvpSummary }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Phản hồi tham dự" data-portal-rsvps>
      <h2 className="text-sm font-semibold text-stone-900">Phản hồi tham dự</h2>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-stone-600" data-portal-rsvp-empty>
          Chưa có phản hồi tham dự.
        </p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {SUMMARY_ORDER.map((status) => (
              <div key={status} className={`rounded-xl px-2 py-2 ${ATTENDANCE_STYLES[status]}`} data-portal-rsvp-summary={status}>
                <dt className="text-xs">{ATTENDANCE_LABELS[status]}</dt>
                <dd className="text-lg font-semibold">{summary.responses[status]}</dd>
                {status !== "NOT_ATTENDING" && <dd className="text-xs">{summary.people[status]} người</dd>}
              </div>
            ))}
          </dl>

          <ul className="mt-4 divide-y divide-stone-100">
            {rows.map((row, index) => (
              <li key={index} className="py-3" data-portal-rsvp-row={row.kind}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-stone-900">{row.guestName}</p>
                    <p className="text-xs text-stone-500">
                      {row.kind === "PERSONALIZED"
                        ? `Khách mời cá nhân${row.invitationVariant === null ? "" : ` · ${GUEST_VARIANT_LABELS[row.invitationVariant]}`}`
                        : "Phản hồi từ link chung"}
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
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
