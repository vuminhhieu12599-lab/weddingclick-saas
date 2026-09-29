import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { formatDottedDate } from "./date-text";
import { LeafSprig } from "./decor";
import { MediaImage } from "./media-image";

const COPY = ELEGANT_EDITORIAL_V1_COPY;

interface HeroProps {
  people: InvitationViewModel["people"];
  ceremony: InvitationViewModel["ceremony"];
  cover: InvitationViewModel["media"]["cover"];
  ceremonyDate: EventDateTimePresentationV1;
}

/**
 * Hero (P7). A `RESOLVED` cover renders its runtime URL. An absent or
 * `UNAVAILABLE` cover renders the same honest typographic hero: no image
 * element, no substitute media, no hard-coded location.
 */
export function Hero({ people, ceremony, cover, ceremonyDate }: HeroProps) {
  const mediaState = cover === undefined ? "absent" : cover.status === "RESOLVED" ? "resolved" : "unavailable";
  const coupleText = `${people.primary.name} ${COPY.a11y.and} ${people.secondary.name}`;

  return (
    <section className={styles.hero} data-media-state={mediaState} aria-label={COPY.hero.kicker}>
      {cover !== undefined && cover.status === "RESOLVED" ? (
        <div className={styles.heroMedia}>
          <MediaImage media={cover} alt={`${COPY.a11y.coverImageAlt} ${coupleText}`} className={styles.heroImage} eager />
          <div className={styles.heroScrim} aria-hidden="true" />
        </div>
      ) : (
        <div className={styles.heroTypographic} aria-hidden="true">
          <LeafSprig className={styles.heroSprigTop} />
        </div>
      )}
      <div className={styles.heroContent}>
        <p className={styles.heroKicker}>{COPY.hero.kicker}</p>
        <p className={styles.heroNames}>
          <span className={styles.nameLine}>{people.primary.name}</span>
          <span className={styles.heroAmp}> &amp; </span>
          <span className={styles.nameLine}>{people.secondary.name}</span>
        </p>
        <p className={styles.heroCeremony}>{ceremony.title}</p>
        <p className={styles.heroDate}>{formatDottedDate(ceremonyDate)}</p>
      </div>
    </section>
  );
}
