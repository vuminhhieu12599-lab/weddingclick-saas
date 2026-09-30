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
 * Task029 ceremony composition inside the shared sage band (Design Baseline
 * B5 item 9, P7). The label is `ceremony.title` verbatim (RF3). The large
 * day and "Tháng MM" / year, and the `WEEKDAY · HH:mm` meta line, are the
 * RF-05C parts of `ceremony.startsAt` in `ceremony.timezone`. The lunar line
 * is the fixed "Tức ngày" label as its own element beside
 * `ceremony.lunarDateDisplay` verbatim, and is omitted when null or empty
 * (RF6, K32).
 */
export function Ceremony({ ceremony, ceremonyDate }: CeremonyProps) {
  const lunar = ceremony.lunarDateDisplay;
  const showLunar = lunar !== null && lunar.trim().length > 0;

  return (
    <section className={styles.ceremony} aria-labelledby="ee-ceremony-heading">
      <h2 id="ee-ceremony-heading" className={styles.ceremonyTitle}>
        {ceremony.title}
      </h2>
      <div className={styles.ceremonyDate}>
        <span className={styles.ceremonyDay}>{ceremonyDate.day}</span>
        <span className={styles.ceremonyMonthYear}>
          <span>
            {COPY.monthPrefix} {ceremonyDate.month}
          </span>
          <span>{ceremonyDate.year}</span>
        </span>
      </div>
      {showLunar ? (
        <p className={styles.lunar} data-lunar="present">
          <span className={styles.lunarLabel}>{COPY.lunarLabel}</span>{" "}
          <span className={styles.lunarValue}>{lunar}</span>
        </p>
      ) : null}
      <p className={styles.ceremonyMeta}>
        <span className={styles.ceremonyWeekday}>{ceremonyDate.weekday}</span>
        <span aria-hidden="true"> · </span>
        <span>{ceremonyDate.time}</span>
      </p>
    </section>
  );
}
