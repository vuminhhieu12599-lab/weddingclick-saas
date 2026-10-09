import type { InvitationViewModel, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ROMANTIC_MINIMAL_V1_COPY } from "../copy";
import styles from "../romantic-minimal-v1.module.css";
import { MediaImage } from "./media-image";

const COPY = ROMANTIC_MINIMAL_V1_COPY;

/**
 * Task 029 Just Married: one full-bleed 3:2 landscape photo with the fine
 * script "Just" over serif "MARRIED". Rendered by the root only with a
 * resolved `justMarriedPhoto` (otherwise the section is hidden, RM-02 ruling).
 */
export function JustMarried({ photo, people }: { photo: ResolvedMedia; people: InvitationViewModel["people"] }) {
  return (
    <section className={styles.justMarried}>
      <div className={styles.jmFrame}>
        <div className={styles.jmPhoto}>
          <div className={styles.jmPhotoMedia}>
            <MediaImage
              media={photo}
              alt={`${people.primary.name} ${COPY.a11y.and} ${people.secondary.name}`}
              className={styles.coverImage}
            />
          </div>
          <span className={styles.jmScrim} aria-hidden="true" />
          <div className={styles.jmCaption}>
            <h2 className={styles.jmTitle}>
              <span className={styles.jmTitleScript}>{COPY.justMarried.script}</span>
              <span className={styles.jmTitleSerif}>{COPY.justMarried.serif}</span>
            </h2>
          </div>
        </div>
      </div>
    </section>
  );
}
