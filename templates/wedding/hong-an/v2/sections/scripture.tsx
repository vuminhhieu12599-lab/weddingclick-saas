import { HONG_AN_V2_COPY } from "../copy";
import styles from "../hong-an-v2.module.css";
import type { ScriptureQuote } from "./scripture-quote";

const COPY = HONG_AN_V2_COPY.scripture;

/**
 * Section 11 — "Lời Chúa" (HA-TEMPLATE-01, configurable since HA-CONTENT-01).
 *
 * A quiet spiritual pause between the album and the reply card: one verse,
 * a tiny cross, a great deal of air and nothing else. No panel, no photo,
 * no ornament competing with the words.
 *
 * The verse also appears, small and secondary, under the hero — that is the
 * approved V4 composition — and this is the one place it is given room. It
 * is deliberately not repeated in a third block.
 *
 * The quote arrives already resolved (`sections/scripture-quote.ts`), so
 * this component makes no default/override decision of its own and the two
 * places that show the quote can never disagree. The heading stays fixed
 * template copy: only the words of the verse and its reference are
 * configurable.
 *
 * A quote with no reference renders no `<cite>` at all — no empty dashes,
 * and never the default reference attached to someone else's verse.
 */
export function Scripture({ quote }: { readonly quote: ScriptureQuote }) {
  return (
    <section className={styles.scripture} aria-labelledby="ha-scripture-heading" data-reveal="rise">
      <span className={styles.scriptureCross} aria-hidden="true" />
      <h2 className={styles.scriptureHeading} id="ha-scripture-heading">
        {COPY.heading}
      </h2>
      <blockquote className={styles.scriptureVerse}>
        <p>“{quote.verse}”</p>
        {quote.reference === undefined ? null : (
          <cite className={styles.scriptureRef}>— {quote.reference} —</cite>
        )}
      </blockquote>
    </section>
  );
}
