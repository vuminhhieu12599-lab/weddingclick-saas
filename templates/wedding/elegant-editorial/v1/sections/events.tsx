import { deriveEventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { ViewModelEvent } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { formatSlashedDate } from "./date-text";

const COPY = ELEGANT_EDITORIAL_V1_COPY.events;

interface EventsProps {
  events: readonly ViewModelEvent[];
}

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function EventCard({ event }: { event: ViewModelEvent }) {
  const when = deriveEventDateTimePresentationV1(event);
  const place = present(event.venueName) ? event.venueName : event.title;

  return (
    <li className={styles.eventCard}>
      <h3 className={styles.eventTitle}>{event.title}</h3>
      <p className={styles.eventWhen}>
        <span className={styles.eventTime}>{when.time}</span>
        <span className={styles.eventDot} aria-hidden="true">
          ·
        </span>
        <span>{when.weekday}</span>
      </p>
      <p className={styles.eventDate}>{formatSlashedDate(when)}</p>
      {present(event.venueName) ? <p className={styles.eventVenue}>{event.venueName}</p> : null}
      {present(event.address) ? <p className={styles.eventAddress}>{event.address}</p> : null}
      {event.mapUrl !== null ? (
        <a className={styles.eventMapLink} href={event.mapUrl} target="_blank" rel="noopener noreferrer">
          {COPY.mapLink}
          <span className={styles.srOnly}>: {place}</span>
        </a>
      ) : null}
    </li>
  );
}

/**
 * Events in the ViewModel's order (RF2), each with canonical title, venue
 * and address, and date/time from RF-05C in the event's own timezone. A map
 * link exists only when that event's canonical `mapUrl` exists (server-side
 * validated https URL); none is ever fabricated. No lunar text on events
 * (RF6).
 */
export function Events({ events }: EventsProps) {
  return (
    <section className={styles.section} aria-labelledby="ee-events-heading">
      <h2 id="ee-events-heading" className={styles.sectionHeading}>
        {COPY.heading}
      </h2>
      <ol className={styles.eventList}>
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </ol>
    </section>
  );
}
