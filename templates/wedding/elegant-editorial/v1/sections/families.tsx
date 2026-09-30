import type { InvitationViewModel, ViewModelFamily } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";
import { decorAssetSrc } from "./decor";

const COPY = ELEGANT_EDITORIAL_V1_COPY.families;

interface FamiliesProps {
  families: InvitationViewModel["families"];
}

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function hasParentLine(family: ViewModelFamily): boolean {
  return present(family.father) || present(family.mother);
}

/**
 * Task029 families composition (Design Baseline B5 item 7): the gold
 * line–❧–line ornament, then two columns around a central gold divider,
 * in ViewModel display order `primary` then `secondary` (RF4). Only the
 * canonical parent names are shown and a null or blank line is omitted; no
 * family address is shown in this renderer. The side label comes from the
 * family's explicit `side`, never its position (RF5). A family with no
 * parent line is not shown, so no label ever sits over empty content. The
 * section heading is an accessible name only.
 */
export function Families({ families }: FamiliesProps) {
  const shown = [families.primary, families.secondary].filter(hasParentLine);
  if (shown.length === 0) {
    return null;
  }

  return (
    <section className={styles.familiesBand} aria-labelledby="ee-families-heading">
      <h2 id="ee-families-heading" className={styles.srOnly}>
        {COPY.heading}
      </h2>
      <div className={styles.familyOrnament} aria-hidden="true">
        <span className={styles.familyOrnamentLine} />
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed v1 decor file, rendered at its designed size */}
        <img className={styles.familyOrnamentMark} src={decorAssetSrc("ornament-fleuron.svg")} alt="" width={20} height={15} />
        <span className={styles.familyOrnamentLine} />
      </div>
      <div className={styles.families}>
        {shown.map((family, index) => (
          <div key={family.side} className={styles.familyColumn} data-side={family.side}>
            {index > 0 ? <span className={styles.familyDivider} aria-hidden="true" /> : null}
            <h3 className={styles.familySide}>{COPY.labelBySide[family.side]}</h3>
            {present(family.father) ? <p className={styles.familyName}>{family.father}</p> : null}
            {present(family.mother) ? <p className={styles.familyName}>{family.mother}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
