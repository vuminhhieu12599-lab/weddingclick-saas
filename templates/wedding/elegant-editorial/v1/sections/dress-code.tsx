import type { ViewModelDressCode } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import styles from "../elegant-editorial-v1.module.css";

const COPY = ELEGANT_EDITORIAL_V1_COPY.dressCode;

interface DressCodeProps {
  /** `viewModel.content.dressCode`, already ordered and validated; rendered as given. */
  dressCode: ViewModelDressCode;
}

/**
 * Task029 Dress Code (docs/DECISIONS.md RF7 Dress Code amendment): the sage
 * band with the visible "Dress code" kicker, the plain-text description and
 * the centred row of circular swatches. Canonical project data only: any
 * number of swatches (the row wraps), each painted with its ViewModel
 * colour, which is a re-validated lowercase `#rrggbb` (never other CSS).
 * Nothing is invented: an absent description or an empty swatch list simply
 * renders nothing for that part.
 */
export function DressCode({ dressCode }: DressCodeProps) {
  const { description, swatches } = dressCode;

  return (
    <section className={styles.dressCode} aria-labelledby="ee-dress-code-heading">
      <h2 id="ee-dress-code-heading" className={styles.sectionKicker}>
        {COPY.heading}
      </h2>
      {description !== null ? <p className={styles.dressCodeText}>{description}</p> : null}
      {swatches.length > 0 ? (
        <ul className={styles.dressCodeSwatches} aria-label={COPY.swatchesLabel}>
          {swatches.map((swatch) => (
            <li key={swatch.id} className={styles.dressCodeSwatch} style={{ backgroundColor: swatch.color }}>
              <span className={styles.srOnly}>{swatch.color}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
