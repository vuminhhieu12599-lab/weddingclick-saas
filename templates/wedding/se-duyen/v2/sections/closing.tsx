import type { InvitationViewModel, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { SE_DUYEN_V2_COPY } from "../copy";
import styles from "../se-duyen-v2.module.css";
import { photoFrameStyle } from "./photo-frame";

const COPY = SE_DUYEN_V2_COPY;

interface ClosingProps {
  readonly people: InvitationViewModel["people"];
  /** `closingPhoto`; `undefined` when the Project has no photograph for it. */
  readonly photo: ResolvedMedia | undefined;
  readonly photoAlt: string;
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
 * The closing photograph rises out of the darkening lacquer under an arch
 * with no frame around it, masked away at the foot so the red of the studio
 * backdrop becomes the red of the page. It is the Project's own
 * `closingPhoto` slot and is omitted entirely when there is none — never
 * filled from another slot or with demo art.
 *
 * The thank-you wording is fixed template copy because the canonical content
 * contract has no closing-message field — making it customer-editable is a
 * scoped product decision, not a renderer change.
 */
export function Closing({ people, photo, photoAlt }: ClosingProps) {
  return (
    <section className={styles.closing} aria-labelledby="sd-closing-eyebrow">
      <span className={styles.closingGlow} aria-hidden="true" />

      <div className={styles.closingHead}>
        <p className={styles.closingEyebrow} id="sd-closing-eyebrow">
          {COPY.closing.eyebrow}
        </p>
        <span className={styles.closingRule} aria-hidden="true" />
      </div>

      {photo === undefined ? null : (
        <div className={styles.closingPhoto} style={photoFrameStyle("closing", photo)} role="img" aria-label={photoAlt} />
      )}

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
