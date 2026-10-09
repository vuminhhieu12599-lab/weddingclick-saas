import type { ReactNode } from "react";

import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";
import { formatDottedDate } from "./date-text";
import { DecorImage } from "./decor";

const COPY = ROMANTIC_MINIMAL_V1_COPY;

interface CoverCardProps {
  people: InvitationViewModel["people"];
  ceremonyDate: EventDateTimePresentationV1;
  openButton: ReactNode;
}

/**
 * Task 029 opening cover card: one warm-ivory printed card on the dusty-rose
 * field, florals at two corners, the wax seal (with the heart burst mounted
 * invisibly so it is loaded before the tap), the couple in resolver order
 * (`people.primary` then `.secondary`), the ceremony date, "Thân Mời" and the
 * island-owned "Mở thiệp" button. No envelope on this screen.
 */
export function CoverCard({ people, ceremonyDate, openButton }: CoverCardProps) {
  return (
    <div className={styles.coverCard}>
      <DecorImage decor="floralTopLeft" className={`${styles.coverFloral} ${styles.coverFloralLeft}`} eager />
      <DecorImage decor="floralBottomRight" className={`${styles.coverFloral} ${styles.coverFloralRight}`} eager />
      <div className={styles.coverContent}>
        <div className={styles.coverSeal}>
          <DecorImage decor="seal" className={styles.coverSealImage} eager />
          <DecorImage decor="heartBurst" className={styles.coverBurst} eager />
        </div>
        <p className={styles.coverNames}>
          <span>{people.primary.name}</span>
          <span className={styles.coverAmpersand} aria-hidden="true">
            &amp;
          </span>
          <span className={styles.srOnly}>{COPY.a11y.and}</span>
          <span>{people.secondary.name}</span>
        </p>
        <div className={styles.coverDate}>{formatDottedDate(ceremonyDate)}</div>
        <span className={styles.coverRule} aria-hidden="true" />
        <div className={styles.coverInvite}>{COPY.opening.invite}</div>
        {openButton}
      </div>
    </div>
  );
}
