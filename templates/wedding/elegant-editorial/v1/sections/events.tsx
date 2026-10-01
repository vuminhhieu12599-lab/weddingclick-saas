import { deriveEventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type {
  InvitationViewModel,
  ViewModelCeremonyCard,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { formatDottedDate } from "./date-text";

const COPY = ELEGANT_EDITORIAL_V1_COPY;

/** Design Baseline A1 ✦ ornament (served from the immutable v1 decor path, P6). */
const SPARKLE_SRC = "/renderers/wedding/elegant-editorial/v1/ornament-sparkle.svg";

interface EventsProps {
  variant: InvitationViewModel["variant"];
  /** `viewModel.ceremonyCards`: the derived presentation list, never `viewModel.events` (RF2). */
  cards: readonly ViewModelCeremonyCard[];
}

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

/** The ✦ ornament pause; `tight` is the Task029 `ornamentPauseTight` that leads into the Countdown. */
export function OrnamentPause({ tight }: { tight: boolean }) {
  return (
    <div className={styles.ornamentPause} data-tight={tight ? "true" : undefined} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed v1 decor file, rendered at its designed size */}
      <img className={styles.ornamentGlyph} src={SPARKLE_SRC} alt="" width={16} height={16} loading="lazy" decoding="async" />
    </div>
  );
}

function EventCard({ card, variant }: { card: ViewModelCeremonyCard; variant: InvitationViewModel["variant"] }) {
  const { event } = card;
  const when = deriveEventDateTimePresentationV1(event);
  const title = COPY.events.ceremonyCardTitleBySide[card.side];
  const place = present(event.venueName) ? event.venueName : title;
  // Design Baseline D6: the "Nhà Trai" / "Nhà Gái" side tag only in COMMON.
  const tagSide = variant === "COMMON" ? card.side : null;

  return (
    <li className={styles.eventCard} data-side={card.side}>
      {tagSide !== null ? <p className={styles.eventTag}>{COPY.families.labelBySide[tagSide]}</p> : null}
      <h3 className={styles.eventTitle}>{title}</h3>
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
 * Task029 ceremony cards inside the ceremony band (Design Baseline B5 item
 * 11): exactly `viewModel.ceremonyCards`, in their order (RF2 "Ceremony-card
 * presentation": one per operational side, GROOM before BRIDE). The template
 * never filters or re-sorts `viewModel.events`. Each card shows the fixed
 * template title for its side's rite ("Tiệc mừng lễ thành hôn" / "Tiệc mừng
 * lễ vu quy", Product Owner ruling), "HH:mm - Weekday", the
 * dotted date, venue and address from RF-05C / canonical data in the event's
 * own timezone. A map link exists only when that event's canonical `mapUrl`
 * exists (server-side validated https URL); none is ever fabricated. No lunar
 * text on events (RF6). The section heading is an accessible name only.
 *
 * The block ends with the first ✦ of the Task029 rhythm (Events → ✦ →
 * Timeline → tight ✦ → Countdown); the Timeline and the tight ✦ are placed
 * by the root (RF7 Timeline amendment).
 */
export function Events({ variant, cards }: EventsProps) {
  return (
    <section className={styles.events} aria-labelledby="ee-events-heading">
      <h2 id="ee-events-heading" className={styles.srOnly}>
        {COPY.events.heading}
      </h2>
      <ol className={styles.eventList}>
        {cards.map((card) => (
          <EventCard key={card.event.id} card={card} variant={variant} />
        ))}
      </ol>
      <OrnamentPause tight={false} />
    </section>
  );
}
