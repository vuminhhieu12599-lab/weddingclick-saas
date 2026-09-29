import {
  civilFromDays,
  daysFromCivil,
  mondayFirstWeekdayIndex,
  parseCanonicalInstantEpochMs,
  resolveCivilDateTime,
} from "./civil-date-time";
import type { InvitationViewModel } from "./invitation-view-model-types";

/**
 * Invitation Rendering Foundation RF-05C — shared pure ceremony month grid
 * (docs/DECISIONS.md RF-05 clarification K33–K34).
 *
 * The month is the ceremony's civil month in `viewModel.ceremony.timezone`.
 * Monday-first, always 6 rows × 7 columns = 42 cells in row-major order,
 * stepped with integer civil-day arithmetic (no Date objects).
 */

export interface CeremonyMonthGridCellV1 {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  readonly day: number;
  readonly inCeremonyMonth: boolean;
  readonly isCeremonyDay: boolean;
}

export interface CeremonyMonthGridV1 {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  /** Exactly 42 cells; cell 0 is the Monday on or before the 1st. */
  readonly cells: readonly CeremonyMonthGridCellV1[];
}

const GRID_CELL_COUNT = 42;

/** Invalid ceremony timestamp/timezone or a broken grid invariant throws `RangeError`. */
export function deriveCeremonyMonthGridV1(viewModel: Pick<InvitationViewModel, "ceremony">): CeremonyMonthGridV1 {
  const { startsAt, timezone } = viewModel.ceremony;
  const ceremony = resolveCivilDateTime(parseCanonicalInstantEpochMs(startsAt), timezone);

  const firstOfMonthDays = daysFromCivil(ceremony.year, ceremony.month, 1);
  const gridStartDays = firstOfMonthDays - mondayFirstWeekdayIndex(firstOfMonthDays);

  const cells: CeremonyMonthGridCellV1[] = [];
  for (let offset = 0; offset < GRID_CELL_COUNT; offset += 1) {
    const civil = civilFromDays(gridStartDays + offset);
    const inCeremonyMonth = civil.year === ceremony.year && civil.month === ceremony.month;
    cells.push({
      year: civil.year,
      month: civil.month,
      day: civil.day,
      inCeremonyMonth,
      isCeremonyDay: inCeremonyMonth && civil.day === ceremony.day,
    });
  }

  const marked = cells.filter((cell) => cell.isCeremonyDay);
  if (marked.length !== 1 || !marked[0].inCeremonyMonth) {
    throw new RangeError("ceremony month grid must mark exactly one in-month ceremony day");
  }

  return { year: ceremony.year, month: ceremony.month, cells };
}
