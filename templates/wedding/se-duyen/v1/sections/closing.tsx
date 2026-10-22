import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { SE_DUYEN_V1_COPY } from "../copy";
import styles from "../se-duyen-v1.module.css";

const COPY = SE_DUYEN_V1_COPY;

interface ClosingProps {
  readonly people: InvitationViewModel["people"];
}

/**
 * The approved last beat: the lacquer that has carried every section since
 * the hero finally darkens out, the couple's words, the tơ hồng drawn under
 * them as a single thread, and their names signed in the same gilt the cover
 * opened with — the invitation closes on the two names it opened on.
 *
 * The names come from the central variant resolver, so the signature order
 * follows the variant exactly as the cover and the couple page do
 * (CLAUDE.md §5): COMMON and GROOM sign with the groom first, BRIDE with the
 * bride first.
 *
 * The closing photograph (`.closingPhoto`) is approved art direction waiting
 * on Se Duyên's template media slots in SD-V1-02; no frame is ever filled
 * with demo art. The thank-you wording is fixed template copy because the
 * canonical content contract has no closing-message field — making it
 * customer-editable is a scoped product decision, not a renderer change.
 */
export function Closing({ people }: ClosingProps) {
  return (
    <section className={styles.closing} aria-labelledby="sd-closing-eyebrow">
      <span className={styles.closingGlow} aria-hidden="true" />

      <div className={styles.closingHead}>
        <p className={styles.closingEyebrow} id="sd-closing-eyebrow">
          {COPY.closing.eyebrow}
        </p>
        <span className={styles.closingRule} aria-hidden="true" />
      </div>

      <p className={styles.closingMessage}>{COPY.closing.message}</p>

      <div>
        <span className={styles.closingThread} aria-hidden="true" />

        <p className={styles.closingSign}>
          <span className={styles.closingSignName}>{people.primary.name}</span>
          <span className={styles.closingSignAmp} aria-hidden="true">
            &amp;
          </span>
          <span className={styles.closingSignName}>{people.secondary.name}</span>
        </p>
      </div>
    </section>
  );
}
