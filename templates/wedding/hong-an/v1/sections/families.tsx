import type { ViewModelFamily } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { HONG_AN_V1_COPY } from "../copy";
import styles from "../hong-an-v1.module.css";
import { SectionHeading } from "./arch";
import { present } from "./event-selection";

const COPY = HONG_AN_V1_COPY.families;

/**
 * Section 05 — "Gia Đình Hai Bên" (HA-TEMPLATE-01).
 *
 * Two arch-framed houses with a hairline between them. Each house is keyed
 * by its OWN `family.side`, never by array position or render order
 * (CLAUDE.md §5/§6), so the Nhà Trai column can never show the bride's
 * parents. The renderer implements no variant rule: `families.groom` and
 * `families.bride` arrive already resolved by the one central resolver, and
 * the houses are drawn in the fixed GROOM → BRIDE reading order of the
 * approved composition for all three variants.
 *
 * A missing father, mother or address is simply not printed. Nothing is
 * defaulted, guessed or filled from the other side.
 */
/** The canonical values a house actually has; `null` when it has none. */
function houseContent(family: ViewModelFamily) {
  const father = present(family.father);
  const mother = present(family.mother);
  const address = present(family.address);
  if (father === undefined && mother === undefined && address === undefined) return null;
  return { father, mother, address };
}

function House({
  family,
  label,
  content,
}: {
  readonly family: ViewModelFamily;
  readonly label: string;
  readonly content: NonNullable<ReturnType<typeof houseContent>>;
}) {
  const { father, mother, address } = content;

  return (
    <div className={styles.house} data-side={family.side} data-reveal="arch">
      <span className={styles.houseArch} aria-hidden="true" />
      <p className={styles.houseLabel}>{label}</p>
      <ul className={styles.houseParents}>
        {father === undefined ? null : (
          <li className={styles.houseParent}>
            <span className={styles.houseHonorific}>{COPY.father}</span> {father}
          </li>
        )}
        {mother === undefined ? null : (
          <li className={styles.houseParent}>
            <span className={styles.houseHonorific}>{COPY.mother}</span> {mother}
          </li>
        )}
      </ul>
      {address === undefined ? null : <p className={styles.houseAddress}>{address}</p>}
    </div>
  );
}

export function Families({ families }: { readonly families: { groom: ViewModelFamily; bride: ViewModelFamily } }) {
  const groom = houseContent(families.groom);
  const bride = houseContent(families.bride);
  // With neither house carrying a single canonical value there is nothing
  // honest to show, so the section is not drawn at all.
  if (groom === null && bride === null) return null;

  return (
    <section className={styles.section} aria-labelledby="ha-families-heading" data-reveal="rise">
      <SectionHeading id="ha-families-heading">{COPY.heading}</SectionHeading>
      <div className={styles.houses} data-houses={groom !== null && bride !== null ? "both" : "one"}>
        {groom === null ? null : <House family={families.groom} label={COPY.groom} content={groom} />}
        {groom === null || bride === null ? null : <span className={styles.housesDivider} aria-hidden="true" />}
        {bride === null ? null : <House family={families.bride} label={COPY.bride} content={bride} />}
      </div>
    </section>
  );
}
