import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";
import { formatDottedDate } from "./date-text";
import { MediaImage } from "./media-image";

const COPY = ROMANTIC_MINIMAL_V1_COPY;

interface ThankYouProps {
  people: InvitationViewModel["people"];
  ceremonyDate: EventDateTimePresentationV1;
  /** `templateSlots.thankYouPhoto[0]` when `RESOLVED`; otherwise absent. */
  photo: ResolvedMedia | undefined;
}

/**
 * Task 029 Thank You footer: the full-bleed closing photo with its soft scrim,
 * "Thank you", the couple (resolver order) and `DD.MM.YYYY`. Without a
 * resolved `thankYouPhoto` the same text sits on the approved plain #6b4a50
 * band (no image, no substitute; RM-02 ruling).
 */
export function ThankYou({ people, ceremonyDate, photo }: ThankYouProps) {
  return (
    <section className={styles.thankYou} aria-labelledby="rm-thank-you-heading" data-photo={photo === undefined ? "absent" : "present"}>
      {photo === undefined ? null : (
        <>
          <div className={styles.thankYouPhoto}>
            <MediaImage
              media={photo}
              alt={`${COPY.thankYou.photoAlt} ${people.primary.name} ${COPY.a11y.and} ${people.secondary.name}`}
              className={styles.coverImage}
            />
          </div>
          <span className={styles.thankYouScrim} aria-hidden="true" />
        </>
      )}
      <div className={styles.thankYouContent}>
        <div className={styles.thankYouTitleWrap}>
          <h2 id="rm-thank-you-heading" className={styles.thankYouTitle}>
            {COPY.thankYou.heading}
          </h2>
        </div>
        <div className={styles.thankYouTextWrap}>
          <p className={styles.thankYouNames}>
            {people.primary.name} &amp; {people.secondary.name}
          </p>
          <p className={styles.thankYouDate}>{formatDottedDate(ceremonyDate)}</p>
        </div>
      </div>
    </section>
  );
}
