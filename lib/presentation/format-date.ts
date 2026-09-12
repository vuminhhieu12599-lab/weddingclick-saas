/**
 * Vietnamese-friendly display formatting for admin record timestamps
 * (created/updated/deadline). Uses `Intl` exclusively so weekday/month/year
 * are always derived from the canonical timestamp, never hard-coded
 * (CLAUDE.md §7). This formats generic project record timestamps, not
 * wedding ceremony date/time — that derivation belongs to the wedding
 * domain resolver (docs/ARCHITECTURE.md §12), not the admin UI.
 */
const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function formatDateVi(iso: string | null): string {
  if (!iso) {
    return "Chưa có";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Chưa có";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: DEFAULT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateTimeVi(iso: string | null): string {
  if (!iso) {
    return "Chưa có";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Chưa có";
  }

  // Composed from formatDateVi + a separate time-only format (rather than one
  // combined Intl.DateTimeFormat call) so date-then-time ordering is stable
  // across ICU/Node versions instead of depending on locale part ordering.
  const time = new Intl.DateTimeFormat("vi-VN", {
    timeZone: DEFAULT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  return `${formatDateVi(iso)} ${time}`;
}
