import type { InvitationViewModel, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { SE_DUYEN_V2_COPY } from "../copy";
import styles from "../se-duyen-v2.module.css";
import { photoFrameStyle } from "./photo-frame";

const COPY = SE_DUYEN_V2_COPY;

interface CoupleProps {
  readonly people: InvitationViewModel["people"];
  /** `viewModel.content.loveStory` when `sections.loveStory` allows it, else `null`. */
  readonly story: string | null;
  /** `portraitLead` — the large frame; `undefined` when the Project has none for it. */
  readonly leadPhoto: ResolvedMedia | undefined;
  /** `portraitAside` — the smaller overlapping frame; only shown beside the lead. */
  readonly asidePhoto: ResolvedMedia | undefined;
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
 * Both frames come from the Project's own template media slots. The aside is
 * positioned against the lead frame, so it exists only alongside it: without
 * a lead photograph neither frame is drawn, and without an aside the
 * stylesheet's approved solo composition applies (`.coupleFramesSolo` drops
 * the overhang's footroom, so the lead keeps its approved size and position).
 * No frame is ever filled from another slot or with demo art.
 */
export function Couple({ people, story, leadPhoto, asidePhoto, photoAlt }: CoupleProps) {
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

      {leadPhoto === undefined ? null : (
        <div className={`${styles.coupleFrames} ${asidePhoto === undefined ? styles.coupleFramesSolo : ""}`}>
          <div
            className={styles.couplePhotoMain}
            style={photoFrameStyle("coupleMain", leadPhoto)}
            role="img"
            aria-label={photoAlt}
          />
          {asidePhoto === undefined ? null : (
            <div
              className={styles.couplePhotoAside}
              style={photoFrameStyle("coupleAside", asidePhoto)}
              role="img"
              aria-label={photoAlt}
            />
          )}
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
