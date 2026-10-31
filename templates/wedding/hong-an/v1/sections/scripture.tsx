import { HONG_AN_V1_COPY } from "../copy";
import styles from "../hong-an-v1.module.css";

const COPY = HONG_AN_V1_COPY.scripture;

/**
 * Section 11 — "Lời Chúa" (HA-TEMPLATE-01).
 *
 * A quiet spiritual pause between the album and the reply card: one verse,
 * a tiny cross, a great deal of air and nothing else. No panel, no photo,
 * no ornament competing with the words.
 *
 * The verse is the approved template copy and the ONLY quotation this
 * template may show. It also appears, small and secondary, under the hero —
 * that is the approved V4 composition — and this is the one place it is
 * given room. It is deliberately not repeated in a third block.
 */
export function Scripture() {
  return (
    <section className={styles.scripture} aria-labelledby="ha-scripture-heading" data-reveal="rise">
      <span className={styles.scriptureCross} aria-hidden="true" />
      <h2 className={styles.scriptureHeading} id="ha-scripture-heading">
        {COPY.heading}
      </h2>
      <blockquote className={styles.scriptureVerse}>
        <p>“{COPY.verse}”</p>
        <cite className={styles.scriptureRef}>— {COPY.reference} —</cite>
      </blockquote>
    </section>
  );
}
