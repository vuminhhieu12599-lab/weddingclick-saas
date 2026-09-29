import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

const COPY = ELEGANT_EDITORIAL_V1_COPY.ceremony;

interface CeremonyProps {
  ceremony: InvitationViewModel["ceremony"];
  ceremonyDate: EventDateTimePresentationV1;
}

/**
 * Ceremony (P7). The heading is `ceremony.title` verbatim (RF3). Day, month,
 * year, weekday and time are the RF-05C parts of `ceremony.startsAt` in
 * `ceremony.timezone`. The lunar line is `ceremony.lunarDateDisplay`
 * verbatim, with a separate fixed label element beside it, and is omitted
 * when null or empty (RF6, K32).
 */
export function Ceremony({ ceremony, ceremonyDate }: CeremonyProps) {
  const lunar = ceremony.lunarDateDisplay;
  const showLunar = lunar !== null && lunar.trim().length > 0;

  return (
    <section className={styles.section} aria-labelledby="ee-ceremony-heading">
      <h2 id="ee-ceremony-heading" className={styles.ceremonyTitle}>
        {ceremony.title}
      </h2>
      <div className={styles.ceremonyDate}>
        <span className={styles.ceremonyWeekday}>{ceremonyDate.weekday}</span>
        <span className={styles.ceremonyDay}>{ceremonyDate.day}</span>
        <span className={styles.ceremonyMonthYear}>
          <span>
            {COPY.monthPrefix} {ceremonyDate.month}
          </span>
          <span>{ceremonyDate.year}</span>
        </span>
      </div>
      <p className={styles.ceremonyTime}>{ceremonyDate.time}</p>
      {showLunar ? (
        <p className={styles.lunar} data-lunar="present">
          <span className={styles.lunarLabel}>{COPY.lunarLabel}</span>
          <span className={styles.lunarValue}>{lunar}</span>
        </p>
      ) : null}
    </section>
  );
}
