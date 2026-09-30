import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { OpeningInteraction } from "../interactive/opening-interaction";
import { formatDottedDate } from "./date-text";

const COPY = ELEGANT_EDITORIAL_V1_COPY.opening;

interface OpeningCoverProps {
  people: InvitationViewModel["people"];
  guest: InvitationViewModel["guest"];
  ceremonyDate: EventDateTimePresentationV1;
}

/**
 * Opening/cover composition (RF-06B static parts). Couple names are the
 * page's single `<h1>`. The envelope artwork and its explicit open/skip
 * controls belong to the RF-06D opening island; the guest line is always
 * rendered inside it. The guest line is presentation text only (RF-03 V1,
 * RF-05 K20); an unpersonalized invitation shows fixed copy.
 */
export function OpeningCover({ people, guest, ceremonyDate }: OpeningCoverProps) {
  return (
    <header className={styles.opening}>
      <div className={styles.openingFrame} aria-hidden="true" />
      <p className={styles.openingLabel}>{COPY.label}</p>
      <h1 className={styles.openingNames}>
        <span className={styles.nameLine}>{people.primary.name}</span>
        <span className={styles.openingAmp} aria-hidden="true">
          &amp;
        </span>
        <span className={styles.srOnly}> &amp; </span>
        <span className={styles.nameLine}>{people.secondary.name}</span>
      </h1>
      <p className={styles.openingDate}>{formatDottedDate(ceremonyDate)}</p>
      <OpeningInteraction>
        <div className={styles.guestLine} data-guest={guest === undefined ? "unpersonalized" : "personalized"}>
          <p className={styles.guestSalutation}>{COPY.salutation}</p>
          <p className={styles.guestName}>{guest === undefined ? COPY.defaultGuest : guest.displayName}</p>
        </div>
      </OpeningInteraction>
    </header>
  );
}
