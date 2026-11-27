import type { InvitationViewModel, ResolvedMedia, ViewModelFamily } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { CoupleSide } from "../../../../../lib/invitation-rendering/wedding-domain-types";
import { KHAN_VOAN_V1_COPY } from "../copy";
import styles from "../khan-voan-v1.module.css";
import { Rings } from "./decor";
import { MediaImage } from "./media-image";
import { nameOf } from "./names";

const COPY = KHAN_VOAN_V1_COPY.families;

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function Family({ family }: { family: ViewModelFamily }) {
  return (
    <div className={`${styles.family} ${styles.reveal}`} data-side={family.side}>
      <h3 className={styles.sideLabel}>{COPY.labelBySide[family.side]}</h3>
      {present(family.father) ? <p className={styles.parent}>{family.father}</p> : null}
      {present(family.mother) ? <p className={styles.parent}>{family.mother}</p> : null}
      {present(family.address) ? <p className={styles.familyPlace}>{family.address}</p> : null}
    </div>
  );
}

interface FamiliesProps {
  people: InvitationViewModel["people"];
  families: InvitationViewModel["families"];
  portraits: Readonly<Record<CoupleSide, ResolvedMedia | undefined>>;
}

/** Both families (primary side first, per the variant) and the two arch portraits. */
export function Families({ people, families, portraits }: FamiliesProps) {
  const persons = [people.primary, people.secondary];
  const withPortraits = persons.filter((person) => portraits[person.side] !== undefined);
  return (
    <section className={`${styles.section} ${styles.families}`} aria-labelledby="kv-families-heading">
      <h2 id="kv-families-heading" className={styles.srOnly}>
        {COPY.heading}
      </h2>
      <Rings className={`${styles.rings} ${styles.reveal}`} />
      <div className={styles.familyRow}>
        <Family family={families.primary} />
        <Family family={families.secondary} />
      </div>
      {withPortraits.length === 0 ? null : (
        <div className={styles.portraits} data-count={withPortraits.length}>
          {withPortraits.map((person) => {
            const photo = portraits[person.side];
            return (
              <figure key={person.side} className={`${styles.portrait} ${styles.reveal}`} data-side={person.side}>
                <div className={`${styles.arch} ${styles.wipe}`}>
                  {photo === undefined ? null : <MediaImage media={photo} alt={`${COPY.roleBySide[person.side]} ${nameOf(person)}`} />}
                </div>
                <figcaption>
                  <small>{COPY.roleBySide[person.side]}</small>
                  {nameOf(person)}
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </section>
  );
}
