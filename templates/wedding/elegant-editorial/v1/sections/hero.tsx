import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { formatDottedDate } from "./date-text";
import { CoupleAmpersand } from "./decor";
import { MediaImage } from "./media-image";

const COPY = ELEGANT_EDITORIAL_V1_COPY;

interface HeroProps {
  people: InvitationViewModel["people"];
  ceremony: InvitationViewModel["ceremony"];
  cover: InvitationViewModel["media"]["cover"];
  ceremonyDate: EventDateTimePresentationV1;
}

/**
 * Task029 photo-led Hero (Design Baseline B5 item 5, P7). A `RESOLVED`
 * cover fills the Hero zone under the Task029 scrim, with "Save the date",
 * the names on one line around a small inline gold "&" (Design Baseline D5)
 * and the dotted date: no location and no ceremony title over the photo.
 *
 * An absent or `UNAVAILABLE` cover keeps the same Hero zone on moss-deep and
 * adds the canonical ceremony title (Design Baseline D4). No image element,
 * no substitute media.
 */
export function Hero({ people, ceremony, cover, ceremonyDate }: HeroProps) {
  const mediaState = cover === undefined ? "absent" : cover.status === "RESOLVED" ? "resolved" : "unavailable";
  const coupleText = `${people.primary.name} ${COPY.a11y.and} ${people.secondary.name}`;

  return (
    <section className={styles.hero} data-media-state={mediaState} aria-label={COPY.hero.kicker}>
      {cover !== undefined && cover.status === "RESOLVED" ? (
        <>
          <MediaImage media={cover} alt={`${COPY.a11y.coverImageAlt} ${coupleText}`} className={styles.heroImage} eager />
          <div className={styles.heroScrim} aria-hidden="true" />
        </>
      ) : null}
      <div className={styles.heroContent}>
        <p className={styles.heroKicker}>{COPY.hero.kicker}</p>
        <p className={styles.heroNames}>
          <span className={styles.name}>{people.primary.name}</span>
          <CoupleAmpersand className={styles.heroAmp} />
          <span className={styles.name}>{people.secondary.name}</span>
        </p>
        {mediaState === "resolved" ? null : <p className={styles.heroCeremony}>{ceremony.title}</p>}
        <p className={styles.heroDate}>{formatDottedDate(ceremonyDate)}</p>
      </div>
    </section>
  );
}
