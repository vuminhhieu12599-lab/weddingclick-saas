import type { ReactNode } from "react";

import styles from "../hong-an-v1.module.css";

/**
 * Hồng Ân v1 — the template's recurring architectural chrome
 * (HA-TEMPLATE-01).
 *
 * The Gothic arch is the design language of this template, so it is a
 * hairline motif reused at section scale rather than a large illustration
 * repeated down the page. One heading component keeps the tiny cross, the
 * pointed arch and the gold rule identical everywhere, so no section
 * invents its own ornament.
 */

export function SectionHeading({
  id,
  children,
  eyebrow,
}: {
  readonly id: string;
  readonly children: ReactNode;
  readonly eyebrow?: string;
}) {
  return (
    <div className={styles.sectionHead}>
      <span className={styles.cross} aria-hidden="true" />
      {eyebrow === undefined ? null : <p className={styles.sectionEyebrow}>{eyebrow}</p>}
      <h2 className={styles.sectionHeading} id={id}>
        {children}
      </h2>
      <span className={styles.headingRule} aria-hidden="true" data-reveal="draw" />
    </div>
  );
}

/** A pointed-arch plate: the template's one card shape. */
export function ArchPanel({
  children,
  tone = "ivory",
  className,
}: {
  readonly children: ReactNode;
  /** `ivory` for sacred sections, `warm` for the celebratory ones. */
  readonly tone?: "ivory" | "warm";
  readonly className?: string;
}) {
  return (
    <div className={className ? `${styles.archPanel} ${className}` : styles.archPanel} data-tone={tone} data-reveal="arch">
      <span className={styles.archEdge} aria-hidden="true" />
      {children}
    </div>
  );
}
