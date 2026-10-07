import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { formatDottedDate } from "./date-text";
import { SongHy } from "./song-hy";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.opening;

interface OpeningCoverProps {
  people: InvitationViewModel["people"];
  ceremonyDate: EventDateTimePresentationV1;
}

/**
 * Task 029 ceremonial red cover: title, Song Hỷ, the primary/secondary
 * canonical names (explicit side order from the ViewModel) and the RF-05C
 * ceremony weekday/date.
 *
 * VH-01 renders it as a static, non-blocking first panel. The tap-to-open
 * split doors (left/right) with a reduced-motion fallback are a VH-02
 * interactive island; nothing here hides the invitation behind it.
 */
export function OpeningCover({ people, ceremonyDate }: OpeningCoverProps) {
  return (
    <header className={styles.opening} data-opening="static">
      <p className={styles.openingLabel}>{COPY.label}</p>
      <SongHy rules={false} />
      <p className={styles.openingNames}>
        <span>{people.primary.name}</span>
        <span className={styles.amp} aria-hidden="true">
          &amp;
        </span>
        <span>{people.secondary.name}</span>
      </p>
      <p className={styles.openingDate}>
        <span className={styles.openingWeekday}>{ceremonyDate.weekday}</span>
        <span>{formatDottedDate(ceremonyDate)}</span>
      </p>
    </header>
  );
}
