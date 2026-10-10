import styles from "../our-wedding-story-v1.module.css";

interface SectionHeadProps {
  /** Editorial page number from `owsPageNumbers` ("02", "03", …). */
  number: string;
  kicker: string;
  /** The section's `<h2>`; when absent the kicker text is the accessible heading. */
  title?: string;
  headingId: string;
}

/** Visual Freeze v1 section head: serif page number · hairline · uppercase kicker, then the optional serif title. */
export function SectionHead({ number, kicker, title, headingId }: SectionHeadProps) {
  return (
    <div className={styles.sectionHead}>
      <div className={styles.kicker}>
        <span className={styles.kickerNumber} aria-hidden="true">
          {number}
        </span>
        <span className={styles.kickerRule} aria-hidden="true" />
        {title === undefined ? (
          <h2 id={headingId} className={styles.kickerHeading}>
            {kicker}
          </h2>
        ) : (
          <span>{kicker}</span>
        )}
      </div>
      {title === undefined ? null : (
        <h2 id={headingId} className={styles.sectionTitle}>
          {title}
        </h2>
      )}
    </div>
  );
}
