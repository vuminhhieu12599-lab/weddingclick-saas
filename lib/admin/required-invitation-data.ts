import type { EventSide, OccasionType } from "../domain";
import { resolveCivilDateTime } from "../invitation-rendering/civil-date-time";
import { WEDDING_VARIANT_RULES } from "../invitation-rendering/wedding-variant-rules";
import type { ProjectEventInput, ProjectEventRecord } from "../server/project-events/project-events-types";
import type {
  SaveWeddingDetailsInput,
  WeddingDetailsRecord,
} from "../server/wedding-details/wedding-details-types";

/**
 * Minimal staff entry for the data the frozen Snapshot builder REQUIRES
 * (build-snapshot-payload.ts S13a + resolve-wedding-domain.ts RF2):
 *   - a wedding_details row with non-blank groom and bride names;
 *   - a visible ceremony event of the variant's ceremony occasion.
 *
 * The side → occasion mapping is read from WEDDING_VARIANT_RULES (GROOM →
 * THANH_HON, BRIDE → VU_QUY), never re-implemented, and one side is never
 * substituted for the other. Saves go through the existing validated
 * internal APIs; the server stays authoritative and does the trimming.
 */

/** Timezone for a NEW event: the DB column default (migration 0009) and CLAUDE.md §7 default. */
export const NEW_EVENT_TIMEZONE = "Asia/Ho_Chi_Minh";

export interface CeremonySlot {
  side: Extract<EventSide, "GROOM" | "BRIDE">;
  occasionType: OccasionType;
  label: string;
}

function slotFor(side: "GROOM" | "BRIDE", familyLabel: string): CeremonySlot {
  const rules = WEDDING_VARIANT_RULES[side];
  return { side, occasionType: rules.ceremonyOccasion, label: `${rules.ceremonyTitle} — ${familyLabel}` };
}

/** Operational order GROOM then BRIDE. */
export const CEREMONY_SLOTS: readonly CeremonySlot[] = [slotFor("GROOM", "Nhà trai"), slotFor("BRIDE", "Nhà gái")];

export type CeremonySlotState =
  | { kind: "NEW" }
  | { kind: "EXISTING"; event: ProjectEventRecord }
  | { kind: "AMBIGUOUS"; count: number };

/** Exact side + occasion match only; with several matches only the side's primary event is editable here. */
export function findCeremonySlotEvent(
  events: readonly ProjectEventRecord[],
  slot: CeremonySlot,
): CeremonySlotState {
  const matches = events.filter((event) => event.side === slot.side && event.occasionType === slot.occasionType);
  if (matches.length === 0) {
    return { kind: "NEW" };
  }
  if (matches.length === 1) {
    return { kind: "EXISTING", event: matches[0] };
  }
  const primary = matches.find((event) => event.isPrimary);
  return primary ? { kind: "EXISTING", event: primary } : { kind: "AMBIGUOUS", count: matches.length };
}

// ---------------------------------------------------------------------------
// Wedding details (names)
// ---------------------------------------------------------------------------

export interface CoupleNamesForm {
  groomName: string;
  brideName: string;
}

const WEDDING_DETAILS_FIELDS = [
  "groomName",
  "brideName",
  "groomFather",
  "groomMother",
  "brideFather",
  "brideMother",
  "groomFamilyAddress",
  "brideFamilyAddress",
  "invitationMessage",
  "loveStory",
  "lunarDateDisplay",
  "additionalNote",
  "groomBankName",
  "groomBankAccountName",
  "groomBankAccountNumber",
  "groomBankQrMediaId",
  "brideBankName",
  "brideBankAccountName",
  "brideBankAccountNumber",
  "brideBankQrMediaId",
] as const satisfies readonly (keyof SaveWeddingDetailsInput)[];

export function coupleNamesFormFrom(details: WeddingDetailsRecord | null): CoupleNamesForm {
  return { groomName: details?.groomName ?? "", brideName: details?.brideName ?? "" };
}

export type BuildResult<T> = { ok: true; body: T } | { ok: false; error: string };

function isBlank(value: string): boolean {
  return value.trim() === "";
}

/**
 * The existing PUT is a full canonical replace, so every other current
 * field is re-sent unchanged (never cleared, never invented); only the two
 * names come from the form.
 */
export function buildWeddingDetailsSaveBody(
  current: WeddingDetailsRecord | null,
  form: CoupleNamesForm,
): BuildResult<SaveWeddingDetailsInput> {
  if (isBlank(form.groomName) || isBlank(form.brideName)) {
    return { ok: false, error: "Cần nhập tên chú rể và tên cô dâu." };
  }
  const body = {} as SaveWeddingDetailsInput;
  for (const field of WEDDING_DETAILS_FIELDS) {
    body[field] = current ? current[field] : null;
  }
  body.groomName = form.groomName;
  body.brideName = form.brideName;
  return { ok: true, body };
}

// ---------------------------------------------------------------------------
// Ceremony event
// ---------------------------------------------------------------------------

export interface CeremonyEventForm {
  title: string;
  /** `YYYY-MM-DD` civil date in the event's timezone. */
  date: string;
  /** `HH:MM` civil time in the event's timezone. */
  time: string;
  venueName: string;
  address: string;
  lunarDateDisplay: string;
  /** Optional directions link, bound to the canonical event `mapUrl`; blank clears it. */
  mapUrl: string;
}

export const EMPTY_CEREMONY_FORM: CeremonyEventForm = {
  title: "",
  date: "",
  time: "",
  venueName: "",
  address: "",
  lunarDateDisplay: "",
  mapUrl: "",
};

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** Displays the canonical instant as civil date/time in the event's own timezone (shared RF-05C machinery). */
export function ceremonyFormFrom(event: ProjectEventRecord): CeremonyEventForm {
  const civil = resolveCivilDateTime(Date.parse(event.startsAt), event.timezone);
  return {
    title: event.title,
    date: `${pad(civil.year, 4)}-${pad(civil.month)}-${pad(civil.day)}`,
    time: `${pad(civil.hour)}:${pad(civil.minute)}`,
    venueName: event.venueName ?? "",
    address: event.address ?? "",
    lunarDateDisplay: event.lunarDateDisplay ?? "",
    mapUrl: event.mapUrl ?? "",
  };
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

/**
 * Converts a civil date/time in an IANA timezone to a canonical UTC
 * instant. Returns null for an impossible date/time or a civil time that
 * does not exist in that timezone (never shifted silently).
 */
export function civilToInstantIso(date: string, time: string, timezone: string): string | null {
  const d = DATE_PATTERN.exec(date);
  const t = TIME_PATTERN.exec(time);
  if (!d || !t) {
    return null;
  }
  const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = asUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const civil = resolveCivilDateTime(instant, timezone);
    const civilAsUtc = Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute);
    instant += asUtc - civilAsUtc;
  }
  const check = resolveCivilDateTime(instant, timezone);
  if (
    check.year !== year ||
    check.month !== month ||
    check.day !== day ||
    check.hour !== hour ||
    check.minute !== minute
  ) {
    return null;
  }
  return new Date(instant).toISOString();
}

function nullable(value: string): string | null {
  return isBlank(value) ? null : value;
}

/**
 * Client-side mirror of the server's map URL rule (validate-project-event-input
 * `parseNullableHttpsUrl`, the 0009 `map_url` CHECK): blank → null, otherwise
 * an absolute https:// URL. Usability only — the server stays authoritative.
 */
function parseMapUrl(value: string): { ok: true; value: string | null } | { ok: false } {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  if (!trimmed.startsWith("https://")) {
    return { ok: false };
  }
  try {
    new URL(trimmed);
  } catch {
    return { ok: false };
  }
  return { ok: true, value: trimmed };
}

/**
 * Full-resource event body for one ceremony slot. side/occasionType always
 * come from the slot (never from the form). The map URL comes from the
 * form (blank clears it). An existing event keeps its timezone, description,
 * sort order and primary flag; a new one uses the migration 0009 column
 * defaults.
 */
export function buildCeremonyEventBody(
  slot: CeremonySlot,
  form: CeremonyEventForm,
  existing: ProjectEventRecord | null,
): BuildResult<ProjectEventInput> {
  if (isBlank(form.title) || isBlank(form.date) || isBlank(form.time)) {
    return { ok: false, error: "Cần nhập tên lễ, ngày và giờ." };
  }
  const timezone = existing?.timezone ?? NEW_EVENT_TIMEZONE;
  const startsAt = civilToInstantIso(form.date, form.time, timezone);
  if (startsAt === null) {
    return { ok: false, error: "Ngày hoặc giờ không hợp lệ." };
  }
  const mapUrl = parseMapUrl(form.mapUrl);
  if (!mapUrl.ok) {
    return { ok: false, error: "Link Google Maps phải là đường dẫn https:// hợp lệ." };
  }
  return {
    ok: true,
    body: {
      occasionType: slot.occasionType,
      side: slot.side,
      title: form.title,
      startsAt,
      timezone,
      venueName: nullable(form.venueName),
      address: nullable(form.address),
      mapUrl: mapUrl.value,
      description: existing?.description ?? null,
      sortOrder: existing?.sortOrder ?? 0,
      isPrimary: existing?.isPrimary ?? false,
      lunarDateDisplay: nullable(form.lunarDateDisplay),
    },
  };
}
