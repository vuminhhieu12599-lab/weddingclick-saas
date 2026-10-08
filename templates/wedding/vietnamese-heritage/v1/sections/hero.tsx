import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel, MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { formatDottedDate } from "./date-text";
import { DecorImage, LotusMark } from "./decor";
import { MediaImage } from "./media-image";

const COPY = VIETNAMESE_HERITAGE_V1_COPY;

interface HeroProps {
  people: InvitationViewModel["people"];
  ceremony: InvitationViewModel["ceremony"];
  /** `templateSlots.heroPhoto[0]`, the single hero position; never a legacy COVER. */
  photo: MediaResolution | undefined;
  ceremonyDate: EventDateTimePresentationV1;
}

/**
 * Task 029 hero on ivory heritage paper. With a `RESOLVED` `heroPhoto` slot item:
 * the framed photograph, the medallion seal on its top edge, the gold
 * divider on its bottom edge and the floral + lotus corner clusters. With
 * the slot empty or its item `UNAVAILABLE`: an honest typographic hero (the
 * medallion alone, no empty frame, no substitute media). Then
 * `ceremony.title` verbatim (RF3), the canonical names and the RF-05C
 * weekday · date · time.
 */
export function Hero({ people, ceremony, photo: heroPhoto, ceremonyDate }: HeroProps) {
  const coupleText = `${people.primary.name} ${COPY.a11y.and} ${people.secondary.name}`;
  const photo = heroPhoto?.status === "RESOLVED" ? heroPhoto : null;

  return (
    <section className={styles.hero} aria-labelledby="vh-hero-names" data-hero-photo={photo !== null ? "present" : "none"}>
      {photo !== null ? (
        <div className={styles.heroPhotoWrap}>
          <div className={styles.heroPhotoFrame}>
            <MediaImage media={photo} alt={`${COPY.hero.photoAlt} ${coupleText}`} className={styles.heroPhoto} eager />
          </div>
          <div className={`${styles.heroCorner} ${styles.heroCornerTopLeft}`} aria-hidden="true">
            <DecorImage decor="floralTopLeft" className={styles.heroFloral} eager />
            <LotusMark className={styles.heroLotus} />
          </div>
          <div className={`${styles.heroCorner} ${styles.heroCornerBottomRight}`} aria-hidden="true">
            <DecorImage decor="floralBottomRight" className={styles.heroFloral} eager />
            <LotusMark className={styles.heroLotus} />
          </div>
          <span className={styles.heroSeal}>
            <DecorImage decor="medallion" className={styles.heroSealImage} alt={COPY.a11y.songHy} eager />
          </span>
          <span className={styles.heroOrnament} aria-hidden="true">
            <DecorImage decor="divider" className={styles.heroOrnamentImage} eager />
          </span>
        </div>
      ) : (
        <DecorImage decor="medallion" className={styles.heroMedallion} alt={COPY.a11y.songHy} eager />
      )}
      <p className={styles.heroCeremony}>{ceremony.title}</p>
      <h1 id="vh-hero-names" className={styles.heroNames}>
        <span>{people.primary.name}</span>
        <span className={styles.heroAmp} aria-hidden="true">
          &amp;
        </span>
        <span className={styles.srOnly}>{COPY.a11y.and}</span>
        <span>{people.secondary.name}</span>
      </h1>
      <p className={styles.heroDate}>
        <span>{ceremonyDate.weekday}</span>
        <span className={styles.heroDateSep} aria-hidden="true">
          ·
        </span>
        <span>{formatDottedDate(ceremonyDate)}</span>
        <span className={styles.heroDateSep} aria-hidden="true">
          ·
        </span>
        <span>{ceremonyDate.time}</span>
      </p>
    </section>
  );
}
