import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import styles from "../our-wedding-story-v1.module.css";
import { formatDottedDate } from "./date-text";
import { MediaImage } from "./media-image";
import { SectionHead } from "./section-head";

const COPY = OUR_WEDDING_STORY_V1_COPY;

function Message() {
  return (
    <p className={styles.thanksMessage}>
      {COPY.thankYou.message.map((line, index) => (
        <span key={line}>
          {index === 0 ? null : <br />}
          {line}
        </span>
      ))}
    </p>
  );
}

function Signature({ people, date }: { people: InvitationViewModel["people"]; date: string }) {
  return (
    <div className={styles.thanksSignature}>
      <span>
        {people.primary.name} &amp; {people.secondary.name}
      </span>
      <span className={styles.thanksSignatureDate}>{date}</span>
    </div>
  );
}

interface ThankYouProps {
  number: string;
  people: InvitationViewModel["people"];
  ceremonyDate: EventDateTimePresentationV1;
  /** `templateSlots.thankYouPhoto[0]` when `RESOLVED`; otherwise the framed text panel. */
  photo: ResolvedMedia | undefined;
}

/**
 * Visual Freeze v1 "Thank You": the full-width 4:5 photo with its lower shade
 * and the script "Thank you" on the photo, then the fixed closing message and
 * the signature (resolver order, DD.MM.YYYY). Without a resolved
 * `thankYouPhoto` the script, rule, message and signature sit in the framed
 * champagne panel (no substitute image).
 */
export function ThankYou({ number, people, ceremonyDate, photo }: ThankYouProps) {
  const date = formatDottedDate(ceremonyDate);
  return (
    <section className={`${styles.section} ${styles.thanks}`} aria-labelledby="ows-thanks-heading" data-photo={photo === undefined ? "absent" : "present"}>
      <SectionHead number={number} kicker={COPY.thankYou.kicker} headingId="ows-thanks-heading" />
      {photo === undefined ? (
        <div className={styles.thanksTextOnly}>
          <span className={styles.thanksScript} aria-hidden="true">
            {COPY.thankYou.script}
          </span>
          <span className={styles.thanksTextRule} aria-hidden="true" />
          <Message />
          <Signature people={people} date={date} />
        </div>
      ) : (
        <>
          <div className={styles.thanksFigure}>
            <div className={`${styles.photo} ${styles.thanksPhoto}`}>
              <MediaImage
                media={photo}
                alt={`${COPY.thankYou.photoAlt} ${people.primary.name} ${COPY.a11y.and} ${people.secondary.name}`}
                className={styles.fillImage}
              />
            </div>
            <span className={styles.thanksShade} aria-hidden="true" />
            <span className={styles.thanksScriptOnPhoto} aria-hidden="true">
              {COPY.thankYou.script}
            </span>
          </div>
          <div className={styles.thanksText}>
            <Message />
            <Signature people={people} date={date} />
          </div>
        </>
      )}
    </section>
  );
}
