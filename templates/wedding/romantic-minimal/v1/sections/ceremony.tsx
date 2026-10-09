import type { ReactNode } from "react";

import {
  deriveEventDateTimePresentationV1,
  type EventDateTimePresentationV1,
} from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel, ViewModelCeremonyCard } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";
import { formatDottedDate } from "./date-text";
import { Ornament } from "./invite";

const COPY = ROMANTIC_MINIMAL_V1_COPY;

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function ReceptionSide({ card, index }: { card: ViewModelCeremonyCard; index: number }) {
  const { event } = card;
  const when = deriveEventDateTimePresentationV1(event);
  const label = COPY.identity.labelBySide[card.side];
  return (
    <li className={styles.receptionSide} data-side={card.side} data-index={index}>
      <div className={styles.receptionSideLabel}>{label}</div>
      <div className={styles.receptionSubtitle}>{COPY.reception.titleBySide[card.side]}</div>
      <div className={styles.receptionTime}>
        {when.time} · {when.weekday} · {formatDottedDate(when)}
      </div>
      {present(event.venueName) ? <div className={styles.receptionVenue}>{event.venueName}</div> : null}
      {present(event.address) ? <div className={styles.receptionAddress}>{event.address}</div> : null}
      {event.mapUrl !== null ? (
        <a className={styles.receptionDirections} href={event.mapUrl} target="_blank" rel="noopener noreferrer">
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
  /** The countdown island, when `capabilities.clock` exists. */
  countdown: ReactNode;
}

/**
 * Task 029 ceremony block on the blush gradient: the typeset rite
 * (`ceremony.title` verbatim, RF-05C weekday / time | DAY | year / month,
 * the verbatim lunar text beside "Tức ngày", omitted when absent), the
 * countdown, then one soft reception panel per `viewModel.ceremonyCards`
 * entry in the given order (COMMON both sides, GROOM/BRIDE that side only):
 * side label and rite subtitle by the card's explicit side, "HH:mm ·
 * weekday · DD.MM.YYYY" from the event's own timezone, canonical venue and
 * address, and directions only for a canonical `mapUrl`.
 */
export function Ceremony({ ceremony, ceremonyDate, cards, countdown }: CeremonyProps) {
  const lunar = ceremony.lunarDateDisplay;
  return (
    <section className={styles.ceremonySection} aria-labelledby="rm-rite-title">
      <div className={styles.rite}>
        <div className={styles.riteHeading}>
          <h2 id="rm-rite-title" className={styles.riteTitle}>
            {ceremony.title}
          </h2>
          <Ornament className={styles.riteOrnament} />
          <div className={styles.riteWeekday}>{ceremonyDate.weekday}</div>
        </div>
        <div className={styles.riteDate}>
          <span className={styles.riteTime}>{ceremonyDate.time}</span>
          <span className={styles.riteDay}>{ceremonyDate.day}</span>
          <span className={styles.riteYear}>{ceremonyDate.year}</span>
          <span className={styles.riteMonth}>
            {COPY.ceremony.monthPrefix} {ceremonyDate.month}
          </span>
        </div>
        {lunar !== null && lunar.trim().length > 0 ? (
          <div className={styles.riteLunarWrap}>
            <div className={styles.riteLunar} data-lunar="present">
              (<span>{COPY.ceremony.lunarLabel}</span> <span>{lunar}</span>)
            </div>
          </div>
        ) : null}
      </div>
      {countdown}
      {cards.length > 0 ? (
        <ol className={styles.reception} aria-label={COPY.reception.heading}>
          {cards.map((card, index) => (
            <ReceptionSide key={card.event.id} card={card} index={index} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}
