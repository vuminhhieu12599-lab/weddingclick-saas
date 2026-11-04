import { deriveEventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { ViewModelEvent } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { HONG_AN_V2_COPY } from "../copy";
import styles from "../hong-an-v2.module.css";
import { ArchPanel, SectionHeading } from "./arch";
import { present, safeMapUrl } from "./event-selection";

const COPY = HONG_AN_V2_COPY.reception;

/**
 * Section 07 — "Tiệc Mừng Thành Hôn" (HA-TEMPLATE-01).
 *
 * The celebratory counterpart to the church section, and deliberately
 * distinct from it: a warmer surface and a plainer plate, so a guest can
 * tell at a glance which card is the rite and which is the party.
 *
 * It renders only RECEPTION events that the variant actually exposes, each
 * with its own canonical date, time, venue and address. A Project without a
 * reception shows no section at all — the template never assumes the party
 * follows the ceremony, never reuses the church's time or place, and never
 * invents a restaurant.
 */
function ReceptionCard({ event }: { readonly event: ViewModelEvent }) {
  const when = deriveEventDateTimePresentationV1(event);
  const title = present(event.title);
  const venue = present(event.venueName);
  const address = present(event.address);
  const mapUrl = safeMapUrl(event.mapUrl);

  return (
    <ArchPanel tone="warm" className={styles.eventCard}>
      {title === undefined ? null : (
        <p className={styles.eventRite} data-side={event.side}>
          {title}
        </p>
      )}
      <p className={styles.eventWeekday}>{when.weekday}</p>
      <p className={styles.eventTime}>
        <time dateTime={event.startsAt}>{when.time}</time>
      </p>
      <p className={styles.eventDate}>
        <time dateTime={event.startsAt}>
          {when.day} · {when.month} · {when.year}
        </time>
      </p>
      <span className={styles.eventRule} aria-hidden="true" />
      {venue === undefined ? null : <p className={styles.eventVenue}>{venue}</p>}
      {address === undefined ? null : <p className={styles.eventAddress}>{address}</p>}
      {mapUrl === undefined ? null : (
        <a className={styles.eventMap} href={mapUrl} target="_blank" rel="noreferrer noopener">
          {COPY.directions}
        </a>
      )}
    </ArchPanel>
  );
}

export function Reception({ events }: { readonly events: readonly ViewModelEvent[] }) {
  if (events.length === 0) return null;

  return (
    <section className={styles.sectionWarm} aria-labelledby="ha-reception-heading" data-reveal="rise">
      <SectionHeading id="ha-reception-heading">{COPY.heading}</SectionHeading>
      <span className={styles.chalice} aria-hidden="true" />
      <div className={styles.eventCards} data-count={events.length}>
        {events.map((event) => (
          <ReceptionCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}
