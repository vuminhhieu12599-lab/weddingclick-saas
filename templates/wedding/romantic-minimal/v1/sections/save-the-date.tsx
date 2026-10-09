import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";
import { formatSpacedDate } from "./date-text";
import { DecorImage } from "./decor";
import { MediaImage } from "./media-image";

const COPY = ROMANTIC_MINIMAL_V1_COPY;

interface SaveTheDateProps {
  people: InvitationViewModel["people"];
  ceremonyDate: EventDateTimePresentationV1;
  /** `templateSlots.saveTheDatePhoto[0]` when `RESOLVED`; otherwise absent. */
  photo: ResolvedMedia | undefined;
}

/**
 * Task 029 Save The Date (first inner screen): faint architecture sketch,
 * "Save the date", `DD . MM . YYYY`, the couple in resolver order, then the
 * photo rising out of the open envelope (back layer, photo well, pocket,
 * seal, mirrored floral). Without a resolved `saveTheDatePhoto` the envelope,
 * date and names stay and no image (or substitute) is drawn (RM-02 ruling).
 */
export function SaveTheDate({ people, ceremonyDate, photo }: SaveTheDateProps) {
  return (
    <section className={styles.saveTheDate} aria-labelledby="rm-std-names" data-photo={photo === undefined ? "absent" : "present"}>
      <DecorImage decor="architecture" className={styles.stdArchitecture} eager />
      <div className={styles.stdHeading}>
        <div className={styles.stdKicker}>{COPY.saveTheDate.kicker}</div>
        <div className={styles.stdDate}>{formatSpacedDate(ceremonyDate)}</div>
        <h1 id="rm-std-names" className={styles.stdNames}>
          <span>{people.primary.name}</span>
          <span className={styles.stdAmpersand} aria-hidden="true">
            &amp;
          </span>
          <span className={styles.srOnly}>{COPY.a11y.and}</span>
          <span>{people.secondary.name}</span>
        </h1>
      </div>
      <div className={styles.stdStage}>
        <div className={styles.stdEnvelope}>
          <DecorImage decor="envelopeBack" className={`${styles.stdLayer} ${styles.stdEnvelopeBack}`} eager />
          {photo === undefined ? null : (
            <div className={styles.stdPhotoWell}>
              <div className={styles.stdPhoto}>
                <div className={styles.stdPhotoInner}>
                  <MediaImage
                    media={photo}
                    alt={`${COPY.saveTheDate.photoAlt} ${people.primary.name} ${COPY.a11y.and} ${people.secondary.name}`}
                    className={styles.coverImage}
                    eager
                  />
                </div>
              </div>
            </div>
          )}
          <DecorImage decor="envelopePocket" className={`${styles.stdLayer} ${styles.stdEnvelopePocket}`} eager />
          <DecorImage decor="seal" className={styles.stdSeal} eager />
          <DecorImage decor="floralBottomRight" className={styles.stdFloral} eager />
        </div>
      </div>
    </section>
  );
}
