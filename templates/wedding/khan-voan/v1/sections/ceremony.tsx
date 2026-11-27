import type { ReactNode } from "react";

import { deriveCeremonyMonthGridV1 } from "../../../../../lib/invitation-rendering/ceremony-month-grid";
import {
  deriveEventDateTimePresentationV1,
  type EventDateTimePresentationV1,
} from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel, ViewModelCeremonyCard } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { KHAN_VOAN_V1_COPY } from "../copy";
import styles from "../khan-voan-v1.module.css";
import { Heart } from "./decor";

const COPY = KHAN_VOAN_V1_COPY;

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

type CalendarCell = { readonly kind: "blank"; readonly key: string } | { readonly kind: "day"; readonly key: string; readonly day: number; readonly isCeremonyDay: boolean };

/** Monday-first month cells from the shared month grid (the grid itself is Monday-first). */
function monthCells(ceremony: InvitationViewModel["ceremony"]): { month: number; year: number; cells: CalendarCell[] } {
  const grid = deriveCeremonyMonthGridV1({ ceremony });
  const firstInMonth = grid.cells.findIndex((cell) => cell.inCeremonyMonth);
  const blanks: CalendarCell[] = Array.from({ length: Math.max(0, firstInMonth) }, (_, index) => ({ kind: "blank", key: `b${String(index)}` }));
  const days: CalendarCell[] = grid.cells
    .filter((cell) => cell.inCeremonyMonth)
    .map((cell) => ({ kind: "day", key: `d${String(cell.day)}`, day: cell.day, isCeremonyDay: cell.isCeremonyDay }));
  return { month: grid.month, year: grid.year, cells: [...blanks, ...days] };
}

function Calendar({ ceremony }: { ceremony: InvitationViewModel["ceremony"] }) {
  const { month, year, cells } = monthCells(ceremony);
  return (
    <div className={`${styles.calendar} ${styles.reveal}`}>
      <p className={styles.calendarHead}>
        {COPY.calendar.monthPrefix} {month}, {year}
      </p>
      <div className={styles.calendarGrid} role="presentation">
        {COPY.calendar.weekdays.map((weekday) => (
          <span key={weekday} className={styles.calendarWeekday} aria-hidden="true">
            {weekday}
          </span>
        ))}
        {cells.map((cell) =>
          cell.kind === "blank" ? (
            <span key={cell.key} aria-hidden="true" />
          ) : cell.isCeremonyDay ? (
            <span key={cell.key} className={styles.calendarDay} data-ceremony-day="true">
              <Heart className={styles.calendarHeart} />
              <span className={styles.srOnly}>{COPY.calendar.weddingDay} </span>
              {cell.day}
            </span>
          ) : (
            <span key={cell.key} className={styles.calendarDay} aria-hidden="true">
              {cell.day}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function ReceptionCard({ card }: { card: ViewModelCeremonyCard }) {
  const { event } = card;
  const when = deriveEventDateTimePresentationV1(event);
  const label = COPY.families.labelBySide[card.side];
  return (
    <li className={`${styles.card} ${styles.reveal}`} data-side={card.side}>
      <p className={styles.sideLabel}>{label}</p>
      <p className={styles.cardTitle}>
        {COPY.reception.titlePrefix} {card.title}
      </p>
      <span className={styles.cardRule} aria-hidden="true" />
      <p className={styles.cardTime}>{when.time}</p>
      <p className={styles.cardDate}>
        {when.weekday} · {when.day}/{when.month}/{when.year}
      </p>
      {present(event.venueName) ? (
        <p className={styles.cardVenue}>
          {event.venueName}
          {present(event.address) ? <span>{event.address}</span> : null}
        </p>
      ) : present(event.address) ? (
        <p className={styles.cardVenue}>
          <span>{event.address}</span>
        </p>
      ) : null}
      {event.mapUrl !== null ? (
        <a className={styles.button} href={event.mapUrl} target="_blank" rel="noopener noreferrer">
          {COPY.reception.mapLink}
          <span className={styles.srOnly}> · {label}</span>
        </a>
      ) : null}
    </li>
  );
}

interface CeremonyProps {
  ceremony: InvitationViewModel["ceremony"];
  ceremonyDate: EventDateTimePresentationV1;
  cards: readonly ViewModelCeremonyCard[];
  countdown: ReactNode;
}

export function Ceremony({ ceremony, ceremonyDate, cards, countdown }: CeremonyProps) {
  const lunar = ceremony.lunarDateDisplay;
  return (
    <section className={`${styles.section} ${styles.ceremony}`} aria-labelledby="kv-rite-title">
      <h2 id="kv-rite-title" className={`${styles.eyebrow} ${styles.reveal}`}>
        {ceremony.title}
      </h2>
      <p className={`${styles.bigDate} ${styles.reveal}`}>
        <span className={styles.foil}>{ceremonyDate.day}</span>
        <b>
          {COPY.ceremony.monthPrefix} {Number(ceremonyDate.month)} · {ceremonyDate.year}
        </b>
      </p>
      <p className={`${styles.dateLine} ${styles.reveal}`}>
        {ceremonyDate.weekday}, {COPY.ceremony.at} {ceremonyDate.time}
      </p>
      {lunar !== null && lunar.trim().length > 0 ? (
        <p className={`${styles.lunar} ${styles.reveal}`}>
          ({COPY.ceremony.lunarLabel} {lunar})
        </p>
      ) : null}
      <Calendar ceremony={ceremony} />
      {countdown}
      {cards.length > 0 ? (
        <ol className={styles.cards} aria-label={COPY.reception.heading}>
          {cards.map((card) => (
            <ReceptionCard key={card.event.id} card={card} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}
