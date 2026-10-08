import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { VIETNAMESE_HERITAGE_V1_COPY } from "../copy";
import { OpeningInteraction } from "../interactive/opening-interaction";
import styles from "../vietnamese-heritage-v1.module.css";
import { CoupleName } from "./couple-name";
import { formatDottedDate } from "./date-text";
import { DecorImage } from "./decor";

const COPY = VIETNAMESE_HERITAGE_V1_COPY;

/** The cover text and medallion, drawn on each door face so the medallion splits with the doors. */
function CoverContent({ people, ceremonyDate }: OpeningCoverProps) {
  return (
    <div className={styles.coverContent}>
      <div className={styles.coverText}>
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
      </div>
      <span className={styles.coverMedallionWrap}>
        <DecorImage decor="medallion" className={styles.coverMedallion} alt={COPY.a11y.songHy} eager />
      </span>
      {/* Visual hint only: the opening button carries the same words as its accessible name. */}
      <p className={styles.coverHint} aria-hidden="true">
        {COPY.opening.hint}
      </p>
    </div>
  );
}

/**
 * One red door: the full cover face, clipped to its half (Task 029 split-door
 * construction), so the closed cover is one seamless composition. The right
 * door repeats the face purely for the visual split and is hidden from
 * assistive technology.
 */
function Door({ side, content }: { side: "left" | "right"; content: OpeningCoverProps }) {
  return (
    <div className={styles.door} data-door={side} aria-hidden={side === "right" ? true : undefined}>
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
        <CoverContent {...content} />
      </div>
      <span className={styles.doorEdge} aria-hidden="true" />
    </div>
  );
}

interface OpeningCoverProps {
  people: InvitationViewModel["people"];
  ceremonyDate: EventDateTimePresentationV1;
}

/**
 * Task 029 ceremonial red double-door cover (VH-02A visual, VH-02B-M1
 * interaction): lacquer paper, gold frame, ceremonial borders, florals, the
 * cover title, the canonical primary/secondary names (explicit side order),
 * the RF-05C weekday and date, the Song Hỷ medallion artwork and the hint.
 *
 * Two door layers (`data-door`), each carrying the whole face clipped to its
 * half; the opening island owns the phase, the "Chạm để mở thiệp" button and
 * the split (docs/DECISIONS.md "VH-02B-M1"). `onOpen` is the start-on-open
 * music hook, passed only when music exists.
 */
export function OpeningCover({ people, ceremonyDate, onOpen }: OpeningCoverProps & { onOpen?: () => void }) {
  const content: OpeningCoverProps = { people, ceremonyDate };
  return (
    <OpeningInteraction {...(onOpen === undefined ? {} : { onOpen })}>
      <div className={styles.doors}>
        <Door side="left" content={content} />
        <Door side="right" content={content} />
      </div>
    </OpeningInteraction>
  );
}
