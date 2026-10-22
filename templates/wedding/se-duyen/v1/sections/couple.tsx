import type { InvitationViewModel, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { SE_DUYEN_V1_COPY } from "../copy";
import styles from "../se-duyen-v1.module.css";
import { photoFrameStyle } from "./photo-frame";

const COPY = SE_DUYEN_V1_COPY;

interface CoupleProps {
  readonly people: InvitationViewModel["people"];
  /** `viewModel.content.loveStory` when `sections.loveStory` allows it, else `null`. */
  readonly story: string | null;
  /** The couple's own frame; `undefined` when the Project has no photograph for it. */
  readonly photo: ResolvedMedia | undefined;
  readonly photoAlt: string;
}

/**
 * The approved couple page: photography leads, ornament stays out of the way.
 *
 * Who is primary and who is secondary is decided by the one central variant
 * resolver (`people.primarySide` / `people.secondarySide`): the groom leads
 * for COMMON and GROOM, the bride for BRIDE. This section only LABELS them,
 * and it labels them by each person's own explicit side — never by array
 * position (CLAUDE.md §5/§6).
 *
 * The supporting frame beside the main photograph (`.couplePhotoAside`) is
 * approved art direction waiting on Se Duyên's template media slots in
 * SD-V1-02; until then the composition is the approved solo one, which the
 * stylesheet already handles, and no frame is ever filled with demo art.
 */
export function Couple({ people, story, photo, photoAlt }: CoupleProps) {
  const primaryRole = COPY.roleLabel[people.primary.side];
  const secondaryRole = COPY.roleLabel[people.secondary.side];
  const storyText = story?.trim() ?? "";

  return (
    <section className={styles.couple} aria-labelledby="sd-couple-heading">
      <div className={styles.coupleHead}>
        <p className={styles.coupleEyebrow}>{COPY.couple.eyebrow}</p>
        <h2 className={styles.coupleHeading} id="sd-couple-heading">
          {primaryRole} &amp; {secondaryRole}
        </h2>
      </div>

      {photo === undefined ? null : (
        <div className={`${styles.coupleFrames} ${styles.coupleFramesSolo}`}>
          <div
            className={styles.couplePhotoMain}
            style={photoFrameStyle("coupleMain", photo)}
            role="img"
            aria-label={photoAlt}
          />
        </div>
      )}

      <div className={styles.coupleNames}>
        <span className={styles.coupleRow}>
          <span className={styles.coupleRole}>{primaryRole}</span>
          <span className={styles.coupleName}>{people.primary.name}</span>
        </span>

        <span className={styles.coupleAmp} aria-hidden="true" />

        <span className={styles.coupleRow}>
          <span className={styles.coupleRole}>{secondaryRole}</span>
          <span className={styles.coupleName}>{people.secondary.name}</span>
        </span>
      </div>

      {storyText === "" ? null : (
        <div>
          <p className={styles.coupleStory}>{storyText}</p>
          <span className={styles.coupleLotus} aria-hidden="true" />
        </div>
      )}
    </section>
  );
}
