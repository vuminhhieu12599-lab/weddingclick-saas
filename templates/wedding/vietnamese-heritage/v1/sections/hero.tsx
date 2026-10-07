import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel, MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { formatDottedDate } from "./date-text";
import { MediaImage } from "./media-image";
import { SongHy } from "./song-hy";

const COPY = VIETNAMESE_HERITAGE_V1_COPY;

interface HeroProps {
  people: InvitationViewModel["people"];
  ceremony: InvitationViewModel["ceremony"];
  cover: MediaResolution | undefined;
  ceremonyDate: EventDateTimePresentationV1;
}

/**
 * Task 029 hero on heritage paper: the framed `media.cover` (only when
 * `RESOLVED`; absent or `UNAVAILABLE` leaves an honest typographic hero with
 * no frame and no substitute), the Song Hỷ seal, `ceremony.title` verbatim
 * (RF3), the canonical names and the RF-05C weekday · date · time.
 */
export function Hero({ people, ceremony, cover, ceremonyDate }: HeroProps) {
  const coupleText = `${people.primary.name} ${COPY.a11y.and} ${people.secondary.name}`;

  return (
    <section className={styles.hero} aria-labelledby="vh-hero-names" data-cover={cover?.status === "RESOLVED" ? "photo" : "none"}>
      {cover?.status === "RESOLVED" ? (
        <div className={styles.heroFrame}>
          <MediaImage media={cover} alt={`${COPY.hero.photoAlt} ${coupleText}`} className={styles.heroPhoto} eager />
        </div>
      ) : null}
      <SongHy rules={false} />
      <p className={styles.heroCeremony}>{ceremony.title}</p>
      <h1 id="vh-hero-names" className={styles.heroNames}>
        <span>{people.primary.name}</span>
        <span className={styles.amp} aria-hidden="true">
          &amp;
        </span>
        <span className={styles.srOnly}> {COPY.a11y.and} </span>
        <span>{people.secondary.name}</span>
      </h1>
      <p className={styles.heroDate}>
        <span>{ceremonyDate.weekday}</span>
        <span aria-hidden="true"> · </span>
        <span>{formatDottedDate(ceremonyDate)}</span>
        <span aria-hidden="true"> · </span>
        <span>{ceremonyDate.time}</span>
      </p>
    </section>
  );
}
