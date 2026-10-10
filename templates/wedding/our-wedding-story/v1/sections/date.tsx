import type { ReactNode } from "react";

import { deriveCeremonyMonthGridV1 } from "../../../../../lib/invitation-rendering/ceremony-month-grid";
import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import styles from "../our-wedding-story-v1.module.css";
import { sundayFirstCalendarCells } from "./calendar-cells";
import { formatDottedDate } from "./date-text";
import { SectionHead } from "./section-head";

const COPY = OUR_WEDDING_STORY_V1_COPY.date;

interface DateProps {
  number: string;
  ceremony: InvitationViewModel["ceremony"];
  ceremonyDate: EventDateTimePresentationV1;
  /** The countdown island, when `capabilities.clock` exists. */
  countdown: ReactNode;
}

/**
 * Visual Freeze v1 "The Date": the champagne panel with "Tháng {M}" and the
 * year, the Sunday-first month grid with the fine double ring on the wedding
 * day, the "weekday · HH:mm · DD.MM.YYYY" caption and the countdown. Month,
 * year, days and layout come only from the shared RF-05C month grid and
 * presentation of the one canonical ceremony instant.
 */
export function DateSection({ number, ceremony, ceremonyDate, countdown }: DateProps) {
  const grid = deriveCeremonyMonthGridV1({ ceremony });
  const cells = sundayFirstCalendarCells(grid);
  return (
    <section className={styles.section} aria-labelledby="ows-date-heading">
      <SectionHead number={number} kicker={COPY.kicker} headingId="ows-date-heading" />

      <div className={styles.datePanel}>
        <div className={styles.dateHeader}>
          <span className={styles.dateMonth}>
            {COPY.monthPrefix} {grid.month}
          </span>
          <span className={styles.dateYear}>{grid.year}</span>
        </div>

        <div
          className={styles.calendar}
          role="group"
          aria-label={`${COPY.calendarLabelPrefix} ${String(grid.month)} ${COPY.yearPrefix} ${String(grid.year)}`}
        >
          {COPY.weekdays.map((weekday) => (
            <span key={weekday} className={styles.calendarWeekday} aria-hidden="true">
              {weekday}
            </span>
          ))}
          {cells.map((cell, index) =>
            cell.kind === "blank" ? (
              <span key={`blank-${String(index)}`} className={styles.calendarBlank} aria-hidden="true" />
            ) : (
              <span
                key={cell.day}
                className={cell.isCeremonyDay ? `${styles.calendarDay} ${styles.calendarDayActive}` : styles.calendarDay}
                aria-current={cell.isCeremonyDay ? "date" : undefined}
                data-ceremony-day={cell.isCeremonyDay ? "true" : undefined}
              >
                {cell.day}
              </span>
            ),
          )}
        </div>

        <div className={styles.dateCaption}>
          {ceremonyDate.weekday} · {ceremonyDate.time} · {formatDottedDate(ceremonyDate)}
        </div>

        {countdown}
      </div>
    </section>
  );
}
