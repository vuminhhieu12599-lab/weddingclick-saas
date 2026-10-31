import { deriveEventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type {
  ViewModelCeremony,
  ViewModelCeremonyCard,
  ViewModelEvent,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { HONG_AN_V1_COPY } from "../copy";
import styles from "../hong-an-v1.module.css";
import { ArchPanel, SectionHeading } from "./arch";
import { establishesCatholicMass, present, safeMapUrl } from "./event-selection";

const COPY = HONG_AN_V1_COPY.ceremony;

/**
 * Section 06 — the wedding ceremony (HA-TEMPLATE-01).
 *
 * The most important section of the invitation, and the one place where the
 * template has to be careful about what it claims.
 *
 * HOW IT IS LABELLED. The canonical model has no field meaning "this is a
 * Catholic Mass" — `occasionType` only distinguishes VU_QUY, THANH_HON,
 * RECEPTION and CUSTOM. So the heading "Thánh Lễ Hôn Phối" is used only
 * where the Project's own event title establishes a Mass; otherwise the
 * neutral heading stands and each card carries the canonical rite title
 * the resolver produced ("Lễ Thành Hôn" / "Lễ Vu Quy"), unchanged. The
 * template never promotes an ordinary ceremony into a Mass, and never
 * invents a church, a parish or a priest.
 *
 * WHAT IT SHOWS. One card per operational side, from `ceremonyCards`:
 * COMMON gets both, GROOM and BRIDE their own. Each card prints only its
 * own event's canonical date, time, venue and address; a map link appears
 * only for an absolute http(s) URL. Nothing is borrowed from the other
 * side or from the reception.
 *
 * CLAUDE.md §7: weekday, time and date all come from each event's own
 * canonical `startsAt` in its own timezone, through the one shared
 * derivation, so no two lines on this page can disagree.
 */
function CeremonyCard({ card }: { readonly card: ViewModelCeremonyCard }) {
  const { event, title, side } = card;
  const when = deriveEventDateTimePresentationV1(event);
  const venue = present(event.venueName);
  const address = present(event.address);
  const mapUrl = safeMapUrl(event.mapUrl);

  return (
    <ArchPanel className={styles.eventCard}>
      <p className={styles.eventRite} data-side={side}>
        {title}
      </p>
      <p className={styles.eventWeekday}>{when.weekday}</p>
      <p className={styles.eventTime}>
        <time dateTime={event.startsAt}>{when.time}</time>
      </p>
      <p className={styles.eventDate}>
        <time dateTime={event.startsAt}>
          {when.day} · {when.month} · {when.year}
        </time>
      </p>
      {event.lunarDateDisplay === null ? null : <p className={styles.eventLunar}>{event.lunarDateDisplay}</p>}
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

export function Ceremony({
  cards,
  ceremony,
}: {
  readonly cards: readonly ViewModelCeremonyCard[];
  readonly ceremony: ViewModelCeremony;
}) {
  // With no card at all there is no ceremony to announce. The Snapshot
  // cannot be built without a ceremony event, so this is defensive only.
  if (cards.length === 0) return null;

  const heading = establishesCatholicMass(cards) ? COPY.massHeading : COPY.heading;

  return (
    <section className={styles.sectionSacred} aria-labelledby="ha-ceremony-heading" data-reveal="rise">
      <SectionHeading id="ha-ceremony-heading" eyebrow={ceremony.title}>
        {heading}
      </SectionHeading>
      <div className={styles.eventCards} data-count={cards.length}>
        {cards.map((card) => (
          <CeremonyCard key={card.event.id} card={card} />
        ))}
      </div>
    </section>
  );
}

/** Re-exported so the root renderer can keep its event mapping in one place. */
export type { ViewModelEvent };
