import { deriveEventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { ViewModelCeremonyCard } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { formatDottedDate } from "./date-text";

const COPY = VIETNAMESE_HERITAGE_V1_COPY;

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function VenueCard({ card, showSide }: { card: ViewModelCeremonyCard; showSide: boolean }) {
  const { event } = card;
  const when = deriveEventDateTimePresentationV1(event);
  const place = present(event.venueName) ? event.venueName : card.title;

  return (
    <li className={styles.venueBlock} data-side={card.side}>
      {showSide ? <p className={styles.venueSide}>{COPY.ceremonial.labelBySide[card.side]}</p> : null}
      <div className={styles.venueCard}>
        <h3 className={styles.venueTitle}>{card.title}</h3>
        <p className={styles.venueTime}>
          {when.time} - {when.weekday}
        </p>
        <p className={styles.venueDate}>{formatDottedDate(when)}</p>
        {present(event.venueName) || present(event.address) ? <span className={styles.venueRule} aria-hidden="true" /> : null}
        {present(event.venueName) ? <p className={styles.venueName}>{event.venueName}</p> : null}
        {present(event.address) ? <p className={styles.venueAddress}>{event.address}</p> : null}
      </div>
      {event.mapUrl !== null ? (
        <a className={styles.venueMapLink} href={event.mapUrl} target="_blank" rel="noopener noreferrer">
          {COPY.events.mapLink}
          <span className={styles.srOnly}>: {place}</span>
        </a>
      ) : null}
    </li>
  );
}

/**
 * Task 029 reception / venue blocks: exactly `viewModel.ceremonyCards` in
 * their given order (RF2 "Ceremony-card presentation": one per operational
 * side, GROOM before BRIDE). Each shows the card's rite-derived `title`
 * verbatim, RF-05C "HH:mm - Weekday" and date in the event's own timezone,
 * the canonical venue/address, and a map link only for a canonical
 * `mapUrl`. The side label appears only when more than one card exists
 * (COMMON). No lunar text on cards (RF6); `viewModel.events` is never
 * filtered or re-sorted here.
 */
export function Events({ cards }: { cards: readonly ViewModelCeremonyCard[] }) {
  if (cards.length === 0) {
    return null;
  }
  return (
    <section className={styles.events} aria-labelledby="vh-events-heading">
      <h2 id="vh-events-heading" className={styles.srOnly}>
        {COPY.events.heading}
      </h2>
      <ol className={styles.venueList}>
        {cards.map((card) => (
          <VenueCard key={card.event.id} card={card} showSide={cards.length > 1} />
        ))}
      </ol>
    </section>
  );
}
