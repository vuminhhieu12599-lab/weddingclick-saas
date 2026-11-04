import type { ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { HONG_AN_V1_COPY } from "../copy";
import styles from "../hong-an-v1.module.css";

const COPY = HONG_AN_V1_COPY.closing;

/**
 * Section 14 — "Lời Cảm Ơn" (HA-TEMPLATE-01).
 *
 * The calm end of the scroll: the couple's names once more over a bright
 * stone field, a small cross, the thank-you, and a light altar arcade
 * with white lilies beneath the names (HA-DESIGN-02). The closing
 * photograph is drawn only when the Project assigned one to this slot;
 * without it the composition simply closes on type, which is how the
 * approved direction looks with no photograph at all.
 */
export function Closing({
  primaryName,
  secondaryName,
  photo,
  photoAlt,
}: {
  readonly primaryName: string;
  readonly secondaryName: string;
  readonly photo: ResolvedMedia | undefined;
  readonly photoAlt: string;
}) {
  return (
    <section className={styles.closing} aria-labelledby="ha-closing-heading" data-reveal="rise">
      {photo === undefined ? null : (
        <figure className={styles.closingFigure} data-reveal="photo">
          <span className={styles.closingArch} aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element -- opaque runtime MediaResolver URL, not a build-known asset */}
          <img
            className={styles.closingPhoto}
            src={photo.url}
            alt={photoAlt}
            width={photo.width ?? undefined}
            height={photo.height ?? undefined}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </figure>
      )}

      <span className={styles.closingCross} aria-hidden="true" />
      <h2 className={styles.closingHeading} id="ha-closing-heading">
        {COPY.heading}
      </h2>
      <p className={styles.closingMessage}>{COPY.message}</p>
      {/* Breaks at the ampersand, never inside a name. */}
      <p className={styles.closingNames}>
        <span className={styles.closingName}>{primaryName}</span>
        <span className={styles.closingAmp} aria-hidden="true">
          &amp;
        </span>
        <span className={styles.closingName}>{secondaryName}</span>
      </p>
      <span className={styles.closingLily} aria-hidden="true" />
    </section>
  );
}
