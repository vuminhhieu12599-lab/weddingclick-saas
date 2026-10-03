import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { OpeningInteraction } from "../interactive/opening-interaction";
import { formatDottedDate } from "./date-text";
import { formatCoupleDisplayName } from "./display-name";

const COPY = ELEGANT_EDITORIAL_V1_COPY.opening;

interface OpeningCoverProps {
  people: InvitationViewModel["people"];
  ceremonyDate: EventDateTimePresentationV1;
  /** Passed through untouched to the RF-06D island, whose card rises only with a `RESOLVED` cover. */
  cover: InvitationViewModel["media"]["cover"];
  /** Passed through untouched to the RF-06D island's explicit envelope activation. */
  onOpen?: () => void;
}

/**
 * Opening/cover composition, RF-06B static parts (Design Baseline B5 items
 * 1–4 and the Task029 cover reading order label → names → date → envelope).
 * Moss surface with the Task029 radial highlight, a gold inset frame, the
 * Task029 label, the couple names on one line with an inline "&" (the page's
 * single `<h1>`) and the dotted date.
 *
 * The envelope artwork, its activation, the hint and the card
 * rise belong to the RF-06D opening island, which receives only the canonical
 * cover it may raise on the card (Design Baseline D3). The guest line is never
 * on the opening (Design Baseline D1): it renders before the invitation
 * message.
 */
export function OpeningCover({ people, ceremonyDate, cover, onOpen }: OpeningCoverProps) {
  return (
    <header className={styles.opening}>
      <div className={styles.openingFrame} aria-hidden="true" />
      <p className={styles.openingLabel}>{COPY.label}</p>
      <h1 className={styles.openingNames}>
        <span className={styles.name}>{formatCoupleDisplayName(people.primary.name)}</span> &amp;{" "}
        <span className={styles.name}>{formatCoupleDisplayName(people.secondary.name)}</span>
      </h1>
      <p className={styles.openingDate}>{formatDottedDate(ceremonyDate)}</p>
      <OpeningInteraction cover={cover} onOpen={onOpen} />
    </header>
  );
}
