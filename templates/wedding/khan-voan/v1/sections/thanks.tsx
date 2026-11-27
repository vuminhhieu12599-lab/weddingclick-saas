import type { InvitationViewModel, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { KHAN_VOAN_V1_COPY } from "../copy";
import styles from "../khan-voan-v1.module.css";
import { MediaImage } from "./media-image";
import { givenNameOf } from "./names";

const COPY = KHAN_VOAN_V1_COPY.thanks;

export function Thanks({ people, photo }: { people: InvitationViewModel["people"]; photo: ResolvedMedia | undefined }) {
  return (
    <section className={styles.thanks} data-has-photo={photo === undefined ? "false" : "true"} aria-labelledby="kv-thanks-heading">
      {photo === undefined ? null : <MediaImage media={photo} alt={COPY.photoAlt} className={styles.thanksPhoto} />}
      <div className={styles.thanksText}>
        <h2 id="kv-thanks-heading" className={`${styles.thanksTitle} ${styles.reveal}`}>
          <span className={styles.ink}>{COPY.heading}</span>
        </h2>
        <p className={styles.reveal}>{COPY.line}</p>
        <p className={`${styles.signature} ${styles.reveal}`}>
          {givenNameOf(people.primary)} <span aria-hidden="true">&amp;</span>
          <span className={styles.srOnly}>{KHAN_VOAN_V1_COPY.a11y.and}</span> {givenNameOf(people.secondary)}
        </p>
      </div>
    </section>
  );
}
