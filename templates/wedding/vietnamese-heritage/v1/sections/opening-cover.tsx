import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import styles from "../vietnamese-heritage-v1.module.css";
import { CoupleName } from "./couple-name";
import { formatDottedDate } from "./date-text";
import { DecorImage } from "./decor";

const COPY = VIETNAMESE_HERITAGE_V1_COPY;

/** One red door: the full cover face, clipped to its half (Task 029 split-door construction). */
function Door({ side }: { side: "left" | "right" }) {
  return (
    <div className={styles.door} data-door={side}>
      <div className={styles.doorFace}>
        <span className={styles.doorFrame} />
        {(["Top", "Bottom"] as const).map((end) => (
          <DecorImage
            key={`left-${end}`}
            decor="borderLeft"
            className={`${styles.coverBorder} ${styles.coverBorderLeft} ${end === "Top" ? styles.coverBorderTop : styles.coverBorderBottom}`}
            eager
          />
        ))}
        {(["Top", "Bottom"] as const).map((end) => (
          <DecorImage
            key={`right-${end}`}
            decor="borderRight"
            className={`${styles.coverBorder} ${styles.coverBorderRight} ${end === "Top" ? styles.coverBorderTop : styles.coverBorderBottom}`}
            eager
          />
        ))}
        <DecorImage decor="floralTopLeft" className={`${styles.coverFloral} ${styles.coverFloralTopLeft}`} eager />
        <DecorImage decor="floralBottomRight" className={`${styles.coverFloral} ${styles.coverFloralBottomRight}`} eager />
      </div>
    </div>
  );
}

interface OpeningCoverProps {
  people: InvitationViewModel["people"];
  ceremonyDate: EventDateTimePresentationV1;
}

/**
 * Task 029 ceremonial red double-door cover, CLOSED state (VH-02A static
 * visual): lacquer paper, gold frame, ceremonial borders, florals, the cover
 * title, the canonical primary/secondary names (explicit side order), the
 * RF-05C weekday and date, the Song Hỷ medallion artwork and the hint.
 *
 * Structure for VH-02B: two decorative door layers (`data-door`) that the
 * opening island will part left/right, and one content layer above them.
 * The cover is an in-flow first panel sized with `svh` (fixed-height
 * fallback first), so nothing hides the invitation until that island
 * exists; there is no tap target yet.
 */
export function OpeningCover({ people, ceremonyDate }: OpeningCoverProps) {
  return (
    <header className={styles.opening} data-opening="closed" data-island="opening">
      <div className={styles.doors} aria-hidden="true">
        <Door side="left" />
        <Door side="right" />
      </div>
      <div className={styles.coverContent}>
        <p className={styles.coverTitle}>{COPY.opening.label}</p>
        <DecorImage decor="divider" className={styles.coverDivider} eager />
        <p className={styles.coverNames}>
          <CoupleName name={people.primary.name} />
          <span className={styles.coverAmp} aria-hidden="true">
            &amp;
          </span>
          <span className={styles.srOnly}>{COPY.a11y.and}</span>
          <CoupleName name={people.secondary.name} />
        </p>
        <p className={styles.coverDate}>
          <span className={styles.coverWeekday}>{ceremonyDate.weekday}</span>
          <span>{formatDottedDate(ceremonyDate)}</span>
        </p>
        <DecorImage decor="medallion" className={styles.coverMedallion} alt={COPY.a11y.songHy} eager />
        <p className={styles.coverHint}>{COPY.opening.hint}</p>
      </div>
    </header>
  );
}
