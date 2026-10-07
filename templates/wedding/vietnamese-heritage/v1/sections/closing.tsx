import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { formatDottedDate } from "./date-text";
import { SongHy } from "./song-hy";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.closing;

/**
 * Task 029 closing: Song Hỷ accent, the fixed thank-you wording, the
 * canonical names and the RF-05C date. The prototype's closing photo has no
 * canonical media role, so VH-01 is typographic (VH-02 question).
 */
export function Closing({ people, ceremonyDate }: { people: InvitationViewModel["people"]; ceremonyDate: EventDateTimePresentationV1 }) {
  return (
    <footer className={styles.closing} aria-label={COPY.heading}>
      <SongHy />
      <p className={styles.closingMessage}>
        {COPY.message.map((line) => (
          <span key={line} className={styles.closingLine}>
            {line}
          </span>
        ))}
      </p>
      <p className={styles.closingNames}>
        {people.primary.name} <span aria-hidden="true">&amp;</span>
        <span className={styles.srOnly}>{VIETNAMESE_HERITAGE_V1_COPY.a11y.and}</span> {people.secondary.name}
      </p>
      <p className={styles.closingDate}>{formatDottedDate(ceremonyDate)}</p>
    </footer>
  );
}
