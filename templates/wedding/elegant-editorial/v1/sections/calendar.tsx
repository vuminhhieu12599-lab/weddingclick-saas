import type { CeremonyMonthGridV1 } from "../../../../../lib/invitation-rendering/ceremony-month-grid";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { decorAssetSrc } from "./decor";

const COPY = ELEGANT_EDITORIAL_V1_COPY.calendar;

const WEEK_LENGTH = 7;

interface CalendarProps {
  grid: CeremonyMonthGridV1;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Task029 calendar card (Design Baseline B5 item 10, P7, K33): the moss card
 * with the two production corner bouquets, the two-line intro, the Great
 * Vibes month (no visible year) and the ceremony day on the static heart.
 *
 * The RF-05C Monday-first 42-cell grid is the only source: this component
 * only slices it into its six fixed rows of seven. It never computes a
 * month, weekday, day count or ceremony day of its own. Column headers are
 * fixed Monday → Sunday copy. Out-of-month cells stay in the grid but are
 * rendered blank. Exactly one cell is marked, the one the grid marks. The
 * heart pulse is RF-06D motion and is not part of this static layer.
 *
 * The bouquets are positioned against the column edges (CSS), so the straight
 * anchor edge of each source image sits flush with the column edge.
 */
export function Calendar({ grid }: CalendarProps) {
  const rows = Array.from({ length: grid.cells.length / WEEK_LENGTH }, (_, row) =>
    grid.cells.slice(row * WEEK_LENGTH, row * WEEK_LENGTH + WEEK_LENGTH),
  );

  return (
    <section className={styles.calendarStage} aria-labelledby="ee-calendar-heading">
      <h2 id="ee-calendar-heading" className={styles.srOnly}>
        {COPY.heading}
      </h2>
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed v1 decor file, rendered at its designed size */}
      <img
        className={styles.calendarBotanicalStart}
        src={decorAssetSrc("calendar-botanical-top-left.webp")}
        alt=""
        aria-hidden="true"
        width={256}
        height={256}
        loading="lazy"
        decoding="async"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed v1 decor file, rendered at its designed size */}
      <img
        className={styles.calendarBotanicalEnd}
        src={decorAssetSrc("calendar-botanical-bottom-right.webp")}
        alt=""
        aria-hidden="true"
        width={256}
        height={256}
        loading="lazy"
        decoding="async"
      />
      <div className={styles.calendarCard}>
        <p className={styles.calendarIntro}>
          {COPY.intro.map((line) => (
            <span key={line} className={styles.calendarIntroLine}>
              {line}
            </span>
          ))}
        </p>
        <p className={styles.calendarMonth}>
          {COPY.monthPrefix} {pad2(grid.month)}
        </p>
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
                    className={cell.isCeremonyDay ? styles.calendarCeremonyDay : styles.calendarDay}
                    data-ceremony-day={cell.isCeremonyDay ? "true" : undefined}
                    data-in-month={cell.inCeremonyMonth ? "true" : "false"}
                  >
                    {cell.isCeremonyDay ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element -- fixed v1 decor file, rendered at its designed size */}
                        <img
                          className={styles.calendarHeart}
                          src={decorAssetSrc("calendar-heart.svg")}
                          alt=""
                          aria-hidden="true"
                          width={32}
                          height={29}
                        />
                        <span className={styles.calendarCeremonyNumber}>{cell.day}</span>
                        <span className={styles.srOnly}> ({COPY.ceremonyDayNote})</span>
                      </>
                    ) : cell.inCeremonyMonth ? (
                      cell.day
                    ) : null}
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
