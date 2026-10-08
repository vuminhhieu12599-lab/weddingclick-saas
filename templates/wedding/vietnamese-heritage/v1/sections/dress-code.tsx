import type { ViewModelDressCode } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";

const COPY = VIETNAMESE_HERITAGE_V1_COPY.dressCode;

/**
 * Task 029 Dress Code (RF7 Dress Code amendment): the gold rule with its
 * diamond, the heading, the canonical description and every swatch in the
 * given order (the row wraps; no cap), each painted with its re-validated
 * lowercase `#rrggbb` ViewModel colour. An absent part renders nothing.
 */
export function DressCode({ dressCode }: { dressCode: ViewModelDressCode }) {
  const { description, swatches } = dressCode;

  return (
    <section className={styles.dressCode} aria-labelledby="vh-dress-code-heading">
      <span className={styles.dressRule} aria-hidden="true">
        <span className={styles.dressRuleDiamond} />
      </span>
      <h2 id="vh-dress-code-heading" className={styles.dressTitle}>
        {COPY.heading}
      </h2>
      {description !== null ? <p className={styles.dressCodeText}>{description}</p> : null}
      {swatches.length > 0 ? (
        <ul className={styles.dressCodeSwatches}>
          {swatches.map((swatch) => (
            <li key={swatch.id} className={styles.dressCodeSwatch} style={{ backgroundColor: swatch.color }}>
              <span className={styles.srOnly}>
                {COPY.swatchLabel} {swatch.color}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
