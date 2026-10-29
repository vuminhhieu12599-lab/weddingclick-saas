import {
  deriveEventDateTimePresentationV1,
  type EventDateTimePresentationV1,
} from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type {
  InvitationViewModel,
  ViewModelCeremonyCard,
} from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { SE_DUYEN_V2_COPY } from "../copy";
import styles from "../se-duyen-v2.module.css";
import { formatDottedDate } from "./date-text";

const COPY = SE_DUYEN_V2_COPY;

function present(value: string | null): value is string {
  return value !== null && value.trim() !== "";
}

/** Only a real web address is ever offered as a directions link — never a dead one. */
function isWebUrl(value: string | null): value is string {
  return value !== null && /^https?:\/\//i.test(value.trim());
}

/**
 * One operational side's own rite, on the section's gold hairline rather
 * than in a card.
 *
 * Each side keeps its OWN instant, venue, address and map: nothing is shared
 * between the sides, nothing is derived from the headline rite above, and
 * nothing is substituted from the other side. The day of the headline rite
 * is already printed above, so a card on the same day shows its hour alone
 * and only a different day repeats the full date.
 *
 * On a single-side invitation the side label and the title are left off:
 * the section heading above already carries that side's rite title, and
 * repeating it would say the same thing twice. On COMMON both rows are
 * labelled and titled, each from the card's own explicit side.
 */
function CeremonyCardRow({
  card,
  multiSide,
  ceremonyDate,
}: {
  readonly card: ViewModelCeremonyCard;
  readonly multiSide: boolean;
  readonly ceremonyDate: EventDateTimePresentationV1;
}) {
  const { event } = card;
  const when = deriveEventDateTimePresentationV1(event);
  const sameDay = when.day === ceremonyDate.day && when.month === ceremonyDate.month && when.year === ceremonyDate.year;

  return (
    <div className={styles.ritePartyRow} data-side={card.side}>
      {multiSide ? <p className={styles.ritePartySide}>{COPY.sideLabel[card.side]}</p> : null}
      {multiSide ? <p className={styles.ritePartyTitle}>{card.title}</p> : null}

      <p className={styles.ritePartyWhen}>
        <span className={styles.ritePartyTime}>{when.time}</span>
        {sameDay ? null : (
          <span className={styles.ritePartyDate}>
            {when.weekday}, {formatDottedDate(when)}
          </span>
        )}
      </p>

      {present(event.venueName) ? <p className={styles.ritePartyVenue}>{event.venueName}</p> : null}
      {present(event.address) ? <p className={styles.ritePartyAddress}>{event.address}</p> : null}
      {isWebUrl(event.mapUrl) ? (
        <a
          className={styles.ritePartyDirections}
          href={event.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={
            multiSide
              ? `${COPY.ceremony.directionsTo} ${present(event.venueName) ? event.venueName : COPY.sideLabel[card.side]}`
              : undefined
          }
        >
          {COPY.ceremony.directions}
        </a>
      ) : null}
    </div>
  );
}

interface CeremonyProps {
  /** `viewModel.ceremony.title` — the variant resolver's own value, verbatim. */
  readonly ceremonyTitle: string;
  /** Every part derived from the one canonical ceremony instant (RF-05C). */
  readonly ceremonyDate: EventDateTimePresentationV1;
  /** The hosting family: `families.primary`, i.e. the side the rite is announced at. */
  readonly hostFamily: InvitationViewModel["families"]["primary"];
  readonly cards: readonly ViewModelCeremonyCard[];
}

/**
 * The approved ceremony page: the open ivory page itself, with the date set
 * as the three-cell rail Vietnamese wedding stationery uses — month | day |
 * year — so the day and the rite title carry the section and nothing is
 * boxed.
 *
 * WEEKDAY, DAY, MONTH, YEAR AND HOUR ALL COME FROM THE ONE CANONICAL
 * INSTANT through the shared RF-05C derivation: nothing here is written by
 * hand and there is no second parse (CLAUDE.md §7).
 *
 * The rite itself is held at the hosting family's home, and which side hosts
 * it is a variant rule answered by the central resolver (`families.primary`:
 * the groom's side for COMMON and GROOM, the bride's for BRIDE). No map link
 * here — the canonical contract carries a map for an event venue, not for a
 * family home, and one is never invented.
 */
export function Ceremony({ ceremonyTitle, ceremonyDate, hostFamily, cards }: CeremonyProps) {
  const hostAddress = hostFamily.address?.trim() ?? "";
  const multiSide = cards.length > 1;

  return (
    <section className={styles.rite} aria-labelledby="sd-rite-title">
      <div className={styles.riteSeam} aria-hidden="true" />
      <span className={styles.riteWatermark} aria-hidden="true" />

      <div className={styles.riteHead}>
        <p className={styles.riteEyebrow}>{COPY.ceremony.eyebrow}</p>
        <h2 className={styles.riteTitle} id="sd-rite-title">
          {ceremonyTitle}
        </h2>
        <span className={styles.riteRule} aria-hidden="true" />
      </div>

      <div className={styles.riteWhen}>
        <span className={styles.riteWeekday}>{ceremonyDate.weekday}</span>

        <span className={styles.riteRail}>
          <span className={styles.riteRailSide}>
            {COPY.ceremony.monthPrefix} {ceremonyDate.month}
          </span>
          <span className={styles.riteRailDivider} aria-hidden="true" />
          <span className={styles.riteDay}>{ceremonyDate.day}</span>
          <span className={styles.riteRailDivider} aria-hidden="true" />
          <span className={styles.riteRailSide}>{ceremonyDate.year}</span>
        </span>

        <span className={styles.riteTime}>{ceremonyDate.time}</span>
      </div>

      <div className={styles.riteVenue}>
        <span className={styles.riteVenueLabel}>{COPY.ceremony.venueLabel}</span>
        <p className={styles.riteVenueName}>
          {COPY.ceremony.homePrefix} {COPY.sideLabel[hostFamily.side]}
        </p>
        {hostAddress === "" ? null : <p className={styles.riteVenueAddress}>{hostAddress}</p>}
      </div>

      {cards.length === 0 ? null : (
        <div className={styles.riteParties}>
          {cards.map((card) => (
            <CeremonyCardRow key={card.event.id} card={card} multiSide={multiSide} ceremonyDate={ceremonyDate} />
          ))}
        </div>
      )}
    </section>
  );
}
