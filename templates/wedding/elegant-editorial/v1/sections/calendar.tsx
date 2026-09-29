import type { CeremonyMonthGridV1 } from "../../../../../lib/invitation-rendering/ceremony-month-grid";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { CornerBouquet, HeartMark } from "./decor";

const COPY = ELEGANT_EDITORIAL_V1_COPY.calendar;

const WEEK_LENGTH = 7;

interface CalendarProps {
  grid: CeremonyMonthGridV1;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Ceremony month calendar (P7, K33). The RF-05C Monday-first 42-cell grid is
 * the only source: this component only slices it into its six fixed rows of
 * seven. It never computes a month, weekday, day count or ceremony day of
 * its own. Column headers are fixed Monday → Sunday copy. Exactly one cell
 * is marked, the one the grid marks.
 */
export function Calendar({ grid }: CalendarProps) {
  const rows = Array.from({ length: grid.cells.length / WEEK_LENGTH }, (_, row) =>
    grid.cells.slice(row * WEEK_LENGTH, row * WEEK_LENGTH + WEEK_LENGTH),
  );

  return (
    <section className={styles.section} aria-labelledby="ee-calendar-heading">
      <h2 id="ee-calendar-heading" className={styles.sectionHeading}>
        {COPY.heading}
      </h2>
      <div className={styles.calendarCard}>
        <CornerBouquet className={styles.calendarBouquetStart} />
        <CornerBouquet className={styles.calendarBouquetEnd} />
        <p className={styles.calendarIntro}>{COPY.intro}</p>
        <p className={styles.calendarMonth}>
          {COPY.monthPrefix} {pad2(grid.month)}
        </p>
        <p className={styles.calendarYear}>{grid.year}</p>
        <table className={styles.calendarTable}>
          <thead>
            <tr>
              {COPY.weekdayHeaders.map((header) => (
                <th key={header} scope="col" className={styles.calendarWeekday}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, rowIndex) => (
              <tr key={rowIndex}>
                {cells.map((cell) => (
                  <td
                    key={`${cell.year}-${cell.month}-${cell.day}`}
                    className={
                      cell.isCeremonyDay
                        ? styles.calendarCeremonyDay
                        : cell.inCeremonyMonth
                          ? styles.calendarDay
                          : styles.calendarOutsideDay
                    }
                    data-ceremony-day={cell.isCeremonyDay ? "true" : undefined}
                    data-in-month={cell.inCeremonyMonth ? "true" : "false"}
                  >
                    {cell.isCeremonyDay ? (
                      <>
                        <HeartMark />
                        <span className={styles.calendarCeremonyNumber}>{cell.day}</span>
                        <span className={styles.srOnly}> ({COPY.ceremonyDayNote})</span>
                      </>
                    ) : (
                      cell.day
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
