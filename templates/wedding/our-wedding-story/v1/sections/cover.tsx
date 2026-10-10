import type { ReactNode } from "react";

import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { OUR_WEDDING_STORY_V1_COPY } from "../copy";
import styles from "../our-wedding-story-v1.module.css";
import { formatDottedDate } from "./date-text";
import { MediaImage } from "./media-image";

const COPY = OUR_WEDDING_STORY_V1_COPY;

interface CoverProps {
  people: InvitationViewModel["people"];
  ceremonyDate: EventDateTimePresentationV1;
  /** `templateSlots.coverPhoto[0]` when `RESOLVED`; otherwise the typographic cover. */
  photo: ResolvedMedia | undefined;
  /** The authorized overlay's free-form display name, verbatim; absent when not personalized. */
  guestDisplayName: string | undefined;
  /** The island-owned "Mở thiệp" button, or the scroll hint once opened. */
  action: ReactNode;
}

/**
 * Visual Freeze v1 cover (page 01): masthead "A Love Story · DD.MM.YYYY",
 * "OUR WEDDING" with the script "Story", the framed cover photo (3:4, 4:5 on
 * wider phones), then the couple in resolver order, "weekday • DD.MM.YYYY",
 * "Thân gửi <guest>" only for a personalized guest, and the action. Without
 * a resolved `coverPhoto` the names carry the cover in a framed typographic
 * panel (no substitute image). There is no "Cover story" badge.
 */
export function Cover({ people, ceremonyDate, photo, guestDisplayName, action }: CoverProps) {
  const date = formatDottedDate(ceremonyDate);
  return (
    <section className={photo === undefined ? `${styles.cover} ${styles.coverTextOnly}` : styles.cover} aria-label={COPY.cover.label} data-photo={photo === undefined ? "absent" : "present"}>
      <header className={styles.masthead}>
        <div className={styles.mastheadMeta}>
          <span>{COPY.cover.mastheadKicker}</span>
          <span>{date}</span>
        </div>
        <p className={styles.mastheadTitle}>
          <span className={styles.mastheadWord}>{COPY.cover.mastheadWord}</span>
          <span className={styles.mastheadScript}>{COPY.cover.mastheadScript}</span>
        </p>
        <div className={styles.mastheadRule} aria-hidden="true" />
      </header>

      {photo === undefined ? null : (
        <div className={styles.coverFigure}>
          <div className={`${styles.photo} ${styles.coverPhoto}`}>
            <MediaImage
              media={photo}
              alt={`${COPY.cover.photoAlt} ${people.primary.name} ${COPY.a11y.and} ${people.secondary.name}`}
              className={styles.fillImage}
              eager
            />
          </div>
          <span className={styles.coverFrame} aria-hidden="true" />
        </div>
      )}

      <div className={styles.coverText}>
        <h1 className={styles.coverNames}>
          <span className={styles.coverName}>{people.primary.name}</span>
          <span className={styles.coverAmp} aria-hidden="true">
            &amp;
          </span>
          <span className={styles.srOnly}>{COPY.a11y.and}</span>
          <span className={styles.coverName}>{people.secondary.name}</span>
        </h1>

        <p className={styles.coverDate}>
          <span>{ceremonyDate.weekday}</span>
          <span className={styles.coverDateDot} aria-hidden="true" />
          <span>{date}</span>
        </p>

        {guestDisplayName === undefined ? null : (
          <p className={styles.coverGuest} data-guest="personalized">
            <span className={styles.coverGuestLabel}>{COPY.cover.guestLabel}</span>
            <span className={styles.coverGuestName}>{guestDisplayName}</span>
          </p>
        )}

        <div className={styles.coverAction}>{action}</div>
      </div>
    </section>
  );
}
