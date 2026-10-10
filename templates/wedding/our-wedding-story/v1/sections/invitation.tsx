import {
  deriveEventDateTimePresentationV1,
  type EventDateTimePresentationV1,
} from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel, ViewModelCeremonyCard } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import styles from "../our-wedding-story-v1.module.css";
import { formatDottedDate } from "./date-text";
import { SectionHead } from "./section-head";

const COPY = OUR_WEDDING_STORY_V1_COPY;

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function ReceptionCard({ card, multiSide }: { card: ViewModelCeremonyCard; multiSide: boolean }) {
  const { event } = card;
  const when = deriveEventDateTimePresentationV1(event);
  const sideLabel = COPY.sideLabel[card.side];
  return (
    <li className={styles.receptionCard} data-side={card.side}>
      <div className={styles.receptionKicker}>{sideLabel}</div>
      <h3 className={styles.receptionTitle}>{COPY.invitation.receptionTitleBySide[card.side]}</h3>
      <div className={styles.receptionTime}>
        <span className={styles.receptionClock}>{when.time}</span>
        <span>
          {when.weekday}, {formatDottedDate(when)}
        </span>
      </div>
      {present(event.venueName) ? <div className={styles.receptionVenue}>{event.venueName}</div> : null}
      {present(event.address) ? <div className={styles.receptionAddress}>{event.address}</div> : null}
      {event.mapUrl !== null ? (
        <a
          className={styles.directionsLink}
          href={event.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={multiSide && present(event.venueName) ? `${COPY.invitation.directionsTo} ${event.venueName}` : undefined}
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
            <path
              d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.4 4.5 8.5 4.5 8.5s4.5-5.1 4.5-8.5A4.5 4.5 0 0 0 8 1.5zm0 6.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4z"
              fill="currentColor"
            />
          </svg>
          {COPY.invitation.directions}
        </a>
      ) : null}
    </li>
  );
}

interface InvitationProps {
  number: string;
  people: InvitationViewModel["people"];
  ceremony: InvitationViewModel["ceremony"];
  ceremonyDate: EventDateTimePresentationV1;
  cards: readonly ViewModelCeremonyCard[];
  /** The authorized overlay's free-form display name, verbatim; absent → the fixed default line. */
  guestDisplayName: string | undefined;
}

/**
 * Visual Freeze v1 "The Invitation": the framed card with "Trân Trọng Kính
 * Mời", the guest line (overlay `displayName` verbatim, else "Bạn và Gia
 * Đình"), "tới dự", `ceremony.title` verbatim (GROOM/COMMON "Lễ Thành Hôn",
 * BRIDE "Lễ Vu Quy"), the couple in resolver order and the RF-05C date row
 * (weekday | time over day | month / year). Then one reception card per
 * `viewModel.ceremonyCards` entry in the given order, labelled by the card's
 * explicit side, with "HH:mm" and "weekday, DD.MM.YYYY" from that event's own
 * timezone, canonical venue/address, and "Chỉ đường" only for a canonical
 * `mapUrl`. No free-text invitation message (`invitationMessage: false`).
 */
export function Invitation({ number, people, ceremony, ceremonyDate, cards, guestDisplayName }: InvitationProps) {
  const multiSide = cards.length > 1;
  return (
    <section className={`${styles.section} ${styles.invitation}`} aria-labelledby="ows-invitation-heading">
      <SectionHead number={number} kicker={COPY.invitation.kicker} headingId="ows-invitation-heading" />

      <div className={styles.inviteCard}>
        <div className={styles.inviteLead}>
          <div className={styles.inviteSalutation}>{COPY.invitation.salutation}</div>
          <div className={styles.inviteGuest} data-guest={guestDisplayName === undefined ? "default" : "personalized"}>
            {guestDisplayName ?? COPY.invitation.defaultGuest}
          </div>
          <div className={styles.inviteTo}>{COPY.invitation.to}</div>
        </div>

        <h3 className={styles.inviteTitle}>{ceremony.title}</h3>
        <div className={styles.inviteCoupleLine}>
          {people.primary.name} <span className={styles.inviteAmp}>&amp;</span> {people.secondary.name}
        </div>

        <div className={styles.inviteDate}>
          <div className={styles.inviteDateCaption}>{COPY.invitation.dateCaption}</div>
          <div className={styles.inviteDateRow}>
            <span className={styles.inviteDateSide}>{ceremonyDate.weekday}</span>
            <span className={styles.inviteDateCenter}>
              <span className={styles.inviteDateTime}>{ceremonyDate.time}</span>
              <span className={styles.inviteDateDay}>{ceremonyDate.day}</span>
            </span>
            <span className={styles.inviteDateSide}>
              {COPY.invitation.monthPrefix} {ceremonyDate.month}
              <br />
              {ceremonyDate.year}
            </span>
          </div>
        </div>
      </div>

      {cards.length === 0 ? null : (
        <ol className={styles.receptions} data-multi={multiSide ? "true" : undefined} aria-label={COPY.invitation.receptionsLabel}>
          {cards.map((card) => (
            <ReceptionCard key={card.event.id} card={card} multiSide={multiSide} />
          ))}
        </ol>
      )}
    </section>
  );
}
