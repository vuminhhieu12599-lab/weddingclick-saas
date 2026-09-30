import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

const COPY = ELEGANT_EDITORIAL_V1_COPY.couple;

/** Design Baseline A1 couple floral divider (served from the immutable v1 decor path, P6). */
const FLORAL_DIVIDER_SRC = "/renderers/wedding/elegant-editorial/v1/couple-floral-divider.webp";

interface CoupleProps {
  people: InvitationViewModel["people"];
}

/**
 * Task029 couple / story composition without portrait media (Design
 * Baseline B5 item 6; P7: no portrait role exists in v1). The white-soft
 * band carries the Great Vibes quote, then asymmetric typographic plates:
 * the primary person aligned left, the floral divider, the secondary person
 * aligned right. Order is the ViewModel's primary → secondary; each label is
 * chosen by the person's explicit `side`, never by position (RF5). The
 * section heading is an accessible name only.
 */
export function Couple({ people }: CoupleProps) {
  const [primary, secondary] = [people.primary, people.secondary];

  return (
    <section className={styles.coupleBand} aria-labelledby="ee-couple-heading">
      <h2 id="ee-couple-heading" className={styles.srOnly}>
        {COPY.heading}
      </h2>
      <p className={styles.coupleQuote}>
        {COPY.quote.map((line) => (
          <span key={line} className={styles.coupleQuoteLine}>
            {line}
          </span>
        ))}
      </p>
      <div className={styles.couplePlate} data-align="start" data-side={primary.side}>
        <p className={styles.coupleRole}>{COPY.roleBySide[primary.side]}</p>
        <p className={styles.coupleName}>{primary.name}</p>
      </div>
      <div className={styles.coupleDivider} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed v1 decor file, rendered at its designed size */}
        <img className={styles.coupleDividerImage} src={FLORAL_DIVIDER_SRC} alt="" width={600} height={200} decoding="async" />
      </div>
      <div className={styles.couplePlate} data-align="end" data-side={secondary.side}>
        <p className={styles.coupleRole}>{COPY.roleBySide[secondary.side]}</p>
        <p className={styles.coupleName}>{secondary.name}</p>
      </div>
    </section>
  );
}
