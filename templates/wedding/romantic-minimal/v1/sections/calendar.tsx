import { deriveCeremonyMonthGridV1 } from "../../../../../lib/invitation-rendering/ceremony-month-grid";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";
import { sundayFirstCalendarCells } from "./calendar-cells";
import { DecorImage } from "./decor";

const COPY = ROMANTIC_MINIMAL_V1_COPY.calendar;

/**
 * Task 029 wedding calendar: one rose card with the florals, the champagne
 * ornament, the fixed intro, the script "Tháng {M}", and the derived month
 * grid (Sunday-first header) with a heart behind the wedding day. Month,
 * year, day and layout come only from the shared RF-05C month grid of the one
 * canonical ceremony instant.
 */
export function Calendar({ ceremony }: { ceremony: InvitationViewModel["ceremony"] }) {
  const grid = deriveCeremonyMonthGridV1({ ceremony });
  const cells = sundayFirstCalendarCells(grid);
  return (
    <section className={styles.calendarSection}>
      <div className={styles.calendarCard}>
        <div className={`${styles.calendarFloral} ${styles.calendarFloralTop}`}>
          <DecorImage decor="floralTopLeft" className={styles.fillImage} />
        </div>
        <div className={`${styles.calendarFloral} ${styles.calendarFloralBottom}`}>
          <DecorImage decor="floralBottomRight" className={styles.fillImage} />
        </div>
        <span className={styles.calendarOrnament} aria-hidden="true">
          <span />
          <span className={styles.calendarOrnamentDot} />
          <span />
        </span>
        <p className={styles.calendarIntro}>
          {COPY.intro[0]}
          <br />
          {COPY.intro[1]}
        </p>
        <div className={styles.calendarMonthWrap}>
          <h2 className={styles.calendarMonth}>
            {COPY.monthPrefix} {grid.month}
          </h2>
        </div>
        <div className={styles.calendarGrid} role="group" aria-label={`${COPY.monthPrefix} ${String(grid.month)} ${COPY.yearPrefix} ${String(grid.year)}`}>
          {COPY.weekdays.map((weekday) => (
            <span key={weekday} className={styles.calendarWeekday}>
              {weekday}
            </span>
          ))}
          {cells.map((cell, index) =>
            cell.kind === "blank" ? (
              <span key={`blank-${String(index)}`} className={styles.calendarCell} />
            ) : cell.isCeremonyDay ? (
              <span key={cell.day} className={styles.calendarCell} aria-label={`${COPY.weddingDay} ${String(cell.day)}`} data-ceremony-day="true">
                <span className={styles.calendarHeart} aria-hidden="true">
                  <svg viewBox="0 0 32 29" className={styles.calendarHeartShape} focusable="false">
                    <path d="M16 28.2C6.6 21.6 1 16.2 1 9.6 1 4.8 4.7 1 9.3 1c2.9 0 5.3 1.5 6.7 3.8C17.4 2.5 19.8 1 22.7 1 27.3 1 31 4.8 31 9.6c0 6.6-5.6 12-15 18.6z" />
                  </svg>
                </span>
                <span className={styles.calendarHeartDay} aria-hidden="true">
                  {cell.day}
                </span>
              </span>
            ) : (
              <span key={cell.day} className={styles.calendarCell}>
                {cell.day}
              </span>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
