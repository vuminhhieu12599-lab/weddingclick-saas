import type { InvitationViewModel, ViewModelFamily } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { OrnamentDivider } from "./decor";

const COPY = ELEGANT_EDITORIAL_V1_COPY.families;

interface FamiliesProps {
  families: InvitationViewModel["families"];
}

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function hasCanonicalLine(family: ViewModelFamily): boolean {
  return present(family.father) || present(family.mother) || present(family.address);
}

/**
 * Families in ViewModel display order: `primary` then `secondary` (RF4).
 * Only canonical fields are shown and a null or blank line is omitted. The
 * side label comes from the family's explicit `side`, never its position
 * (RF5). A family with no canonical line at all is not shown, so no side
 * label is ever rendered over invented or empty content.
 */
export function Families({ families }: FamiliesProps) {
  const shown = [families.primary, families.secondary].filter(hasCanonicalLine);
  if (shown.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-labelledby="ee-families-heading">
      <OrnamentDivider />
      <h2 id="ee-families-heading" className={styles.sectionHeading}>
        {COPY.heading}
      </h2>
      <div className={styles.families}>
        {shown.map((family) => (
          <div key={family.side} className={styles.familyColumn} data-side={family.side}>
            <h3 className={styles.familySide}>{COPY.labelBySide[family.side]}</h3>
            {present(family.father) ? <p className={styles.familyName}>{family.father}</p> : null}
            {present(family.mother) ? <p className={styles.familyName}>{family.mother}</p> : null}
            {present(family.address) ? <p className={styles.familyAddress}>{family.address}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
