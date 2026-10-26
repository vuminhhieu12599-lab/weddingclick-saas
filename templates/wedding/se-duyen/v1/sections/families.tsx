import type { InvitationViewModel, ViewModelFamily } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { SE_DUYEN_V1_COPY } from "../copy";
import styles from "../se-duyen-v1.module.css";

const COPY = SE_DUYEN_V1_COPY;

/** One house's own names, in the order the Project holds them. */
function parentsOf(family: ViewModelFamily): string[] {
  return [family.father, family.mother].map((name) => name?.trim() ?? "").filter((name) => name !== "");
}

/** A house with no name at all is dropped rather than printed as an empty column. */
export function familyHasNames(family: ViewModelFamily): boolean {
  return parentsOf(family).length > 0;
}

interface FamiliesProps {
  readonly families: InvitationViewModel["families"];
}

/**
 * The approved "Hai Bên Gia Đình": two houses side by side with one gold
 * hairline between them and nothing boxed.
 *
 * BOTH SIDES STAY ON THE PAGE IN EVERY VARIANT. Only the order changes, and
 * which side leads comes from the central variant resolver
 * (`families.primary` / `families.secondary`): the groom's house for COMMON
 * and GROOM, the bride's for BRIDE. CLAUDE.md §5 forbids treating one side
 * as the only family on COMMON, and a Vietnamese invitation names both
 * houses whichever side it is sent from.
 *
 * THE FAMILY'S OWN NAMES ARE PRINTED DIRECTLY UNDER "Nhà Trai" / "Nhà Gái",
 * each on its own line, exactly as the Project stores them — the honorific
 * is part of the name the customer entered, so nothing is prefixed, titled
 * or reworded here. The collective "Song thân" is deliberately not used
 * (Product Owner rule) and must not be reintroduced.
 *
 * Nothing is invented and nothing is padded: a side contributes only the
 * names it actually has. With a single house the grid collapses to one
 * centred column and no divider is drawn, so nothing hints at a missing
 * family.
 */
export function Families({ families }: FamiliesProps) {
  const houses = [families.primary, families.secondary].filter(familyHasNames);
  if (houses.length === 0) return null;

  return (
    <section className={styles.houses} aria-labelledby="sd-houses-heading">
      <span className={styles.housesWatermark} aria-hidden="true" />

      <div className={styles.housesHead}>
        <p className={styles.housesEyebrow}>{COPY.families.eyebrow}</p>
        <h2 className={styles.housesHeading} id="sd-houses-heading">
          {COPY.families.heading}
        </h2>
        <span className={styles.housesRule} aria-hidden="true" />
      </div>

      <div className={styles.housesGrid} data-single={houses.length === 1 ? "true" : undefined}>
        {houses.map((family) => {
          const address = family.address?.trim() ?? "";
          return (
            <div key={family.side} className={styles.house} data-side={family.side}>
              <h3 className={styles.houseLabel}>{COPY.sideLabel[family.side]}</h3>

              <p className={styles.houseParents}>
                {parentsOf(family).map((name) => (
                  <span key={name} className={styles.houseParent}>
                    {name}
                  </span>
                ))}
              </p>

              {address === "" ? null : <p className={styles.houseAddress}>{address}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
