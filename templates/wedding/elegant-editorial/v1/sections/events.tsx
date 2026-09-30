import { deriveEventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel, ViewModelEvent } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { formatDottedDate } from "./date-text";

const COPY = ELEGANT_EDITORIAL_V1_COPY;

/** Design Baseline A1 ✦ ornament (served from the immutable v1 decor path, P6). */
const SPARKLE_SRC = "/renderers/wedding/elegant-editorial/v1/ornament-sparkle.svg";

interface EventsProps {
  variant: InvitationViewModel["variant"];
  events: readonly ViewModelEvent[];
}

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function Sparkle({ tight }: { tight: boolean }) {
  return (
    <div className={styles.ornamentPause} data-tight={tight ? "true" : undefined} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed v1 decor file, rendered at its designed size */}
      <img className={styles.ornamentGlyph} src={SPARKLE_SRC} alt="" width={16} height={16} loading="lazy" decoding="async" />
    </div>
  );
}

function EventCard({ event, variant }: { event: ViewModelEvent; variant: InvitationViewModel["variant"] }) {
  const when = deriveEventDateTimePresentationV1(event);
  const place = present(event.venueName) ? event.venueName : event.title;
  // Design Baseline D6: a side tag only in COMMON, and only on a GROOM/BRIDE-side event.
  const tagSide = variant === "COMMON" && event.side !== "COMMON" ? event.side : null;

  return (
    <li className={styles.eventCard} data-side={event.side}>
      {tagSide !== null ? <p className={styles.eventTag}>{COPY.families.labelBySide[tagSide]}</p> : null}
      <h3 className={styles.eventTitle}>{event.title}</h3>
      <div className={styles.eventWhen}>
        <p className={styles.eventTime}>
          {when.time} - {when.weekday}
        </p>
        <p className={styles.eventDate}>{formatDottedDate(when)}</p>
      </div>
      {present(event.venueName) || present(event.address) ? (
        <div className={styles.eventVenue}>
          {present(event.venueName) ? <p className={styles.eventVenueName}>{event.venueName}</p> : null}
          {present(event.address) ? <p className={styles.eventAddress}>{event.address}</p> : null}
        </div>
      ) : null}
      {event.mapUrl !== null ? (
        <a className={styles.eventMapLink} href={event.mapUrl} target="_blank" rel="noopener noreferrer">
          {COPY.events.mapLink}
          <span className={styles.srOnly}>: {place}</span>
        </a>
      ) : null}
    </li>
  );
}

/**
 * Task029 event cards inside the ceremony band (Design Baseline B5 item 11),
 * in the ViewModel's order (RF2): canonical title, "HH:mm - Weekday", the
 * dotted date, venue and address from RF-05C / canonical data in the event's
 * own timezone. A map link exists only when that event's canonical `mapUrl`
 * exists (server-side validated https URL); none is ever fabricated. No lunar
 * text on events (RF6). The section heading is an accessible name only.
 *
 * The block ends with the two consecutive ✦ ornaments of the frozen root
 * order (Events → ✦ → ✦ → Countdown): Task029's Timeline between them is
 * removed by contract (P7), and both ornaments are kept on purpose.
 */
export function Events({ variant, events }: EventsProps) {
  return (
    <section className={styles.events} aria-labelledby="ee-events-heading">
      <h2 id="ee-events-heading" className={styles.srOnly}>
        {COPY.events.heading}
      </h2>
      <ol className={styles.eventList}>
        {events.map((event) => (
          <EventCard key={event.id} event={event} variant={variant} />
        ))}
      </ol>
      <Sparkle tight={false} />
      <Sparkle tight />
    </section>
  );
}
