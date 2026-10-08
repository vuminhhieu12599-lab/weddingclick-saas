import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { formatDottedDate } from "./date-text";
import { LotusMark } from "./decor";
import { SongHySeal } from "./song-hy";

const COPY = VIETNAMESE_HERITAGE_V1_COPY;

/**
 * Task 029 closing, text-only (VH-02A ruling D5): the gold rule + lotus
 * divider, the vector Song Hỷ seal, then a lacquer panel with the exact
 * approved three-line thank-you, the canonical names and the RF-05C date.
 * No photo: COVER, GALLERY and every other media role are never reused here.
 */
export function Closing({ people, ceremonyDate }: { people: InvitationViewModel["people"]; ceremonyDate: EventDateTimePresentationV1 }) {
  return (
    <footer className={styles.closing} aria-label={COPY.closing.heading}>
      <div className={styles.closingDivider} aria-hidden="true">
        <span className={styles.closingDividerRule} />
        <LotusMark className={styles.closingLotus} />
        <span className={styles.closingDividerRule} />
      </div>
      <SongHySeal />
      <div className={styles.closingPanel}>
        <p className={styles.closingMessage}>
          {COPY.closing.message.map((line) => (
            <span key={line} className={styles.closingLine}>
              {line}
            </span>
          ))}
        </p>
        <p className={styles.closingNames}>
          {people.primary.name} <span aria-hidden="true">&amp;</span>
          <span className={styles.srOnly}>{COPY.a11y.and}</span> {people.secondary.name}
        </p>
        <p className={styles.closingDate}>{formatDottedDate(ceremonyDate)}</p>
      </div>
    </footer>
  );
}
