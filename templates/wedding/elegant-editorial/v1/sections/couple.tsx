import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

const COPY = ELEGANT_EDITORIAL_V1_COPY.couple;

interface CoupleProps {
  people: InvitationViewModel["people"];
}

/**
 * Typographic couple block (P7: no portrait media role exists in v1).
 * Order is the ViewModel's primary → secondary; each role label is chosen
 * by the person's explicit `side`, never by position.
 */
export function Couple({ people }: CoupleProps) {
  return (
    <section className={styles.section} aria-labelledby="ee-couple-heading">
      <h2 id="ee-couple-heading" className={styles.sectionHeading}>
        {COPY.heading}
      </h2>
      <div className={styles.couple}>
        {[people.primary, people.secondary].map((person) => (
          <div key={person.side} className={styles.couplePerson} data-side={person.side}>
            <p className={styles.coupleRole}>{COPY.roleBySide[person.side]}</p>
            <p className={styles.coupleName}>{person.name}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
