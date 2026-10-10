import type { InvitationViewModel, ViewModelFamily } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import styles from "../our-wedding-story-v1.module.css";
import { SectionHead } from "./section-head";

const COPY = OUR_WEDDING_STORY_V1_COPY;

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

/** A family has content when its father, mother or address is a non-blank canonical value. */
export function familyHasContent(family: ViewModelFamily): boolean {
  return present(family.father) || present(family.mother) || present(family.address);
}

function FamilyColumn({ family }: { family: ViewModelFamily }) {
  return (
    <div className={styles.familyCol} data-side={family.side}>
      <h3 className={styles.familySide}>{COPY.sideLabel[family.side]}</h3>
      {present(family.father) ? <p className={styles.familyParent}>{family.father}</p> : null}
      {present(family.mother) ? <p className={styles.familyParent}>{family.mother}</p> : null}
      {present(family.address) ? <p className={styles.familyAddress}>{family.address}</p> : null}
    </div>
  );
}

/**
 * Visual Freeze v1 "Our Families — Hai Gia Đình": two columns,
 * `families.primary` then `.secondary` (GROOM: nhà trai first; BRIDE: nhà gái
 * first; COMMON: both, groom's side first), labels by the explicit `side`,
 * null/blank lines omitted. The root shows it only when at least one family
 * has content.
 */
export function Families({ number, families }: { number: string; families: InvitationViewModel["families"] }) {
  return (
    <section className={styles.section} aria-labelledby="ows-families-heading">
      <SectionHead number={number} kicker={COPY.families.kicker} title={COPY.families.title} headingId="ows-families-heading" />
      <div className={styles.familyGrid}>
        <FamilyColumn family={families.primary} />
        <FamilyColumn family={families.secondary} />
      </div>
    </section>
  );
}
